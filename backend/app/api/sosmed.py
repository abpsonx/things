"""Social media module — connected brand accounts (Instagram + TikTok).

Foundation only for now: list/disconnect accounts and report whether the
platform OAuth apps are configured. The OAuth connect flow and metric/post
sync are wired in once the Meta + TikTok developer apps exist.
"""
import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any
from app.core.database import get_db
from app.core.config import get_settings
from app.models.user import User
from app.models.organization import OrgMember
from app.models.social_account import SocialAccount
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/organizations/{org_id}/sosmed", tags=["Social Media"])

# Public webhook router (Meta calls this directly — no auth, no org scope).
# Mounted at /api/sosmed in main.py, so the callback URL is /api/sosmed/callback.
webhook_router = APIRouter(prefix="/sosmed", tags=["Social Media"])


@webhook_router.get("/callback")
async def verify_webhook(
    hub_mode: str = Query("", alias="hub.mode"),
    hub_verify_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
):
    """Meta webhook verification handshake.

    Meta sends a GET with hub.mode=subscribe, hub.verify_token, and
    hub.challenge. We echo the challenge back as plain text only when the
    token matches the one configured in META_WEBHOOK_VERIFY_TOKEN.
    """
    s = get_settings()
    expected = s.META_WEBHOOK_VERIFY_TOKEN
    if hub_mode == "subscribe" and expected and hmac.compare_digest(hub_verify_token, expected):
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@webhook_router.post("/callback")
async def receive_webhook(request: Request):
    """Receive Instagram webhook events.

    Verifies the X-Hub-Signature-256 header (HMAC-SHA256 of the raw body
    keyed with the app secret) before accepting the payload.
    """
    s = get_settings()
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if s.META_CLIENT_SECRET:
        expected_sig = "sha256=" + hmac.new(
            s.META_CLIENT_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            raise HTTPException(status_code=403, detail="Invalid signature")

    # Foundation: log the event. Event processing wired in with the sync flow.
    try:
        payload = await request.json()
    except Exception:
        payload = None
    logger.info("Instagram webhook event: %s", payload)
    return {"status": "ok"}


async def _require_member(db: AsyncSession, org_id: str, user_id):
    res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")


def _account_out(a: SocialAccount) -> dict:
    return {
        "id": str(a.id),
        "platform": a.platform,
        "username": a.username,
        "display_name": a.display_name,
        "avatar_url": a.avatar_url,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("/config", response_model=Any)
async def sosmed_config(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tell the UI which platforms are ready to connect (creds configured)."""
    await _require_member(db, org_id, current_user.id)
    s = get_settings()
    return {
        "instagram_ready": bool(s.META_CLIENT_ID and s.META_CLIENT_SECRET),
        "tiktok_ready": bool(s.TIKTOK_CLIENT_KEY and s.TIKTOK_CLIENT_SECRET),
    }


@router.get("/accounts", response_model=Any)
async def list_accounts(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    res = await db.execute(
        select(SocialAccount).where(SocialAccount.org_id == org_id).order_by(SocialAccount.created_at.desc())
    )
    return [_account_out(a) for a in res.scalars().all()]


@router.delete("/accounts/{account_id}", status_code=204)
async def disconnect_account(
    org_id: str, account_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    res = await db.execute(
        select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.org_id == org_id)
    )
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    await db.delete(acc)
    await db.commit()
    return None
