import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from app.core.database import async_session
from app.models.task import Task
from app.models.event import Event, EventAttendee
from app.models.user import User
from app.services.notification import notify_user
from app.services.email import send_digest_email

# Tracks which date-of-year each user already received a digest for, so we
# don't double-send if the scheduler tick lands inside the digest window twice.
_digest_sent_today: dict[str, str] = {}


async def send_daily_digests():
    """Send daily task digests at 1am UTC (≈ 8am Jakarta) to opted-in users."""
    now = datetime.now(timezone.utc)
    today_key = now.strftime("%Y-%m-%d")
    # Only run inside the 1am UTC window (the scheduler ticks every 5 min)
    if now.hour != 1:
        return

    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_week = start_of_day + timedelta(days=7)

    async with async_session() as db:
        users_res = await db.execute(
            select(User).where(User.daily_digest_enabled == True)  # noqa: E712
        )
        users = users_res.scalars().all()

        for u in users:
            if _digest_sent_today.get(str(u.id)) == today_key:
                continue

            tasks_res = await db.execute(
                select(Task)
                .options(selectinload(Task.project), selectinload(Task.team))
                .where(
                    and_(
                        Task.assignee_id == u.id,
                        Task.status != "done",
                        or_(
                            Task.due_date < start_of_day,
                            and_(Task.due_date >= start_of_day, Task.due_date <= end_of_week),
                        ),
                    )
                )
            )
            tasks = tasks_res.scalars().all()

            overdue = [t for t in tasks if t.due_date and t.due_date < start_of_day]
            due_today = [
                t for t in tasks
                if t.due_date
                and start_of_day <= t.due_date < start_of_day + timedelta(days=1)
            ]
            due_week = [
                t for t in tasks
                if t.due_date
                and start_of_day + timedelta(days=1) <= t.due_date <= end_of_week
            ]

            try:
                sent = await send_digest_email(u.email, u.name, due_today, overdue, due_week)
                if sent:
                    _digest_sent_today[str(u.id)] = today_key
            except Exception as e:
                print(f"[digest] failed for {u.email}: {e}")

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

        # Daily digest dispatch (best-effort; gated to a 1-hour window inside)
        try:
            await send_daily_digests()
        except Exception as e:
            print(f"[SCHEDULER] digest error: {e}")

        # Run every 5 minutes
        await asyncio.sleep(300)
