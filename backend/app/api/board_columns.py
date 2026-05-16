"""Board column (kanban) endpoints."""
import uuid
import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db
from app.models.user import User
from app.models.board_column import BoardColumn
from app.models.task import Task
from app.dependencies import get_current_user

router = APIRouter(prefix="/projects/{project_id}/columns", tags=["Board Columns"])


class BoardColumnCreate(BaseModel):
    title: str


class BoardColumnUpdate(BaseModel):
    title: Optional[str] = None
    position: Optional[int] = None


class BoardColumnResponse(BaseModel):
    id: UUID
    slug: str
    title: str
    position: int

    class Config:
        from_attributes = True


def _slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    return s or "col"


@router.get("", response_model=List[BoardColumnResponse])
async def list_columns(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(BoardColumn)
        .where(BoardColumn.project_id == project_id)
        .order_by(BoardColumn.position.asc())
    )
    cols = result.scalars().all()
    # Defensive seed: if for some reason this project has no columns (e.g.
    # created during startup race), insert the four defaults on demand.
    if not cols:
        for slug, title, pos in [
            ("todo", "To Do", 0),
            ("in_progress", "In Progress", 1),
            ("pending", "Pending", 2),
            ("done", "Done", 3),
        ]:
            db.add(BoardColumn(project_id=project_id, slug=slug, title=title, position=pos))
        await db.commit()
        result = await db.execute(
            select(BoardColumn)
            .where(BoardColumn.project_id == project_id)
            .order_by(BoardColumn.position.asc())
        )
        cols = result.scalars().all()
    return cols


@router.post("", response_model=BoardColumnResponse, status_code=status.HTTP_201_CREATED)
async def create_column(
    project_id: UUID,
    data: BoardColumnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Judul kolom wajib")
    base_slug = _slugify(title)
    # ensure slug unique per project
    suffix = ""
    n = 0
    while True:
        candidate = f"{base_slug}{suffix}"
        exists = await db.execute(
            select(BoardColumn.id).where(
                BoardColumn.project_id == project_id,
                BoardColumn.slug == candidate,
            )
        )
        if not exists.scalar():
            base_slug = candidate
            break
        n += 1
        suffix = f"_{n}"
    max_pos = await db.execute(
        select(func.coalesce(func.max(BoardColumn.position), -1)).where(
            BoardColumn.project_id == project_id
        )
    )
    new_pos = (max_pos.scalar() or -1) + 1
    col = BoardColumn(
        project_id=project_id, slug=base_slug, title=title, position=new_pos
    )
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return col


@router.patch("/{column_id}", response_model=BoardColumnResponse)
async def update_column(
    project_id: UUID,
    column_id: UUID,
    data: BoardColumnUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(BoardColumn).where(
            BoardColumn.id == column_id, BoardColumn.project_id == project_id
        )
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Kolom tidak ditemukan")
    if data.title is not None:
        new_title = data.title.strip()
        if not new_title:
            raise HTTPException(status_code=400, detail="Judul kolom wajib")
        col.title = new_title
    if data.position is not None:
        col.position = data.position
    await db.commit()
    await db.refresh(col)
    return col


@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_column(
    project_id: UUID,
    column_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Don't allow deleting the last column — board would be empty.
    count_res = await db.execute(
        select(func.count(BoardColumn.id)).where(BoardColumn.project_id == project_id)
    )
    if (count_res.scalar() or 0) <= 1:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus kolom terakhir")

    result = await db.execute(
        select(BoardColumn).where(
            BoardColumn.id == column_id, BoardColumn.project_id == project_id
        )
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Kolom tidak ditemukan")

    # Move any tasks in this column to the first remaining column so we don't
    # orphan them.
    first_res = await db.execute(
        select(BoardColumn)
        .where(BoardColumn.project_id == project_id, BoardColumn.id != column_id)
        .order_by(BoardColumn.position.asc())
        .limit(1)
    )
    first = first_res.scalar_one_or_none()
    if first:
        await db.execute(
            Task.__table__.update()
            .where(Task.project_id == project_id, Task.status == col.slug)
            .values(status=first.slug)
        )
    await db.delete(col)
    await db.commit()
    return None
