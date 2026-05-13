from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.announcement import Announcement
from app.models.project import ProjectMember
from app.schemas import AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse
from app.dependencies import get_current_user
from app.services import log_activity

router = APIRouter(prefix="/projects/{project_id}/announcements", tags=["Announcements"])

@router.post("", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    project_id: str,
    data: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if user is manager in the project and get project for org_id
    from app.models.project import Project
    from uuid import UUID
    
    proj_id = UUID(project_id) if isinstance(project_id, str) else project_id
    
    result = await db.execute(
        select(Project).options(selectinload(Project.members)).where(Project.id == proj_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    is_manager = any(m.user_id == current_user.id and m.role == "manager" for m in project.members)
    if not is_manager:
        raise HTTPException(status_code=403, detail="Hanya project manager yang bisa membuat pengumuman")

    announcement = Announcement(
        project_id=proj_id,
        creator_id=current_user.id,
        title=data.title,
        content=data.content
    )
    db.add(announcement)
    await db.flush()

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action="announcement_created", entity_type="announcement", entity_id=announcement.id,
        project_id=proj_id, metadata={"title": data.title}
    )

    await db.commit()
    await db.refresh(announcement)
    
    # Fetch with creator
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.creator)).where(Announcement.id == announcement.id)
    )
    return result.scalar_one()

@router.get("", response_model=List[AnnouncementResponse])
async def list_announcements(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    proj_id = UUID(project_id) if isinstance(project_id, str) else project_id
    
    result = await db.execute(
        select(Announcement)
        .options(selectinload(Announcement.creator))
        .where(Announcement.project_id == proj_id)
        .order_by(Announcement.created_at.desc())
    )
    return result.scalars().all()

@router.put("/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    project_id: str,
    announcement_id: str,
    data: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    proj_id = UUID(project_id) if isinstance(project_id, str) else project_id
    ann_id = UUID(announcement_id) if isinstance(announcement_id, str) else announcement_id
    
    result = await db.execute(
        select(Announcement).where(Announcement.id == ann_id, Announcement.project_id == proj_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")

    if announcement.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Hanya pembuat pengumuman yang bisa mengedit")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(announcement, key, value)

    await db.commit()
    await db.refresh(announcement)
    
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.creator)).where(Announcement.id == announcement.id)
    )
    return result.scalar_one()

@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    project_id: str,
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from uuid import UUID
    proj_id = UUID(project_id) if isinstance(project_id, str) else project_id
    ann_id = UUID(announcement_id) if isinstance(announcement_id, str) else announcement_id
    
    result = await db.execute(
        select(Announcement).where(Announcement.id == ann_id, Announcement.project_id == proj_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")

    # Check manager or creator
    member_res = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == proj_id,
            ProjectMember.user_id == current_user.id,
            ProjectMember.role == "manager"
        )
    )
    is_manager = member_res.scalar_one_or_none()
    
    if announcement.creator_id != current_user.id and not is_manager:
        raise HTTPException(status_code=403, detail="Hanya pembuat atau manager yang bisa menghapus")

    await db.delete(announcement)
    await db.commit()
    return None
