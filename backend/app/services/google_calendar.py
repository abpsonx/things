"""Google Calendar API service."""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

async def refresh_google_token(user: User, db: AsyncSession) -> str:
    """Refresh Google access token if needed and return valid access token."""
    if not user.google_refresh_token:
        return user.google_access_token
        
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "refresh_token": user.google_refresh_token,
                "grant_type": "refresh_token",
            }
        )
        
    data = response.json()
    if "access_token" in data:
        user.google_access_token = data["access_token"]
        db.add(user)
        await db.commit()
        return data["access_token"]
        
    return user.google_access_token

async def create_google_event(user: User, db: AsyncSession, event_data: dict) -> str:
    """Create an event in user's primary Google Calendar. Returns Google Event ID."""
    if not user.google_access_token:
        return None
        
    access_token = await refresh_google_token(user, db)
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Format payload for Google Calendar
    payload = {
        "summary": event_data["title"],
        "description": event_data.get("description", ""),
        "start": {
            "dateTime": event_data["start_at"].isoformat()
        },
    }
    
    if event_data.get("end_at"):
        payload["end"] = {
            "dateTime": event_data["end_at"].isoformat()
        }
    else:
        # Google Calendar requires an end time, if not provided we default to +1 hour
        from datetime import timedelta
        payload["end"] = {
            "dateTime": (event_data["start_at"] + timedelta(hours=1)).isoformat()
        }
        
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers=headers,
            json=payload
        )
        
    if response.status_code == 200:
        data = response.json()
        return data.get("id")
    else:
        print(f"Failed to create Google Event: {response.text}")
        return None

async def delete_google_event(user: User, db: AsyncSession, google_event_id: str):
    """Delete an event from Google Calendar."""
    if not user.google_access_token or not google_event_id:
        return

    access_token = await refresh_google_token(user, db)

    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    async with httpx.AsyncClient() as client:
        await client.delete(
            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{google_event_id}",
            headers=headers
        )


# ─── Task ↔ Calendar sync ─────────────────────────────────────────────────
#
# Every task with a due_date + an assignee whose Google Calendar is
# connected gets mirrored into that assignee's primary calendar. The
# event id we get back is stored on Task.google_event_id so subsequent
# edits/deletes hit the same event.
#
# All operations here are best-effort: a Google sync failure should
# never break a task CRUD endpoint.


def _build_task_event_body(task) -> dict:
    """Compose the Google Calendar event payload for a task with reminders."""
    title = f"📋 {task.title}"
    description_parts = []
    if task.description:
        description_parts.append(task.description.strip())
    description_parts.append("")
    description_parts.append("— Dibuat otomatis dari Things")
    description = "\n".join(description_parts)

    start = task.due_date
    if start is None:
        start = datetime.now(timezone.utc)
    end = start + timedelta(minutes=30)

    return {
        "summary": title,
        "description": description,
        "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": 24 * 60},  # H-1
                {"method": "popup", "minutes": 30},        # 30 min before
                {"method": "popup", "minutes": 0},         # at due time
            ],
        },
    }


async def _gcal_request(method: str, url: str, token: str, body: Optional[dict] = None) -> Tuple[int, dict]:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.request(method, url, headers=headers, json=body)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {}


async def _request_with_refresh(
    method: str, url: str, db: AsyncSession, user: User, body: Optional[dict] = None,
) -> Tuple[int, dict]:
    """Run a Google API call, transparently refreshing the access token on 401."""
    token = user.google_access_token or await refresh_google_token(user, db)
    if not token:
        return 0, {}
    status, data = await _gcal_request(method, url, token, body)
    if status == 401:
        token = await refresh_google_token(user, db)
        if not token:
            return status, data
        status, data = await _gcal_request(method, url, token, body)
    return status, data


async def push_task_event(task, db: AsyncSession) -> None:
    """Create/update/clean the Google Calendar event matching this task.

    - assignee missing or not connected → no-op
    - due_date missing OR task done → delete any existing event
    - otherwise → POST if no google_event_id, else PATCH
    """
    user = getattr(task, "assignee", None)
    if user is None or not user.google_refresh_token:
        return

    if not task.due_date or task.status == "done":
        if task.google_event_id:
            await _request_with_refresh(
                "DELETE", f"{CALENDAR_EVENTS_URL}/{task.google_event_id}", db, user
            )
            task.google_event_id = None
            try:
                await db.commit()
            except Exception:
                pass
        return

    body = _build_task_event_body(task)

    if task.google_event_id:
        status, data = await _request_with_refresh(
            "PATCH", f"{CALENDAR_EVENTS_URL}/{task.google_event_id}", db, user, body,
        )
        if status == 404:
            # event gone on Google's side — fall through and create a fresh one
            task.google_event_id = None
        elif 200 <= status < 300:
            return
        else:
            logger.warning(f"[gcal] task update failed {status}: {str(data)[:160]}")
            return

    status, data = await _request_with_refresh("POST", CALENDAR_EVENTS_URL, db, user, body)
    if 200 <= status < 300 and data.get("id"):
        task.google_event_id = data["id"]
        try:
            await db.commit()
        except Exception:
            pass
    else:
        logger.warning(f"[gcal] task create failed {status}: {str(data)[:160]}")


async def delete_task_event(task, db: AsyncSession) -> None:
    """Remove the matching Google event when a task is deleted."""
    user = getattr(task, "assignee", None)
    if user is None or not user.google_refresh_token:
        return
    if not task.google_event_id:
        return
    await _request_with_refresh(
        "DELETE", f"{CALENDAR_EVENTS_URL}/{task.google_event_id}", db, user
    )
    task.google_event_id = None
