"""Workspace-wide ("all staff") announcements.

Mirrors the project announcements API but scoped to an organization. Only
Manager+ (org manager / Admin / Super User / Developer) can post; every
workspace member is notified.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from app.core.database import get_db
from app.core.permissions import is_superuser, require_org_manager
from app.dependencies import get_current_user
from app.models.announcement import Announcement
from app.models.organization import OrgMember
from app.models.user import User
from app.schemas import AnnouncementCreate, AnnouncementResponse, AnnouncementUpdate
from app.services import log_activity
from app.services.notification import notify_user

router = APIRouter(prefix="/organizations/{org_id}/announcements", tags=["Workspace Announcements"])


async def _require_member(db, org_id: UUID, user_id) -> None:
    res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")


@router.get("", response_model=List[AnnouncementResponse])
async def list_org_announcements(
    org_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    result = await db.execute(
        select(Announcement)
        .options(selectinload(Announcement.creator))
        .where(Announcement.org_id == oid)
        .order_by(Announcement.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_org_announcement(
    org_id: str,
    data: AnnouncementCreate,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await require_org_manager(db, oid, current_user)

    announcement = Announcement(
        org_id=oid,
        creator_id=current_user.id,
        title=data.title,
        content=data.content,
    )
    db.add(announcement)
    await db.flush()

    await log_activity(
        db, org_id=oid, user_id=current_user.id,
        action="announcement_created", entity_type="announcement", entity_id=announcement.id,
        metadata={"title": data.title, "scope": "workspace"},
    )

    # Broadcast to every workspace member except the author.
    from app.core.mentions import expand_mention_ids
    mentioned = await expand_mention_ids(db, data.mention_ids)
    mem = await db.execute(select(OrgMember.user_id).where(OrgMember.org_id == oid))
    member_ids = [str(m) for (m,) in mem.all()]
    for uid in member_ids:
        if uid == str(current_user.id):
            continue
        if uid in mentioned:
            await notify_user(
                db, user_id=uid, type="announcement",
                title=f"Kamu di-tag di pengumuman: {data.title}",
                content=f"{current_user.name} menandai kamu di pengumuman workspace",
                ref_id=str(announcement.id), org_id=org_id,
                url=f"/org/{org_id}/announcements",
            )
        else:
            await notify_user(
                db, user_id=uid, type="announcement",
                title=f"Pengumuman: {data.title}",
                content=f"{current_user.name} memposting pengumuman untuk seluruh workspace",
                ref_id=str(announcement.id), org_id=org_id,
                url=f"/org/{org_id}/announcements",
            )

    await db.commit()
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.creator)).where(Announcement.id == announcement.id)
    )
    return result.scalar_one()


@router.put("/{announcement_id}", response_model=AnnouncementResponse)
async def update_org_announcement(
    org_id: str,
    announcement_id: str,
    data: AnnouncementUpdate,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await require_org_manager(db, oid, current_user)
    result = await db.execute(
        select(Announcement).where(Announcement.id == UUID(announcement_id), Announcement.org_id == oid)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")
    if announcement.creator_id != current_user.id and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat pengumuman yang bisa mengedit")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(announcement, key, value)
    await db.commit()
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.creator)).where(Announcement.id == announcement.id)
    )
    return result.scalar_one()


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org_announcement(
    org_id: str,
    announcement_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await require_org_manager(db, oid, current_user)
    result = await db.execute(
        select(Announcement).where(Announcement.id == UUID(announcement_id), Announcement.org_id == oid)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")
    if announcement.creator_id != current_user.id and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat atau Admin yang bisa menghapus")
    await db.delete(announcement)
    await db.commit()
    return None
