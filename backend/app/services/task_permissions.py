"""Who may edit a task.

Rules (per product decision):
- The task creator can edit.
- Workspace owner/manager can edit.
- Anyone else needs an approved TaskEditRequest (a standing grant).
Status/position changes (board moves) are NOT gated — handled by the caller.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.organization import OrgMember
from app.models.task_edit_request import TaskEditRequest


async def task_org_id(db: AsyncSession, task):
    if task.project_id:
        from app.models.project import Project
        res = await db.execute(select(Project.org_id).where(Project.id == task.project_id))
        return res.scalar_one_or_none()
    if task.team_id:
        from app.models.team import Team
        res = await db.execute(select(Team.org_id).where(Team.id == task.team_id))
        return res.scalar_one_or_none()
    return None


async def is_manager_or_creator(db: AsyncSession, task, user) -> bool:
    """Creator or workspace owner/manager — these can edit AND approve requests."""
    if str(task.created_by) == str(user.id):
        return True
    org_id = await task_org_id(db, task)
    if org_id:
        res = await db.execute(
            select(OrgMember.role).where(OrgMember.org_id == org_id, OrgMember.user_id == user.id)
        )
        if res.scalar_one_or_none() in ("owner", "manager"):
            return True
    return False


async def has_edit_grant(db: AsyncSession, task, user) -> bool:
    res = await db.execute(
        select(TaskEditRequest).where(
            TaskEditRequest.task_id == task.id,
            TaskEditRequest.requester_id == user.id,
            TaskEditRequest.status == "approved",
        )
    )
    return res.scalar_one_or_none() is not None


async def user_can_edit_task(db: AsyncSession, task, user) -> bool:
    if await is_manager_or_creator(db, task, user):
        return True
    return await has_edit_grant(db, task, user)
