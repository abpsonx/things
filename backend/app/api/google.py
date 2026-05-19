"""Google Calendar Integration API."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from urllib.parse import urlencode
import httpx
import json

from app.core.database import get_db
from app.core.config import get_settings
from app.api.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/google", tags=["Google Integration"])

settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = "https://www.googleapis.com/auth/calendar.events"

def _redirect_uri() -> str:
    """Public callback URL Google should redirect back to.

    Built from FRONTEND_URL because BACKEND_URL in our .env already ends
    with `/api`, which would double-prefix the path. Trailing slash is
    stripped to avoid an accidental `//api/...`.
    """
    base = (settings.FRONTEND_URL or "").rstrip("/")
    return f"{base}/api/google/callback"


@router.get("/login")
async def google_login(current_user: User = Depends(get_current_user)):
    """Generate Google OAuth login URL for the current user."""
    redirect_uri = _redirect_uri()

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": str(current_user.id) # Pass user_id in state to know who is connecting
    }
    
    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return {"auth_url": url}

@router.get("/callback")
async def google_callback(code: str, state: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback and save tokens."""
    redirect_uri = _redirect_uri()
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            }
        )
        
    token_data = response.json()
    
    if "error" in token_data:
        raise HTTPException(status_code=400, detail=f"Google OAuth Error: {token_data.get('error_description')}")
        
    user_id = state
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.google_access_token = token_data.get("access_token")
    if "refresh_token" in token_data:
        user.google_refresh_token = token_data.get("refresh_token")
        
    await db.commit()
    
    # Redirect back to frontend settings page
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/settings?google_connected=true")

@router.delete("/disconnect")
async def google_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Disconnect Google Calendar."""
    current_user.google_access_token = None
    current_user.google_refresh_token = None
    await db.commit()
    return {"message": "Google Calendar disconnected"}

@router.get("/status")
async def google_status(current_user: User = Depends(get_current_user)):
    """Check if Google Calendar is connected."""
    return {"connected": current_user.google_refresh_token is not None}
