"""Social media module — connected brand accounts (Instagram + TikTok).

Foundation only for now: list/disconnect accounts and report whether the
platform OAuth apps are configured. The OAuth connect flow and metric/post
sync are wired in once the Meta + TikTok developer apps exist.
"""
import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any
from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import create_access_token, decode_token
from app.models.user import User
from app.models.organization import OrgMember
from app.models.social_account import SocialAccount, SocialMetric
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

# Instagram Business Login (login with Instagram, not Facebook).
INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize"
INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
INSTAGRAM_GRAPH = "https://graph.instagram.com"
# Minimal scope to read profile + media; posting/messaging scopes added later.
INSTAGRAM_SCOPES = "instagram_business_basic"

router = APIRouter(prefix="/organizations/{org_id}/sosmed", tags=["Social Media"])


def _ig_redirect_uri() -> str:
    """Public OAuth callback URL Instagram redirects back to.

    Mirrors google.py: built from FRONTEND_URL so the host matches the one
    registered in the Meta app. Must be added to the Instagram Business
    Login "OAuth redirect URIs" list verbatim.
    """
    base = (get_settings().FRONTEND_URL or "").rstrip("/")
    return f"{base}/api/sosmed/oauth/instagram/callback"

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


@webhook_router.get("/oauth/instagram/callback")
async def instagram_oauth_callback(
    db: AsyncSession = Depends(get_db),
    code: str = Query(""),
    state: str = Query(""),
    error: str = Query(""),
):
    """Instagram OAuth redirect target — exchange code, save the account.

    Public (the browser arrives here from instagram.com, no auth header).
    The signed `state` carries org_id + uid. On success/failure we bounce the
    browser back to the org's sosmed page with a status query param.
    """
    s = get_settings()
    front = (s.FRONTEND_URL or "").rstrip("/")

    def _back(org: str, params: dict):
        dest = f"{front}/org/{org}/sosmed" if org else front
        return RedirectResponse(url=f"{dest}?{urlencode(params)}")

    payload = decode_token(state) or {}
    org_id = payload.get("org_id")
    uid = payload.get("uid")
    if payload.get("scope") != "ig_connect" or not org_id or not uid:
        return _back(org_id or "", {"ig_error": "bad_state"})

    if error or not code:
        return _back(org_id, {"ig_error": error or "no_code"})

    # Re-check membership at callback time (state could be 15 min stale).
    member = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == uid)
    )
    if not member.scalar_one_or_none():
        return _back(org_id, {"ig_error": "not_member"})

    redirect_uri = _ig_redirect_uri()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            tok = await client.post(INSTAGRAM_TOKEN_URL, data={
                "client_id": s.META_CLIENT_ID,
                "client_secret": s.META_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code": code,
            })
            tok_data = tok.json()
            if "access_token" not in tok_data:
                logger.warning("IG token exchange failed: %s", tok_data)
                return _back(org_id, {"ig_error": "token_exchange"})
            short_token = tok_data["access_token"]

            # Short-lived (1h) -> long-lived (~60 days).
            ll = await client.get(f"{INSTAGRAM_GRAPH}/access_token", params={
                "grant_type": "ig_exchange_token",
                "client_secret": s.META_CLIENT_SECRET,
                "access_token": short_token,
            })
            ll_data = ll.json()
            access_token = ll_data.get("access_token", short_token)
            expires_in = ll_data.get("expires_in")

            prof = await client.get(f"{INSTAGRAM_GRAPH}/me", params={
                "fields": "user_id,username,name,profile_picture_url,account_type,followers_count,media_count",
                "access_token": access_token,
            })
            prof_data = prof.json()
    except httpx.HTTPError as exc:
        logger.warning("IG OAuth HTTP error: %s", exc)
        return _back(org_id, {"ig_error": "network"})

    external_id = str(prof_data.get("user_id") or tok_data.get("user_id") or "")
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=int(expires_in)) if expires_in else None
    )

    existing = await db.execute(
        select(SocialAccount).where(
            SocialAccount.org_id == uuid.UUID(org_id),
            SocialAccount.platform == "instagram",
            SocialAccount.external_id == external_id,
        )
    )
    acc = existing.scalar_one_or_none()
    if not acc:
        acc = SocialAccount(
            org_id=uuid.UUID(org_id), platform="instagram",
            external_id=external_id, connected_by=uuid.UUID(uid),
        )
        db.add(acc)
    acc.username = prof_data.get("username")
    acc.display_name = prof_data.get("name") or prof_data.get("username")
    acc.avatar_url = prof_data.get("profile_picture_url")
    acc.access_token = access_token
    acc.token_expires_at = expires_at
    await db.flush()

    # Seed today's metric snapshot so the growth chart has a first datapoint.
    followers = prof_data.get("followers_count")
    if followers is not None:
        today = datetime.now(timezone.utc).date()
        snap = await db.execute(
            select(SocialMetric).where(SocialMetric.account_id == acc.id, SocialMetric.date == today)
        )
        m = snap.scalar_one_or_none()
        if not m:
            m = SocialMetric(account_id=acc.id, date=today)
            db.add(m)
        m.followers = followers
        m.posts_count = prof_data.get("media_count")

    await db.commit()
    return _back(org_id, {"ig_connected": "1"})


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


@router.get("/connect/instagram", response_model=Any)
async def connect_instagram(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start the Instagram Business Login flow — returns the authorize URL.

    The org + connecting user are encoded into a short-lived signed `state`
    (a JWT) so the public callback can attribute the account without a
    session cookie.
    """
    await _require_member(db, org_id, current_user.id)
    s = get_settings()
    if not (s.META_CLIENT_ID and s.META_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="Instagram belum dikonfigurasi (META_CLIENT_ID/SECRET kosong)")
    state = create_access_token(
        {"org_id": str(org_id), "uid": str(current_user.id), "scope": "ig_connect"},
        expires_delta=timedelta(minutes=15),
    )
    params = {
        "client_id": s.META_CLIENT_ID,
        "redirect_uri": _ig_redirect_uri(),
        "response_type": "code",
        "scope": INSTAGRAM_SCOPES,
        "state": state,
    }
    return {"auth_url": f"{INSTAGRAM_AUTH_URL}?{urlencode(params)}"}
