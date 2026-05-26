"""Workspace-wide ("all staff") meetings/events.

Mirrors the project events API but scoped to an organization. Only Manager+
can create/delete; every workspace member is an implicit attendee for public
events. RSVP is open to any workspace member.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from app.core.database import get_db
from app.core.permissions import require_org_manager
from app.dependencies import get_current_user
from app.models.event import Event, EventAttendee
from app.models.organization import OrgMember
from app.models.user import User
from app.schemas import EventCreate, EventResponse, EventRSVPRequest
from app.services.notification import notify_user

router = APIRouter(prefix="/organizations/{org_id}/events", tags=["Workspace Events"])


async def _require_member(db, org_id: UUID, user_id) -> None:
    res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")


@router.get("", response_model=List[EventResponse])
async def list_org_events(
    org_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    result = await db.execute(
        select(Event)
        .options(
            selectinload(Event.creator),
            selectinload(Event.attendees).selectinload(EventAttendee.user),
        )
        .where(Event.org_id == oid)
        .order_by(Event.start_at.asc())
    )
    return result.scalars().all()


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_org_event(
    org_id: str,
    data: EventCreate,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await require_org_manager(db, oid, current_user)

    event = Event(
        org_id=oid,
        created_by=current_user.id,
        title=data.title,
        description=data.description,
        start_at=data.start_at,
        end_at=data.end_at,
        category=data.category or "meeting",
    )
    db.add(event)
    await db.flush()

    # Explicitly invited attendees (optional). A workspace meeting is public
    # by default, so non-listed members can still see and RSVP.
    for user_id in (data.attendee_ids or []):
        db.add(EventAttendee(event_id=event.id, user_id=user_id, status="invited"))

    # Notify every workspace member about the new all-staff meeting.
    mentioned = {str(u) for u in (data.mention_ids or [])}
    mem = await db.execute(select(OrgMember.user_id).where(OrgMember.org_id == oid))
    member_ids = [str(m) for (m,) in mem.all()]
    for uid in member_ids:
        if uid == str(current_user.id):
            continue
        tagged = uid in mentioned
        await notify_user(
            db, user_id=uid, type="event",
            title=(f"Kamu di-tag di meeting: {data.title}" if tagged else f"Meeting workspace: {data.title}"),
            content=f"{current_user.name} menjadwalkan meeting untuk seluruh workspace",
            ref_id=str(event.id), org_id=org_id,
            url=f"/org/{org_id}/calendar",
        )

    await db.commit()
    result = await db.execute(
        select(Event)
        .options(
            selectinload(Event.creator),
            selectinload(Event.attendees).selectinload(EventAttendee.user),
        )
        .where(Event.id == event.id)
    )
    return result.scalar_one()


@router.delete("/{event_id}")
async def delete_org_event(
    org_id: str,
    event_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await require_org_manager(db, oid, current_user)
    result = await db.execute(
        select(Event).where(Event.id == UUID(event_id), Event.org_id == oid)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event tidak ditemukan")
    await db.delete(event)
    await db.commit()
    return {"message": "Event berhasil dihapus"}


@router.patch("/{event_id}/rsvp")
async def rsvp_org_event(
    org_id: str,
    event_id: str,
    data: EventRSVPRequest,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    result = await db.execute(
        select(EventAttendee).where(
            EventAttendee.event_id == UUID(event_id),
            EventAttendee.user_id == current_user.id,
        )
    )
    attendee = result.scalar_one_or_none()
    if not attendee:
        event_result = await db.execute(
            select(Event).where(Event.id == UUID(event_id), Event.org_id == oid)
        )
        if not event_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Event tidak ditemukan")
        attendee = EventAttendee(event_id=UUID(event_id), user_id=current_user.id, status=data.status)
        db.add(attendee)
    else:
        attendee.status = data.status
    await db.commit()
    return {"message": f"RSVP {data.status} berhasil disimpan"}
