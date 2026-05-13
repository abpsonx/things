"""Google Calendar API service."""
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.core.config import get_settings

settings = get_settings()
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

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
