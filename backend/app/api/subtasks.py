"""Sub-task endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.task import Task, SubTask
from app.schemas import SubTaskResponse
from app.dependencies import get_current_user

router = APIRouter(prefix="/tasks/{task_id}/subtasks", tags=["Sub-tasks"])


@router.post("", response_model=SubTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_subtask(
    task_id: str,
    data: dict,  # Simplification
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subtask = SubTask(task_id=task_id, title=data.get("title"), is_done=False)
    db.add(subtask)
    await db.commit()
    await db.refresh(subtask)
    return subtask


@router.patch("/{subtask_id}", response_model=SubTaskResponse)
async def update_subtask(
    task_id: str,
    subtask_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SubTask).where(SubTask.id == subtask_id))
    subtask = result.scalar_one_or_none()
    if not subtask:
        raise HTTPException(status_code=404, detail="Sub-task tidak ditemukan")

    if "is_done" in data:
        subtask.is_done = data["is_done"]
    if "title" in data:
        subtask.title = data["title"]

    await db.commit()
    await db.refresh(subtask)
    return subtask


@router.delete("/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    task_id: str,
    subtask_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SubTask).where(SubTask.id == subtask_id, SubTask.task_id == task_id)
    )
    subtask = result.scalar_one_or_none()
    if not subtask:
        raise HTTPException(status_code=404, detail="Sub-task tidak ditemukan")

    await db.delete(subtask)
    await db.commit()
    return None
