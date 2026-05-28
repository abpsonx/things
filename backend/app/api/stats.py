from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.project import Project
from app.models.task import Task
from app.models.event import Event, EventAttendee
from typing import Dict

router = APIRouter(prefix="/stats", tags=["Stats"])

@router.get("/dashboard")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get summarized statistics for the user's dashboard."""
    
    # 1. Organizations & Projects Count
    org_query = select(func.count(Organization.id)).join(OrgMember).where(OrgMember.user_id == current_user.id)
    org_count = (await db.execute(org_query)).scalar() or 0
    
    project_query = (
        select(func.count(Project.id))
        .join(Organization)
        .join(OrgMember)
        .where(OrgMember.user_id == current_user.id)
    )
    project_count = (await db.execute(project_query)).scalar() or 0

    # 2. Task Stats — ringkasan performa SEMUA task yang bisa diakses user:
    #    task project (di org tempat user jadi anggota) + task tim (di tim
    #    tempat user jadi anggota). Sebelumnya hanya menghitung task project.
    from app.models.team import TeamMember
    now = datetime.now(timezone.utc)

    task_stats = {"todo": 0, "in_progress": 0, "completed": 0, "total": 0, "overdue": 0}

    proj_task_q = (
        select(Task.status, func.count(Task.id))
        .join(Project, Task.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .join(OrgMember, OrgMember.org_id == Organization.id)
        .where(OrgMember.user_id == current_user.id)
        .group_by(Task.status)
    )
    team_task_q = (
        select(Task.status, func.count(Task.id))
        .join(TeamMember, TeamMember.team_id == Task.team_id)
        .where(TeamMember.user_id == current_user.id)
        .group_by(Task.status)
    )
    for q in (proj_task_q, team_task_q):
        for status, count in (await db.execute(q)).all():
            task_stats["total"] += count
            if status == "todo": task_stats["todo"] += count
            elif status == "in_progress": task_stats["in_progress"] += count
            elif status == "done": task_stats["completed"] += count

    # Overdue = punya deadline lewat & belum selesai (project + tim).
    overdue_proj_q = (
        select(func.count(Task.id))
        .join(Project, Task.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .join(OrgMember, OrgMember.org_id == Organization.id)
        .where(OrgMember.user_id == current_user.id, Task.status != "done",
               Task.due_date.is_not(None), Task.due_date < now)
    )
    overdue_team_q = (
        select(func.count(Task.id))
        .join(TeamMember, TeamMember.team_id == Task.team_id)
        .where(TeamMember.user_id == current_user.id, Task.status != "done",
               Task.due_date.is_not(None), Task.due_date < now)
    )
    task_stats["overdue"] = ((await db.execute(overdue_proj_q)).scalar() or 0) + \
                            ((await db.execute(overdue_team_q)).scalar() or 0)
    task_stats["completion_rate"] = round(task_stats["completed"] / task_stats["total"] * 100) if task_stats["total"] else 0

    # 2b. Priority breakdown (non-done tasks across project + team)
    priority_breakdown = {"high": 0, "medium": 0, "low": 0}
    for q in (
        select(Task.priority, func.count(Task.id))
        .join(Project, Task.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .join(OrgMember, OrgMember.org_id == Organization.id)
        .where(OrgMember.user_id == current_user.id, Task.status != "done")
        .group_by(Task.priority),
        select(Task.priority, func.count(Task.id))
        .join(TeamMember, TeamMember.team_id == Task.team_id)
        .where(TeamMember.user_id == current_user.id, Task.status != "done")
        .group_by(Task.priority),
    ):
        for prio, count in (await db.execute(q)).all():
            if prio in priority_breakdown:
                priority_breakdown[prio] += count

    # 2c. Weekly completion trend — last 8 weeks (Mon-Sun, using updated_at as
    # proxy for completion timestamp since we don't track a separate column).
    from datetime import timedelta
    weeks: list = []
    # Anchor "this week" to the Monday of `now`.
    today_local = now.date()
    monday_this_week = today_local - timedelta(days=today_local.weekday())
    for w in range(7, -1, -1):  # oldest first → newest last
        wk_start = monday_this_week - timedelta(weeks=w)
        wk_end = wk_start + timedelta(days=7)
        wk_start_dt = datetime(wk_start.year, wk_start.month, wk_start.day, tzinfo=timezone.utc)
        wk_end_dt = datetime(wk_end.year, wk_end.month, wk_end.day, tzinfo=timezone.utc)
        proj_done = (await db.execute(
            select(func.count(Task.id))
            .join(Project, Task.project_id == Project.id)
            .join(Organization, Project.org_id == Organization.id)
            .join(OrgMember, OrgMember.org_id == Organization.id)
            .where(OrgMember.user_id == current_user.id,
                   Task.status == "done",
                   Task.updated_at >= wk_start_dt,
                   Task.updated_at < wk_end_dt)
        )).scalar() or 0
        team_done = (await db.execute(
            select(func.count(Task.id))
            .join(TeamMember, TeamMember.team_id == Task.team_id)
            .where(TeamMember.user_id == current_user.id,
                   Task.status == "done",
                   Task.updated_at >= wk_start_dt,
                   Task.updated_at < wk_end_dt)
        )).scalar() or 0
        weeks.append({"week_start": wk_start.isoformat(), "completed": proj_done + team_done})

    # 3. Recent Activity (Last 5)
    from app.models.activity_log import ActivityLog
    activity_query = (
        select(ActivityLog)
        .join(Organization)
        .join(OrgMember)
        .where(OrgMember.user_id == current_user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(5)
    )
    activities = (await db.execute(activity_query)).scalars().all()

    # 4. My upcoming tasks (assigned to me, not done, sorted by deadline asc).
    # A task can live on a project OR a team — eager-load both so we always
    # have a navigation target.
    now = datetime.now(timezone.utc)
    my_tasks_query = (
        select(Task)
        .options(selectinload(Task.project), selectinload(Task.team))
        .where(Task.assignee_id == current_user.id)
        .where(Task.status != "done")
        .order_by(Task.due_date.asc().nulls_last(), Task.created_at.desc())
        .limit(8)
    )
    my_tasks = (await db.execute(my_tasks_query)).scalars().all()
    my_tasks_payload = []
    for t in my_tasks:
        project_ref = None
        team_ref = None
        if t.project:
            project_ref = {
                "id": str(t.project.id),
                "name": t.project.name,
                "org_id": str(t.project.org_id),
            }
        if t.team:
            team_ref = {
                "id": str(t.team.id),
                "name": t.team.name,
                "org_id": str(t.team.org_id),
            }
        my_tasks_payload.append({
            "id": str(t.id),
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "is_overdue": bool(t.due_date and t.due_date < now and t.status != "done"),
            "project": project_ref,
            "team": team_ref,
        })

    # 5. Upcoming meetings — events from now where user is creator or attendee
    upcoming_events_query = (
        select(Event)
        .options(selectinload(Event.project), selectinload(Event.attendees))
        .where(Event.start_at >= now)
        .where(
            or_(
                Event.created_by == current_user.id,
                Event.id.in_(
                    select(EventAttendee.event_id).where(EventAttendee.user_id == current_user.id)
                ),
            )
        )
        .order_by(Event.start_at.asc())
        .limit(5)
    )
    upcoming_events = (await db.execute(upcoming_events_query)).scalars().all()
    meetings_payload = [
        {
            "id": str(e.id),
            "title": e.title,
            "start_at": e.start_at.isoformat() if e.start_at else None,
            "end_at": e.end_at.isoformat() if e.end_at else None,
            "attendee_count": len(e.attendees or []),
            "project": {
                "id": str(e.project.id),
                "name": e.project.name,
                "org_id": str(e.project.org_id),
            } if e.project else None,
        }
        for e in upcoming_events
    ]

    return {
        "org_count": org_count,
        "project_count": project_count,
        "task_stats": task_stats,
        "my_tasks": my_tasks_payload,
        "upcoming_meetings": meetings_payload,
        "recent_activities": [
            {
                "id": str(a.id),
                "action": a.action,
                "entity_type": a.entity_type,
                "created_at": a.created_at.isoformat(),
                "metadata": a.metadata_
            } for a in activities
        ],
        "chart_data": [
            {"name": "To Do", "value": task_stats["todo"], "fill": "#94a3b8"},
            {"name": "In Progress", "value": task_stats["in_progress"], "fill": "#3b82f6"},
            {"name": "Completed", "value": task_stats["completed"], "fill": "#22c55e"},
        ],
        "priority_breakdown": priority_breakdown,
        "weekly_completion": weeks,
    }


@router.get("/project/{project_id}")
async def get_project_stats(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get performance stats for a specific project."""
    
    # Verify access
    result = await db.execute(
        select(Project)
        .join(Organization)
        .join(OrgMember)
        .where(Project.id == project_id, OrgMember.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        return {"error": "Project not found or access denied"}

    # 1. Task Breakdown
    task_query = (
        select(Task.status, func.count(Task.id))
        .where(Task.project_id == project_id)
        .group_by(Task.status)
    )
    task_results = (await db.execute(task_query)).all()
    
    stats = {"todo": 0, "in_progress": 0, "done": 0, "total": 0}
    for status, count in task_results:
        stats["total"] += count
        if status in stats: stats[status] = count

    # 2. Assignee Performance
    assignee_query = (
        select(User.name, func.count(Task.id))
        .join(Task, Task.assignee_id == User.id)
        .where(Task.project_id == project_id, Task.status == "done")
        .group_by(User.name)
    )
    assignee_results = (await db.execute(assignee_query)).all()
    performance = [{"name": r[0], "completed": r[1]} for r in assignee_results]

    return {
        "task_summary": stats,
        "performance": performance,
        "completion_rate": (stats["done"] / stats["total"] * 100) if stats["total"] > 0 else 0,
        "chart_data": [
            {"name": "To Do", "value": stats["todo"]},
            {"name": "In Progress", "value": stats["in_progress"]},
            {"name": "Done", "value": stats["done"]},
        ]
    }


@router.get("/my-tasks")
async def list_my_tasks(
    include_done: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All tasks assigned to me across every workspace.

    Used by the "My Work" page and the global calendar. Archived tasks are
    excluded; done tasks are excluded unless include_done=true.
    """
    now = datetime.now(timezone.utc)
    query = (
        select(Task)
        .options(selectinload(Task.project), selectinload(Task.team))
        .where(Task.assignee_id == current_user.id)
        .where(Task.archived_at.is_(None))
        .order_by(Task.due_date.asc().nulls_last(), Task.created_at.desc())
    )
    if not include_done:
        query = query.where(Task.status != "done")

    rows = (await db.execute(query)).scalars().all()
    out = []
    for t in rows:
        project_ref = None
        team_ref = None
        if t.project:
            project_ref = {"id": str(t.project.id), "name": t.project.name, "org_id": str(t.project.org_id)}
        if t.team:
            team_ref = {"id": str(t.team.id), "name": t.team.name, "org_id": str(t.team.org_id)}
        out.append({
            "id": str(t.id),
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "is_overdue": bool(t.due_date and t.due_date < now and t.status != "done"),
            "project": project_ref,
            "team": team_ref,
        })
    return out
