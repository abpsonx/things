"""Event endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.event import Event, EventAttendee
from app.models.organization import OrgMember
from app.models.team import TeamMember
from app.schemas import EventCreate, EventUpdate, EventResponse, GlobalEventCreate
from app.dependencies import get_current_user
from app.core.permissions import require_project_manager, require_org_manager

router = APIRouter(prefix="/projects/{project_id}/events", tags=["Events"])
# Router untuk Kalender Global — bisa add/edit/delete event tanpa lewat project URL.
me_router = APIRouter(prefix="/me/events", tags=["Events"])


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    project_id: str,
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_manager(db, project_id, current_user)
    """Create a new event in a project."""
    try:
        event = Event(
            project_id=project_id,
            created_by=current_user.id,
            title=data.title,
            description=data.description,
            start_at=data.start_at,
            end_at=data.end_at,
            category=data.category or "meeting",
            reminder_minutes=data.reminder_minutes,
        )
        db.add(event)
        await db.flush() # Flush to get event.id
        
        # Add attendees
        if data.attendee_ids:
            for user_id in data.attendee_ids:
                attendee = EventAttendee(
                    event_id=event.id,
                    user_id=user_id,
                    status="invited"
                )
                db.add(attendee)

        # Notify tagged people ("kamu di-tag di jadwal")
        mention_ids = {str(u) for u in (data.mention_ids or [])}
        if mention_ids:
            from app.models.project import Project
            from app.services.notification import notify_user
            proj_res = await db.execute(select(Project).where(Project.id == project_id))
            proj = proj_res.scalar_one_or_none()
            proj_name = proj.name if proj else "proyek"
            org_id = str(proj.org_id) if proj else None
            for uid in mention_ids:
                if uid == str(current_user.id):
                    continue
                await notify_user(
                    db,
                    user_id=uid,
                    type="event",
                    title=f"Kamu di-tag di jadwal: {data.title}",
                    content=f"{current_user.name} menandai kamu di jadwal {proj_name}",
                    ref_id=str(event.id),
                    org_id=org_id,
                    url=f"/org/{org_id}/project/{project_id}/calendar",
                )

        await db.commit()
        await db.refresh(event)
        
        # --- Google Calendar Sync ---
        from app.services.google_calendar import create_google_event
        google_event_id = await create_google_event(
            user=current_user,
            db=db,
            event_data={
                "title": event.title,
                "description": event.description,
                "start_at": event.start_at,
                "end_at": event.end_at
            }
        )
        if google_event_id:
            event.google_event_id = google_event_id
            await db.commit()
            await db.refresh(event)
        
        # Reload with creator and attendees info
        result = await db.execute(
            select(Event)
            .options(
                selectinload(Event.creator), 
                selectinload(Event.attendees).selectinload(EventAttendee.user)
            )
            .where(Event.id == event.id)
        )
        return result.scalar_one()
    except Exception as e:
        await db.rollback()
        print(f"Error creating event: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Gagal membuat event: {str(e)}")


@router.get("", response_model=List[EventResponse])
async def list_events(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all events in a project."""
    result = await db.execute(
        select(Event)
        .options(
            selectinload(Event.creator), 
            selectinload(Event.attendees).selectinload(EventAttendee.user)
        )
        .where(Event.project_id == project_id)
        .order_by(Event.start_at.asc())
    )
    return result.scalars().all()


@router.get("/me", response_model=List[EventResponse], tags=["Global"])
async def list_my_events(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List semua event yang relevan buat user: project member, team
    member, org member (workspace-wide), creator, atau attendee."""
    from app.models.project import ProjectMember

    # Project IDs user adalah member-nya
    proj_q = select(ProjectMember.project_id).where(ProjectMember.user_id == current_user.id)
    project_ids = list((await db.execute(proj_q)).scalars().all())

    # Team IDs user adalah member-nya
    team_q = select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
    team_ids = list((await db.execute(team_q)).scalars().all())

    # Org IDs user adalah member-nya (workspace-wide event)
    org_q = select(OrgMember.org_id).where(OrgMember.user_id == current_user.id)
    org_ids = list((await db.execute(org_q)).scalars().all())

    # Filter union:
    #   project_id IN project_ids
    #   OR team_id IN team_ids
    #   OR org_id IN org_ids (workspace-wide)
    #   OR created_by == me (jaga-jaga buat personal event di org yang user out of)
    where_clauses = [Event.created_by == current_user.id]
    if project_ids:
        where_clauses.append(Event.project_id.in_(project_ids))
    if team_ids:
        where_clauses.append(Event.team_id.in_(team_ids))
    if org_ids:
        where_clauses.append(Event.org_id.in_(org_ids))

    result = await db.execute(
        select(Event)
        .options(
            selectinload(Event.creator),
            selectinload(Event.attendees).selectinload(EventAttendee.user)
        )
        .where(or_(*where_clauses))
        .order_by(Event.start_at.asc())
    )
    return result.scalars().all()


@router.delete("/{event_id}")
async def delete_event(
    project_id: str,
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_manager(db, project_id, current_user)
    """Delete an event."""
    result = await db.execute(
        select(Event).options(selectinload(Event.creator)).where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event tidak ditemukan")

    # Sync delete with Google Calendar if applicable
    if event.google_event_id:
        from app.services.google_calendar import delete_google_event
        # Assuming only the creator syncs the deletion to Google
        if event.created_by == current_user.id:
            await delete_google_event(
                user=current_user,
                db=db,
                google_event_id=event.google_event_id
            )

    await db.delete(event)
    await db.commit()
    return {"message": "Event berhasil dihapus"}


@router.patch("/{event_id}/rsvp")
async def rsvp_event(
    project_id: str,
    event_id: str,
    data: __import__('app').schemas.EventRSVPRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Respond to an event invitation."""
    result = await db.execute(
        select(EventAttendee)
        .where(
            EventAttendee.event_id == event_id,
            EventAttendee.user_id == current_user.id
        )
    )
    attendee = result.scalar_one_or_none()
    
    if not attendee:
        # Check if event exists
        event_result = await db.execute(select(Event).where(Event.id == event_id, Event.project_id == project_id))
        event = event_result.scalar_one_or_none()
        if not event:
            raise HTTPException(status_code=404, detail="Event tidak ditemukan")
            
        # Add attendee if not invited but RSVPing
        attendee = EventAttendee(
            event_id=event_id,
            user_id=current_user.id,
            status=data.status
        )
        db.add(attendee)
    else:
        attendee.status = data.status
        
    await db.commit()
    return {"message": f"RSVP {data.status} berhasil disimpan"}


# ─── Global / Kalender Global router ────────────────────────────────────────
# Endpoints di luar /projects/{id}/ — dipakai sama halaman Kalender Global
# buat add/edit/delete event tanpa perlu pre-pilih project.

async def _validate_scope_membership(db: AsyncSession, user: User, data) -> None:
    """Pastikan user adalah member dari scope (project/team/org) yang dipilih."""
    from app.models.project import ProjectMember

    if data.project_id:
        pm = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == data.project_id,
                ProjectMember.user_id == user.id,
            )
        )
        if not pm.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Kamu bukan member project ini")
    elif data.team_id:
        tm = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == data.team_id,
                TeamMember.user_id == user.id,
            )
        )
        if not tm.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Kamu bukan member team ini")
    elif data.org_id:
        om = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == data.org_id,
                OrgMember.user_id == user.id,
            )
        )
        if not om.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Kamu bukan member workspace ini")
    else:
        raise HTTPException(status_code=400, detail="Pilih scope: project / team / workspace")


@me_router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_global_event(
    data: GlobalEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Buat event dari Kalender Global. Bisa scope ke project / team / org."""
    await _validate_scope_membership(db, current_user, data)
    visibility = data.visibility if data.visibility in ("public", "private") else "public"
    event = Event(
        project_id=data.project_id,
        team_id=data.team_id,
        org_id=data.org_id,
        created_by=current_user.id,
        title=data.title,
        description=data.description,
        start_at=data.start_at,
        end_at=data.end_at,
        category=data.category or "event",
        visibility=visibility,
        reminder_minutes=data.reminder_minutes,
    )
    db.add(event)
    await db.flush()
    if data.attendee_ids:
        for uid in data.attendee_ids:
            db.add(EventAttendee(event_id=event.id, user_id=uid, status="invited"))
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


@me_router.patch("/{event_id}", response_model=EventResponse)
async def update_global_event(
    event_id: str,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit event. Hanya creator yang boleh ubah."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event tidak ditemukan")
    if event.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Cuma pembuat event yang bisa edit")
    if data.title is not None:
        event.title = data.title
    if data.description is not None:
        event.description = data.description
    if data.start_at is not None:
        event.start_at = data.start_at
    if data.end_at is not None:
        event.end_at = data.end_at
    if data.category is not None:
        event.category = data.category
    if data.visibility is not None and data.visibility in ("public", "private"):
        event.visibility = data.visibility
    if data.attendee_ids is not None:
        # Replace full set of attendees.
        await db.execute(
            EventAttendee.__table__.delete().where(EventAttendee.event_id == event.id)
        )
        for uid in data.attendee_ids:
            db.add(EventAttendee(event_id=event.id, user_id=uid, status="invited"))
    if data.clear_reminder:
        event.reminder_minutes = None
        event.reminder_sent = "N"
    elif data.reminder_minutes is not None:
        event.reminder_minutes = data.reminder_minutes
        event.reminder_sent = "N"  # reset biar reminder bisa terkirim kembali
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


@me_router.delete("/{event_id}", status_code=204)
async def delete_global_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hapus event. Hanya creator yang boleh."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event tidak ditemukan")
    if event.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Cuma pembuat event yang bisa hapus")
    await db.delete(event)
    await db.commit()
    return None

