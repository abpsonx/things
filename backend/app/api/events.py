"""Event endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.event import Event, EventAttendee
from app.schemas import EventCreate, EventResponse
from app.dependencies import get_current_user

router = APIRouter(prefix="/projects/{project_id}/events", tags=["Events"])


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    project_id: str,
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new event in a project."""
    try:
        event = Event(
            project_id=project_id,
            created_by=current_user.id,
            title=data.title,
            description=data.description,
            start_at=data.start_at,
            end_at=data.end_at
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
    """List all events across all projects the user belongs to."""
    # Find all project IDs user is member of
    from app.models.project import ProjectMember
    proj_query = select(ProjectMember.project_id).where(ProjectMember.user_id == current_user.id)
    proj_result = await db.execute(proj_query)
    project_ids = proj_result.scalars().all()

    if not project_ids:
        return []

    result = await db.execute(
        select(Event)
        .options(
            selectinload(Event.creator), 
            selectinload(Event.attendees).selectinload(EventAttendee.user)
        )
        .where(Event.project_id.in_(project_ids))
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

