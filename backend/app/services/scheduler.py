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
            
            today = now.date()
            tomorrow_end = (now + timedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=0)

            async with async_session() as db:
                # 1. Deadline reminders — at most ONCE per day per task.
                # Cover tasks that are overdue or due within the next ~2 days
                # (i.e. H-1 and hari-H). The `last_reminded_on` guard keeps the
                # 5-minute tick from spamming the same task all day.
                tasks_query = select(Task).where(
                    and_(
                        Task.status != "done",
                        Task.archived_at.is_(None),
                        Task.assignee_id.isnot(None),
                        Task.due_date.isnot(None),
                        Task.due_date <= tomorrow_end,
                        or_(
                            Task.last_reminded_on.is_(None),
                            Task.last_reminded_on < today,
                        ),
                    )
                )

                result = await db.execute(tasks_query)
                tasks = result.scalars().all()

                for task in tasks:
                    overdue = task.due_date < now
                    if overdue:
                        content = f"Tugas '{task.title}' sudah lewat deadline!"
                    else:
                        content = f"Reminder: deadline tugas '{task.title}' sudah dekat."
                    print(f"[SCHEDULER] Sending daily reminder for task: {task.title}")
                    await notify_user(
                        db=db,
                        user_id=task.assignee_id,
                        type="deadline",
                        content=content,
                        ref_id=str(task.id)
                    )
                    task.last_reminded_on = today

                if tasks:
                    await db.commit()

                # 2. Event reminders — pakai reminder_minutes per-event.
                # Default 60 menit kalau kosong (preserve perilaku lama).
                # reminder_sent='N' guard biar gak spam tiap tick.
                future_cutoff = now + timedelta(days=2)  # don't scan jauh ke depan
                events_query = select(Event).where(
                    and_(
                        Event.start_at > now,
                        Event.start_at <= future_cutoff,
                        Event.reminder_sent == "N",
                    )
                )
                events_result = await db.execute(events_query)
                events_to_check = events_result.scalars().all()

                events_due: list[Event] = []
                for ev in events_to_check:
                    minutes = ev.reminder_minutes if ev.reminder_minutes is not None else 60
                    fire_at = ev.start_at - timedelta(minutes=minutes)
                    # Fire kalau sekarang sudah lewat fire_at + masih 5 menit setelahnya.
                    if fire_at <= now <= fire_at + timedelta(minutes=5):
                        events_due.append(ev)

                for event in events_due:
                    # Kirim ke attendees + creator (creator otomatis dikirim juga)
                    recipient_ids = {event.created_by}
                    attendees_query = select(EventAttendee).where(
                        and_(
                            EventAttendee.event_id == event.id,
                            EventAttendee.status.in_(["accepted", "invited"])
                        )
                    )
                    att_res = await db.execute(attendees_query)
                    for a in att_res.scalars().all():
                        recipient_ids.add(a.user_id)

                    minutes_label = event.reminder_minutes if event.reminder_minutes is not None else 60
                    if minutes_label >= 1440:
                        when_label = f"{minutes_label // 1440} hari"
                    elif minutes_label >= 60:
                        when_label = f"{minutes_label // 60} jam"
                    else:
                        when_label = f"{minutes_label} menit"
                    for uid in recipient_ids:
                        print(f"[SCHEDULER] Sending reminder for event: {event.title} to {uid}")
                        await notify_user(
                            db=db,
                            user_id=uid,
                            type="event_reminder",
                            content=f"Reminder: '{event.title}' mulai {when_label} lagi",
                            ref_id=str(event.id)
                        )
                    event.reminder_sent = "Y"
                if events_due:
                    await db.commit()


        except Exception as e:
            print(f"[SCHEDULER] Error: {e}")

        # Daily digest dispatch (best-effort; gated to a 1-hour window inside)
        try:
            await send_daily_digests()
        except Exception as e:
            print(f"[SCHEDULER] digest error: {e}")

        # Retention cleanup: drop uploaded files older than 90 days (once/day)
        try:
            from app.services.cleanup import cleanup_old_files
            await cleanup_old_files()
        except Exception as e:
            print(f"[SCHEDULER] cleanup error: {e}")

        # Sosmed: publish scheduled posts whose scheduled_at sudah lewat.
        try:
            from app.services.sosmed_publisher import publish_due_posts
            await publish_due_posts()
        except Exception as e:
            print(f"[SCHEDULER] sosmed publish error: {e}")

        # Run every 5 minutes
        await asyncio.sleep(300)
