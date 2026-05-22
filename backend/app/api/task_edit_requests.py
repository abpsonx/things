"""Request/approve edit access to a task (project or team)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Any
from app.core.database import get_db
from app.models.user import User
from app.models.task import Task
from app.models.task_edit_request import TaskEditRequest
from app.dependencies import get_current_user
from app.services.task_permissions import is_manager_or_creator, user_can_edit_task, task_org_id

router = APIRouter(prefix="/tasks/{task_id}/edit-requests", tags=["Task Edit Access"])


async def _get_task(db: AsyncSession, task_id: str) -> Task:
    res = await db.execute(select(Task).where(Task.id == task_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")
    return task


def _serialize(r: TaskEditRequest) -> dict:
    return {
        "id": str(r.id),
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "requester": {
            "id": str(r.requester.id),
            "name": r.requester.name,
            "avatar_url": r.requester.avatar_url,
        } if r.requester else None,
    }


@router.get("", response_model=Any)
async def get_edit_access(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's edit access + (for approvers) pending requests."""
    task = await _get_task(db, task_id)
    can_approve = await is_manager_or_creator(db, task, current_user)
    can_edit = await user_can_edit_task(db, task, current_user)

    res = await db.execute(
        select(TaskEditRequest)
        .options(selectinload(TaskEditRequest.requester))
        .where(TaskEditRequest.task_id == task.id)
        .order_by(TaskEditRequest.created_at.desc())
    )
    rows = res.scalars().all()

    my = next((r for r in rows if str(r.requester_id) == str(current_user.id)), None)
    pending = [_serialize(r) for r in rows if r.status == "pending"]

    return {
        "can_edit": can_edit,
        "can_approve": can_approve,
        "my_request": _serialize(my) if my else None,
        "pending_requests": pending if can_approve else [],
    }


@router.post("", response_model=Any)
async def request_edit(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(db, task_id)
    if await user_can_edit_task(db, task, current_user):
        return {"status": "already_allowed"}

    # Reuse an existing open/approved row instead of stacking duplicates.
    res = await db.execute(
        select(TaskEditRequest).where(
            TaskEditRequest.task_id == task.id,
            TaskEditRequest.requester_id == current_user.id,
            TaskEditRequest.status.in_(["pending", "approved"]),
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        return {"status": existing.status}

    req = TaskEditRequest(task_id=task.id, requester_id=current_user.id, status="pending")
    db.add(req)
    await db.flush()

    # Notify the task creator.
    from app.services.notification import notify_user
    org_id = await task_org_id(db, task)
    await notify_user(
        db,
        user_id=str(task.created_by),
        type="task_edit_request",
        title="Permintaan izin edit task",
        content=f"{current_user.name} minta izin mengedit task '{task.title}'",
        ref_id=str(task.id),
        org_id=str(org_id) if org_id else None,
    )
    await db.commit()
    return {"status": "pending"}


@router.post("/{request_id}/{action}", response_model=Any)
async def resolve_request(
    task_id: str, request_id: str, action: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Aksi tidak valid")

    task = await _get_task(db, task_id)
    if not await is_manager_or_creator(db, task, current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat task atau manager yang bisa menyetujui")

    res = await db.execute(
        select(TaskEditRequest).where(TaskEditRequest.id == request_id, TaskEditRequest.task_id == task.id)
    )
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Permintaan tidak ditemukan")

    from datetime import datetime, timezone
    req.status = "approved" if action == "approve" else "rejected"
    req.resolved_at = datetime.now(timezone.utc)
    req.resolved_by = current_user.id

    from app.services.notification import notify_user
    org_id = await task_org_id(db, task)
    if action == "approve":
        msg = f"Permintaan editmu untuk task '{task.title}' disetujui"
    else:
        msg = f"Permintaan editmu untuk task '{task.title}' ditolak"
    await notify_user(
        db,
        user_id=str(req.requester_id),
        type="task_edit_request",
        title="Izin edit task",
        content=msg,
        ref_id=str(task.id),
        org_id=str(org_id) if org_id else None,
    )
    await db.commit()
    return {"status": req.status}
