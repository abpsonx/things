"""Helpers for building human-readable task activity log entries (Indonesian)."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User

STATUS_LABELS = {
    "todo": "To Do",
    "in_progress": "Dikerjakan",
    "pending": "Pending",
    "done": "Selesai",
}
PRIORITY_LABELS = {"low": "Rendah", "medium": "Sedang", "high": "Tinggi"}


def status_label(value):
    return STATUS_LABELS.get(value, value or "-")


def _fmt_due(value):
    if not value:
        return "tidak ada"
    if isinstance(value, str):
        # ISO string from the API payload — keep date + time, drop seconds/tz
        return value.replace("T", " ")[:16]
    try:
        return value.strftime("%d %b %Y %H:%M")
    except Exception:
        return str(value)


async def _user_name(db: AsyncSession, user_id):
    if not user_id:
        return "tidak ada"
    res = await db.execute(select(User.name).where(User.id == user_id))
    return res.scalar_one_or_none() or "seseorang"


async def build_task_change_summary(db: AsyncSession, old: dict, update_data: dict) -> list[str]:
    """Describe what changed, as Indonesian strings, resolving names where needed.

    `old` holds the pre-change values keyed by field name; `update_data` holds
    only the fields included in the request.
    """
    lines: list[str] = []

    if "title" in update_data and update_data["title"] != old.get("title"):
        lines.append(f'Judul: "{old.get("title")}" → "{update_data["title"]}"')

    if "description" in update_data and (update_data["description"] or "") != (old.get("description") or ""):
        lines.append("Mengubah deskripsi")

    if "priority" in update_data and update_data["priority"] != old.get("priority"):
        a = PRIORITY_LABELS.get(old.get("priority"), old.get("priority"))
        b = PRIORITY_LABELS.get(update_data["priority"], update_data["priority"])
        lines.append(f"Prioritas: {a} → {b}")

    if "status" in update_data and update_data["status"] != old.get("status"):
        lines.append(f"Status: {status_label(old.get('status'))} → {status_label(update_data['status'])}")

    if "assignee_id" in update_data and str(update_data["assignee_id"] or "") != str(old.get("assignee_id") or ""):
        a = await _user_name(db, old.get("assignee_id"))
        b = await _user_name(db, update_data["assignee_id"])
        lines.append(f"Penanggung jawab: {a} → {b}")

    if "due_date" in update_data and _fmt_due(update_data["due_date"]) != _fmt_due(old.get("due_date")):
        lines.append(f"Tenggat: {_fmt_due(old.get('due_date'))} → {_fmt_due(update_data['due_date'])}")

    return lines
