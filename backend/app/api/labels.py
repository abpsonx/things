"""Label endpoints for projects and organizations."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.label import Label, TaskLabel
from app.schemas import LabelCreate, LabelResponse
from app.dependencies import get_current_user

# Project-specific labels router
router = APIRouter(prefix="/projects/{project_id}/labels", tags=["Labels"])

# Organization-level labels router
org_router = APIRouter(prefix="/organizations/{org_id}/labels", tags=["Labels"])


# --- Project Labels ---

@router.post("", response_model=LabelResponse, status_code=status.HTTP_201_CREATED)
async def create_project_label(
    project_id: str, data: LabelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check duplicate
    result = await db.execute(
        select(Label).where(Label.project_id == project_id, Label.name == data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Label dengan nama tersebut sudah ada")

    label = Label(project_id=project_id, name=data.name, color=data.color)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return LabelResponse.model_validate(label)


@router.get("", response_model=List[LabelResponse])
async def list_project_labels(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Label).where(Label.project_id == project_id).order_by(Label.name)
    )
    return [LabelResponse.model_validate(l) for l in result.scalars().all()]


# --- Organization Labels ---

@org_router.post("", response_model=LabelResponse, status_code=status.HTTP_201_CREATED)
async def create_org_label(
    org_id: str, data: LabelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check duplicate in this org
    result = await db.execute(
        select(Label).where(Label.org_id == org_id, Label.name == data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Label dengan nama tersebut sudah ada di workspace ini")

    label = Label(org_id=org_id, name=data.name, color=data.color)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return LabelResponse.model_validate(label)


@org_router.get("", response_model=List[LabelResponse])
async def list_org_labels(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Label).where(Label.org_id == org_id).order_by(Label.name)
    )
    return [LabelResponse.model_validate(l) for l in result.scalars().all()]


# --- Generic Task Label Assignment (Works for both Project and Team Tasks) ---

@org_router.post("/{label_id}/tasks/{task_id}", status_code=status.HTTP_201_CREATED)
async def add_label_to_task(
    org_id: str, label_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await db.execute(
        select(TaskLabel).where(TaskLabel.task_id == task_id, TaskLabel.label_id == label_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Label sudah ditambahkan ke task ini")

    tl = TaskLabel(task_id=task_id, label_id=label_id)
    db.add(tl)
    await db.commit()
    return {"message": "Label berhasil ditambahkan"}


@org_router.delete("/{label_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_label_from_task(
    org_id: str, label_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TaskLabel).where(TaskLabel.task_id == task_id, TaskLabel.label_id == label_id)
    )
    tl = result.scalar_one_or_none()
    if not tl:
        raise HTTPException(status_code=404, detail="Label tidak ditemukan di task ini")
    await db.delete(tl)
    await db.commit()


# Project-based deletion (Backward compatibility)
@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_label(
    project_id: str, label_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Label).where(Label.id == label_id, Label.project_id == project_id)
    )
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label tidak ditemukan")
    await db.delete(label)
    await db.commit()


@org_router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org_label(
    org_id: str, label_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Label).where(Label.id == label_id, Label.org_id == org_id)
    )
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label tidak ditemukan")
    await db.delete(label)
    await db.commit()
