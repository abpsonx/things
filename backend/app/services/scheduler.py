import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, and_
from app.core.database import async_session
from app.models.task import Task
from app.models.event import Event, EventAttendee
from app.services.notification import notify_user

async def check_reminders():
    """Background task to check for upcoming deadlines and events."""
    print("[SCHEDULER] Starting background scheduler...")
    while True:
        try:
            now = datetime.now(timezone.utc)
            tomorrow = now + timedelta(days=1)
            
            async with async_session() as db:
                # 1. Check Tasks due tomorrow
                # Find tasks due within the next 24 hours that aren't done
                # We should add a flag 'reminder_sent' to tasks to avoid spamming,
                # but for simplicity, we'll check if due_date is exactly between tomorrow-1hr and tomorrow
                start_window = tomorrow - timedelta(hours=1)
                end_window = tomorrow
                
                tasks_query = select(Task).where(
                    and_(
                        Task.status != "done",
                        Task.due_date >= start_window,
                        Task.due_date <= end_window
                    )
                )
                
                result = await db.execute(tasks_query)
                tasks = result.scalars().all()
                
                for task in tasks:
                    if task.assignee_id:
                        print(f"[SCHEDULER] Sending reminder for task: {task.title}")
                        await notify_user(
                            db=db,
                            user_id=task.assignee_id,
                            type="deadline",
                            content=f"Reminder: Task '{task.title}' deadline is tomorrow!",
                            ref_id=str(task.id)
                        )

                # 2. Check Events starting in 1 hour
                event_start_window = now + timedelta(hours=1)
                event_end_window = now + timedelta(hours=1, minutes=5)
                
                events_query = select(Event).where(
                    and_(
                        Event.start_at >= event_start_window,
                        Event.start_at <= event_end_window
                    )
                )
                
                events_result = await db.execute(events_query)
                events = events_result.scalars().all()
                
                for event in events:
                    # Get attendees who accepted or invited
                    attendees_query = select(EventAttendee).where(
                        and_(
                            EventAttendee.event_id == event.id,
                            EventAttendee.status.in_(["accepted", "invited"])
                        )
                    )
                    att_res = await db.execute(attendees_query)
                    attendees = att_res.scalars().all()
                    
                    for attendee in attendees:
                        print(f"[SCHEDULER] Sending reminder for event: {event.title} to {attendee.user_id}")
                        await notify_user(
                            db=db,
                            user_id=attendee.user_id,
                            type="event_reminder",
                            content=f"Reminder: Event '{event.title}' starts in 1 hour!",
                            ref_id=str(event.id)
                        )
                        
        except Exception as e:
            print(f"[SCHEDULER] Error: {e}")
            
        # Run every 5 minutes
        await asyncio.sleep(300)
