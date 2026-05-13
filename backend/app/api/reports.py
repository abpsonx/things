"""Reporting / Analytics API endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, text, and_
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.project import Project, ProjectMember
from app.models.task import Task
from app.models.activity_log import ActivityLog

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/project/{project_id}")
async def get_project_report(
    project_id: str,
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed performance report for a project."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    # 1. Task breakdown by status
    status_query = (
        select(Task.status, func.count(Task.id))
        .where(Task.project_id == project_id)
        .group_by(Task.status)
    )
    status_results = (await db.execute(status_query)).all()
    task_by_status = {"todo": 0, "in_progress": 0, "done": 0}
    for status, count in status_results:
        task_by_status[status] = count

    total_tasks = sum(task_by_status.values())
    completion_rate = round((task_by_status["done"] / total_tasks * 100), 1) if total_tasks > 0 else 0

    # 2. Task breakdown by priority
    priority_query = (
        select(Task.priority, func.count(Task.id))
        .where(Task.project_id == project_id)
        .group_by(Task.priority)
    )
    priority_results = (await db.execute(priority_query)).all()
    task_by_priority = {"low": 0, "medium": 0, "high": 0}
    for priority, count in priority_results:
        if priority:
            task_by_priority[priority] = count

    # 3. Tasks per member (assignee)
    member_query = (
        select(User.name, Task.status, func.count(Task.id))
        .join(Task, Task.assignee_id == User.id)
        .where(Task.project_id == project_id)
        .group_by(User.name, Task.status)
    )
    member_results = (await db.execute(member_query)).all()
    members_map = {}
    for name, status, count in member_results:
        if name not in members_map:
            members_map[name] = {"name": name, "todo": 0, "in_progress": 0, "done": 0, "total": 0}
        members_map[name][status] = count
        members_map[name]["total"] += count
    
    members_performance = sorted(members_map.values(), key=lambda x: x["done"], reverse=True)

    # 4. Overdue tasks
    overdue_query = (
        select(func.count(Task.id))
        .where(
            Task.project_id == project_id,
            Task.due_date < now,
            Task.status != "done"
        )
    )
    overdue_count = (await db.execute(overdue_query)).scalar() or 0

    # 5. Tasks completed in period (trend data, grouped by day)
    trend_query = (
        select(
            func.date_trunc('day', Task.updated_at).label("day"),
            func.count(Task.id)
        )
        .where(
            Task.project_id == project_id,
            Task.status == "done",
            Task.updated_at >= since
        )
        .group_by("day")
        .order_by("day")
    )
    trend_results = (await db.execute(trend_query)).all()
    completion_trend = [
        {"date": day.strftime("%Y-%m-%d"), "completed": count}
        for day, count in trend_results
    ]

    # 6. Activity count in period
    activity_count_query = (
        select(func.count(ActivityLog.id))
        .where(
            ActivityLog.project_id == project_id,
            ActivityLog.created_at >= since
        )
    )
    activity_count = (await db.execute(activity_count_query)).scalar() or 0

    # 7. Recent activity breakdown by action
    action_query = (
        select(ActivityLog.action, func.count(ActivityLog.id))
        .where(
            ActivityLog.project_id == project_id,
            ActivityLog.created_at >= since
        )
        .group_by(ActivityLog.action)
        .order_by(func.count(ActivityLog.id).desc())
        .limit(10)
    )
    action_results = (await db.execute(action_query)).all()
    activity_breakdown = [{"action": action, "count": count} for action, count in action_results]

    return {
        "project_id": project_id,
        "period_days": days,
        "summary": {
            "total_tasks": total_tasks,
            "completed": task_by_status["done"],
            "in_progress": task_by_status["in_progress"],
            "todo": task_by_status["todo"],
            "overdue": overdue_count,
            "completion_rate": completion_rate,
            "activity_count": activity_count,
        },
        "task_by_status": [
            {"name": "To Do", "value": task_by_status["todo"], "fill": "#94a3b8"},
            {"name": "In Progress", "value": task_by_status["in_progress"], "fill": "#3b82f6"},
            {"name": "Done", "value": task_by_status["done"], "fill": "#22c55e"},
        ],
        "task_by_priority": [
            {"name": "Low", "value": task_by_priority["low"], "fill": "#22c55e"},
            {"name": "Medium", "value": task_by_priority["medium"], "fill": "#f59e0b"},
            {"name": "High", "value": task_by_priority["high"], "fill": "#ef4444"},
        ],
        "members_performance": members_performance,
        "completion_trend": completion_trend,
        "activity_breakdown": activity_breakdown,
    }


@router.get("/organization/{org_id}")
async def get_org_report(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get organization-wide summary report."""
    # Projects in org
    projects_query = select(Project).where(Project.org_id == org_id)
    projects = (await db.execute(projects_query)).scalars().all()

    project_summaries = []
    for project in projects:
        # Task counts per project
        status_query = (
            select(Task.status, func.count(Task.id))
            .where(Task.project_id == project.id)
            .group_by(Task.status)
        )
        status_results = (await db.execute(status_query)).all()
        stats = {"todo": 0, "in_progress": 0, "done": 0}
        for status, count in status_results:
            stats[status] = count
        
        total = sum(stats.values())
        project_summaries.append({
            "id": str(project.id),
            "name": project.name,
            "total_tasks": total,
            "completed": stats["done"],
            "in_progress": stats["in_progress"],
            "todo": stats["todo"],
            "completion_rate": round((stats["done"] / total * 100), 1) if total > 0 else 0,
        })

    # Overall totals
    total_tasks = sum(p["total_tasks"] for p in project_summaries)
    total_done = sum(p["completed"] for p in project_summaries)

    # Member count
    member_count_query = select(func.count(OrgMember.id)).where(OrgMember.org_id == org_id)
    member_count = (await db.execute(member_count_query)).scalar() or 0

    return {
        "org_id": org_id,
        "total_projects": len(projects),
        "total_members": member_count,
        "total_tasks": total_tasks,
        "total_completed": total_done,
        "overall_completion_rate": round((total_done / total_tasks * 100), 1) if total_tasks > 0 else 0,
        "projects": sorted(project_summaries, key=lambda x: x["completion_rate"], reverse=True),
    }
