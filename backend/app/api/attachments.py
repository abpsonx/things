"""Attachment endpoints."""
import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.task import Task
from app.models.attachment import Attachment
from app.schemas import AttachmentResponse
from app.dependencies import get_current_user

router = APIRouter(prefix="/tasks/{task_id}/attachments", tags=["Attachments"])

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@router.post("", response_model=AttachmentResponse, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    task_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file attachment for a task."""
    # Check if task exists
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Create record
    attachment = Attachment(
        task_id=task_id,
        uploaded_by=current_user.id,
        file_name=file.filename,
        file_path=file_path,
        file_size=os.path.getsize(file_path)
    )
    db.add(attachment)
    
    # Log activity
    from app.services import log_activity
    if task.project_id:
        from app.models.project import Project
        result = await db.execute(select(Project).where(Project.id == task.project_id))
        project = result.scalar_one()
        await log_activity(
            db, org_id=project.org_id, user_id=current_user.id,
            action="attachment_uploaded", entity_type="attachment", entity_id=attachment.id,
            project_id=project.id, metadata={"filename": file.filename, "task_title": task.title},
        )
    elif task.team_id:
        from app.models.team import Team
        result = await db.execute(select(Team).where(Team.id == task.team_id))
        team = result.scalar_one()
        await log_activity(
            db, org_id=team.org_id, user_id=current_user.id,
            action="attachment_uploaded", entity_type="attachment", entity_id=attachment.id,
            team_id=team.id, metadata={"filename": file.filename, "task_title": task.title},
        )

    await db.commit()
    await db.refresh(attachment)
    
    # Reload with uploader info
    result = await db.execute(
        select(Attachment)
        .where(Attachment.id == attachment.id)
    )
    return result.scalar_one()


@router.get("", response_model=List[AttachmentResponse])
async def list_attachments(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all attachments for a task."""
    result = await db.execute(
        select(Attachment)
        .where(Attachment.task_id == task_id)
        .order_by(Attachment.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{attachment_id}")
async def delete_attachment(
    task_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an attachment."""
    # Eager-load .task — sebelumnya lazy-load di async context bikin
    # MissingGreenlet error sehingga delete diam-diam gagal di prod.
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Attachment)
        .options(selectinload(Attachment.task))
        .where(Attachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Lampiran tidak ditemukan")

    # Remove physical file (best-effort: kalau file hilang, tetap hapus row).
    try:
        if attachment.file_path and os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
    except OSError:
        pass

    # Log activity
    from app.services import log_activity
    if attachment.task.project_id:
        from app.models.project import Project
        result = await db.execute(select(Project).where(Project.id == attachment.task.project_id))
        project = result.scalar_one()
        await log_activity(
            db, org_id=project.org_id, user_id=current_user.id,
            action="attachment_deleted", entity_type="attachment", entity_id=attachment.id,
            project_id=project.id, metadata={"filename": attachment.file_name, "task_title": attachment.task.title},
        )
    elif attachment.task.team_id:
        from app.models.team import Team
        result = await db.execute(select(Team).where(Team.id == attachment.task.team_id))
        team = result.scalar_one()
        await log_activity(
            db, org_id=team.org_id, user_id=current_user.id,
            action="attachment_deleted", entity_type="attachment", entity_id=attachment.id,
            team_id=team.id, metadata={"filename": attachment.file_name, "task_title": attachment.task.title},
        )

    await db.delete(attachment)
    await db.commit()
    return {"message": "Lampiran berhasil dihapus"}
