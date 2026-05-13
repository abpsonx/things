from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.project import Project
from app.models.task import Task
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

    # 2. Task Stats (Across all projects user has access to)
    # Join Projects -> Organizations -> OrgMembers to ensure access
    task_base_query = (
        select(Task.status, func.count(Task.id))
        .join(Project)
        .join(Organization)
        .join(OrgMember)
        .where(OrgMember.user_id == current_user.id)
        .group_by(Task.status)
    )
    task_results = (await db.execute(task_base_query)).all()
    
    task_stats = {
        "todo": 0,
        "in_progress": 0,
        "completed": 0,
        "total": 0
    }
    
    for status, count in task_results:
        task_stats["total"] += count
        if status == "todo": task_stats["todo"] = count
        elif status == "in_progress": task_stats["in_progress"] = count
        elif status == "done": task_stats["completed"] = count

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

    return {
        "org_count": org_count,
        "project_count": project_count,
        "task_stats": task_stats,
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
        ]
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
