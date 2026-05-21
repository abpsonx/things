"""Read-only activity log (audit trail) for a single task — project or team."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Any
from app.core.database import get_db
from app.models.user import User
from app.models.task import Task
from app.models.organization import OrgMember
from app.models.activity_log import ActivityLog
from app.dependencies import get_current_user

router = APIRouter(prefix="/tasks/{task_id}/activities", tags=["Task Activity"])


async def _resolve_org_id(db: AsyncSession, task: Task):
    if task.project_id:
        from app.models.project import Project
        res = await db.execute(select(Project.org_id).where(Project.id == task.project_id))
        return res.scalar_one_or_none()
    if task.team_id:
        from app.models.team import Team
        res = await db.execute(select(Team.org_id).where(Team.id == task.team_id))
        return res.scalar_one_or_none()
    return None


@router.get("", response_model=List[Any])
async def list_task_activities(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the change history for a task, newest first."""
    res = await db.execute(select(Task).where(Task.id == task_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    org_id = await _resolve_org_id(db, task)
    if org_id:
        member = await db.execute(
            select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
        )
        if not member.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Bukan anggota organisasi ini")

    res = await db.execute(
        select(ActivityLog)
        .options(selectinload(ActivityLog.user))
        .where(ActivityLog.entity_type == "task", ActivityLog.entity_id == task.id)
        .order_by(ActivityLog.created_at.desc())
    )
    logs = res.scalars().all()

    out = []
    for log in logs:
        meta = log.metadata_ or {}
        out.append({
            "id": str(log.id),
            "action": log.action,
            "summary": meta.get("summary") or [],
            "title": meta.get("title"),
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "user": {
                "id": str(log.user.id),
                "name": log.user.name,
                "avatar_url": log.user.avatar_url,
            } if log.user else None,
        })
    return out
