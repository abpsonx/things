"""Retention cleanup: delete uploaded files older than 90 days.

Frees disk by removing the physical files (chat/DM/team/task attachments)
whose record is older than the retention window. The owning message/task
ROWS are kept — only the attachment is dropped (link cleared), so chat and
task history stays intact.
"""
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import async_session

RETENTION_DAYS = 90
UPLOAD_DIR = "uploads"

# Run at most once per UTC day (the scheduler ticks every 5 min).
_last_run_day: str | None = None


def _disk_path(stored: str | None) -> str | None:
    """Map a stored file path / URL to its on-disk location under uploads/."""
    if not stored:
        return None
    name = os.path.basename(stored.split("?")[0])  # strip any query, keep filename
    if not name:
        return None
    return os.path.join(UPLOAD_DIR, name)


def _remove_file(stored: str | None) -> bool:
    p = _disk_path(stored)
    if not p:
        return False
    try:
        if os.path.isfile(p):
            os.remove(p)
            return True
    except Exception as e:  # noqa: BLE001
        print(f"[CLEANUP] failed to remove {p}: {e}")
    return False


async def cleanup_old_files():
    """Delete uploaded files older than RETENTION_DAYS; clear their references."""
    global _last_run_day
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    if _last_run_day == today:
        return
    # Only run in the 02:00 UTC window to avoid churn; mark done for the day.
    if now.hour != 2:
        return
    _last_run_day = today

    cutoff = now - timedelta(days=RETENTION_DAYS)
    removed = 0

    from app.models.attachment import Attachment
    from app.models.channel import Message
    from app.models.dm import DMMessage
    from app.models.team import TeamMessage

    async with async_session() as db:
        # 1. Task attachments → delete file + row.
        res = await db.execute(select(Attachment).where(Attachment.created_at < cutoff))
        for a in res.scalars().all():
            if _remove_file(a.file_path):
                removed += 1
            await db.delete(a)

        # 2. Channel chat attachments → delete file, keep message (clear link).
        res = await db.execute(
            select(Message).where(Message.created_at < cutoff, Message.attachment_url.isnot(None))
        )
        for m in res.scalars().all():
            if _remove_file(m.attachment_url):
                removed += 1
            m.attachment_url = None
            m.attachment_name = None

        # 3. DM attachments.
        res = await db.execute(
            select(DMMessage).where(DMMessage.created_at < cutoff, DMMessage.attachment_url.isnot(None))
        )
        for dm in res.scalars().all():
            if _remove_file(dm.attachment_url):
                removed += 1
            dm.attachment_url = None
            dm.attachment_name = None

        # 4. Team chat attachments.
        res = await db.execute(
            select(TeamMessage).where(TeamMessage.created_at < cutoff, TeamMessage.file_url.isnot(None))
        )
        for tm in res.scalars().all():
            if _remove_file(tm.file_url):
                removed += 1
            tm.file_url = None
            tm.file_name = None

        await db.commit()

    print(f"[CLEANUP] removed {removed} files older than {RETENTION_DAYS} days")
