"""Link attachments on tasks — URLs you want to keep alongside a task."""
from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.task import Task, TaskLink
from app.models.user import User

router = APIRouter(prefix="/tasks/{task_id}/links", tags=["Task Links"])


class TaskLinkCreate(BaseModel):
    url: str
    title: Optional[str] = None


class TaskLinkResponse(BaseModel):
    id: UUID
    task_id: UUID
    url: str
    title: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


async def _ensure_task(db: AsyncSession, task_id: str) -> Task:
    res = await db.execute(select(Task).where(Task.id == task_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")
    return task


@router.get("", response_model=List[TaskLinkResponse])
async def list_task_links(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _ensure_task(db, task_id)
    res = await db.execute(
        select(TaskLink).where(TaskLink.task_id == task_id).order_by(TaskLink.created_at.asc())
    )
    items = res.scalars().all()
    return [
        TaskLinkResponse(
            id=i.id, task_id=i.task_id, url=i.url, title=i.title,
            created_at=i.created_at.isoformat() if i.created_at else None,
        )
        for i in items
    ]


@router.post("", response_model=TaskLinkResponse, status_code=status.HTTP_201_CREATED)
async def add_task_link(
    task_id: str,
    data: TaskLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _ensure_task(db, task_id)
    url = (data.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL wajib diisi")
    # Auto-prepend https:// if user typed bare domain (e.g. "example.com").
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    link = TaskLink(
        task_id=task_id,
        url=url[:2048],
        title=(data.title or "").strip()[:255] or None,
        created_by=current_user.id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return TaskLinkResponse(
        id=link.id, task_id=link.task_id, url=link.url, title=link.title,
        created_at=link.created_at.isoformat() if link.created_at else None,
    )


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_link(
    task_id: str,
    link_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    res = await db.execute(
        select(TaskLink).where(TaskLink.id == link_id, TaskLink.task_id == task_id)
    )
    link = res.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link tidak ditemukan")
    await db.delete(link)
    await db.commit()
    return None
