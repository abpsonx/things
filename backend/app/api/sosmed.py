"""Social media module — connected brand accounts (Instagram + TikTok).

Foundation only for now: list/disconnect accounts and report whether the
platform OAuth apps are configured. The OAuth connect flow and metric/post
sync are wired in once the Meta + TikTok developer apps exist.
"""
import asyncio
import hashlib
import hmac
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Any
from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import create_access_token, decode_token
from app.models.user import User
from app.models.organization import OrgMember
from app.models.social_account import SocialAccount, SocialMetric, SocialPost
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

# Instagram Business Login (login with Instagram, not Facebook).
INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize"
INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
INSTAGRAM_GRAPH = "https://graph.instagram.com"
# Read profile/media/insights + manage comments & messages (DM). Adding a
# scope here requires users to re-authorize (re-click Hubungkan).
INSTAGRAM_SCOPES = (
    "instagram_business_basic,instagram_business_manage_insights,"
    "instagram_business_manage_comments,instagram_business_manage_messages"
)

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
    granted = tok_data.get("permissions")
    if isinstance(granted, list):
        granted = ",".join(granted)
    acc.username = prof_data.get("username")
    acc.display_name = prof_data.get("name") or prof_data.get("username")
    acc.avatar_url = prof_data.get("profile_picture_url")
    acc.access_token = access_token
    acc.token_expires_at = expires_at
    acc.scopes = granted
    logger.info("IG connected %s — granted permissions: %s", external_id, granted)
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


async def _require_manager(db: AsyncSession, org_id: str, current_user: User):
    """Manager / Admin (owner role) / Super User-Developer only."""
    from app.core.permissions import is_superuser
    if is_superuser(current_user):
        return
    res = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id,
            OrgMember.user_id == current_user.id,
            OrgMember.role.in_(["owner", "manager"]),
        )
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Hanya Manager ke atas yang bisa aksi ini")


def _account_out(a: SocialAccount) -> dict:
    return {
        "id": str(a.id),
        "platform": a.platform,
        "username": a.username,
        "display_name": a.display_name,
        "avatar_url": a.avatar_url,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


async def _ig_snapshot(db: AsyncSession, acc: SocialAccount) -> bool:
    """Pull live IG numbers for `acc`, refresh its profile, upsert today's metric.

    Returns True on success. Network/API failures are swallowed (logged) so a
    flaky Instagram call never breaks the page that triggered it.
    """
    if acc.platform != "instagram" or not acc.access_token:
        return False
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{INSTAGRAM_GRAPH}/me", params={
                "fields": "user_id,username,name,profile_picture_url,followers_count,follows_count,media_count",
                "access_token": acc.access_token,
            })
            data = r.json()
    except httpx.HTTPError as exc:
        logger.warning("IG snapshot HTTP error for %s: %s", acc.id, exc)
        return False
    if not isinstance(data, dict) or "error" in data:
        logger.warning("IG snapshot API error for %s: %s", acc.id, data)
        return False

    if data.get("username"):
        acc.username = data["username"]
    if data.get("name") or data.get("username"):
        acc.display_name = data.get("name") or data.get("username")
    if data.get("profile_picture_url"):
        acc.avatar_url = data["profile_picture_url"]

    today = datetime.now(timezone.utc).date()
    res = await db.execute(
        select(SocialMetric).where(SocialMetric.account_id == acc.id, SocialMetric.date == today)
    )
    m = res.scalar_one_or_none()
    if not m:
        m = SocialMetric(account_id=acc.id, date=today)
        db.add(m)
    m.followers = data.get("followers_count")
    m.following = data.get("follows_count")
    m.posts_count = data.get("media_count")

    # Engagement totals: refresh posts, then sum likes/comments across them.
    # (shares/saves need the insights scope — left null until that's granted.)
    await _ig_sync_posts(db, acc)
    await db.flush()
    agg = await db.execute(
        select(
            func.sum(SocialPost.like_count),
            func.sum(SocialPost.comments_count),
            func.sum(SocialPost.shares),
            func.sum(SocialPost.saved),
        ).where(SocialPost.account_id == acc.id)
    )
    total_likes, total_comments, total_shares, total_saves = agg.one()
    m.likes = int(total_likes) if total_likes is not None else None
    m.comments = int(total_comments) if total_comments is not None else None
    m.shares = int(total_shares) if total_shares is not None else None
    m.saves = int(total_saves) if total_saves is not None else None
    return True


def _parse_ig_time(value: str | None):
    """IG timestamps look like 2024-05-22T10:30:00+0000 (no colon in offset)."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S%z")
        except ValueError:
            return None


async def _ig_media_insights(client: httpx.AsyncClient, media_id: str, token: str) -> dict:
    """Fetch reach/saved/shares for one media. Returns {} if unavailable.

    Metric availability varies by media type, so we degrade the requested set
    on error rather than failing the whole sync.
    """
    for metrics in ("reach,saved,shares", "reach,saved", "reach"):
        try:
            r = await client.get(f"{INSTAGRAM_GRAPH}/{media_id}/insights", params={
                "metric": metrics, "access_token": token,
            })
            data = r.json()
        except httpx.HTTPError:
            return {}
        if isinstance(data, dict) and "data" in data:
            out = {}
            for row in data["data"]:
                vals = row.get("values") or [{}]
                out[row.get("name")] = vals[0].get("value")
            return out
    return {}


async def _ig_sync_posts(db: AsyncSession, acc: SocialAccount, limit: int = 50) -> int:
    """Pull recent media (+ per-post insights) for `acc` into social_posts.

    Failures are swallowed (logged); the caller still serves cached posts.
    Insights need the insights scope — left null when the token lacks it.
    """
    if acc.platform != "instagram" or not acc.access_token:
        return 0
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{INSTAGRAM_GRAPH}/me/media", params={
                "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
                "limit": limit,
                "access_token": acc.access_token,
            })
            data = r.json()
            if not isinstance(data, dict) or "data" not in data:
                logger.warning("IG posts sync API error for %s: %s", acc.id, data)
                return 0
            items = data["data"]
            # Probe insights on the first media; if unavailable (scope not
            # granted), skip the rest instead of firing N failing requests.
            insights = [{} for _ in items]
            if items:
                probe = await _ig_media_insights(client, str(items[0].get("id")), acc.access_token)
                if probe:
                    insights[0] = probe
                    rest = await asyncio.gather(
                        *[_ig_media_insights(client, str(it.get("id")), acc.access_token) for it in items[1:]]
                    )
                    for i, ins in enumerate(rest, start=1):
                        insights[i] = ins
    except httpx.HTTPError as exc:
        logger.warning("IG posts sync HTTP error for %s: %s", acc.id, exc)
        return 0

    existing = await db.execute(select(SocialPost).where(SocialPost.account_id == acc.id))
    by_external = {p.external_id: p for p in existing.scalars().all()}
    now = datetime.now(timezone.utc)
    count = 0
    for item, ins in zip(items, insights):
        ext = str(item.get("id"))
        if not ext:
            continue
        p = by_external.get(ext)
        if not p:
            p = SocialPost(account_id=acc.id, external_id=ext)
            db.add(p)
        p.media_type = item.get("media_type")
        p.caption = item.get("caption")
        p.permalink = item.get("permalink")
        p.media_url = item.get("media_url")
        p.thumbnail_url = item.get("thumbnail_url")
        p.posted_at = _parse_ig_time(item.get("timestamp"))
        p.like_count = item.get("like_count")
        p.comments_count = item.get("comments_count")
        p.reach = ins.get("reach")
        p.saved = ins.get("saved")
        p.shares = ins.get("shares")
        p.fetched_at = now
        count += 1
    return count


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
        # Force the consent screen so newly-added scopes (comments, messages)
        # are actually granted on re-connect — avoids the flaky "remove app"
        # step when Instagram caches an older grant.
        "force_reauth": "true",
    }
    return {"auth_url": f"{INSTAGRAM_AUTH_URL}?{urlencode(params)}"}


@router.get("/accounts/{account_id}/metrics", response_model=Any)
async def account_metrics(
    org_id: str, account_id: str,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Growth history for a connected account.

    Snapshots once per day automatically when this is opened (or now, if
    `refresh=true`), so history accumulates without a background worker.
    """
    await _require_member(db, org_id, current_user.id)
    res = await db.execute(
        select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.org_id == org_id)
    )
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")

    today = datetime.now(timezone.utc).date()
    has_today = await db.execute(
        select(SocialMetric.id).where(SocialMetric.account_id == acc.id, SocialMetric.date == today)
    )
    if refresh or has_today.scalar_one_or_none() is None:
        await _ig_snapshot(db, acc)
        await db.commit()

    rows = await db.execute(
        select(SocialMetric).where(SocialMetric.account_id == acc.id).order_by(SocialMetric.date.asc())
    )
    history = [
        {
            "date": m.date.isoformat(),
            "followers": m.followers,
            "following": m.following,
            "posts_count": m.posts_count,
            "likes": m.likes,
            "comments": m.comments,
            "shares": m.shares,
            "saves": m.saves,
        }
        for m in rows.scalars().all()
    ]
    return {
        "account": _account_out(acc),
        "latest": history[-1] if history else None,
        "history": history,
        "deltas": {
            key: _series_deltas(history, key)
            for key in ("followers", "likes", "comments", "shares", "saves")
        },
    }


def _series_deltas(history: list[dict], key: str) -> dict:
    """Change in `key` vs the previous snapshot and vs ~7/30 days ago.

    Needs at least two data points — a single snapshot has nothing to compare
    against, so everything is null (shown as "—") until day two.
    """
    pts = [(date.fromisoformat(h["date"]), h[key]) for h in history if h.get(key) is not None]
    if len(pts) < 2:
        return {"prev": None, "d7": None, "d30": None}
    latest_date, latest_val = pts[-1]

    def since(days: int):
        cutoff = latest_date - timedelta(days=days)
        in_window = [v for (d, v) in pts if d >= cutoff]
        base = in_window[0] if in_window else pts[0][1]
        return latest_val - base

    return {
        "prev": (latest_val - pts[-2][1]) if len(pts) >= 2 else None,
        "d7": since(7),
        "d30": since(30),
    }


@router.get("/accounts/{account_id}/posts", response_model=Any)
async def account_posts(
    org_id: str, account_id: str,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Posts for the calendar + per-post engagement view.

    Syncs from Instagram when stale (>6h), missing, or `refresh=true`, then
    returns stored posts newest-first.
    """
    await _require_member(db, org_id, current_user.id)
    res = await db.execute(
        select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.org_id == org_id)
    )
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")

    newest = await db.execute(
        select(SocialPost.fetched_at).where(SocialPost.account_id == acc.id)
        .order_by(SocialPost.fetched_at.desc()).limit(1)
    )
    last_fetch = newest.scalar_one_or_none()
    stale = last_fetch is None or (datetime.now(timezone.utc) - last_fetch) > timedelta(hours=6)
    if refresh or stale:
        await _ig_sync_posts(db, acc)
        await db.commit()

    rows = await db.execute(
        select(SocialPost).where(SocialPost.account_id == acc.id).order_by(SocialPost.posted_at.desc().nullslast())
    )
    posts = [
        {
            "id": str(p.id),
            "media_type": p.media_type,
            "caption": p.caption,
            "permalink": p.permalink,
            "thumbnail_url": p.thumbnail_url or p.media_url,
            "posted_at": p.posted_at.isoformat() if p.posted_at else None,
            "like_count": p.like_count,
            "comments_count": p.comments_count,
            "reach": p.reach,
            "saved": p.saved,
            "shares": p.shares,
            "engagement": (p.like_count or 0) + (p.comments_count or 0) + (p.shares or 0) + (p.saved or 0),
        }
        for p in rows.scalars().all()
    ]
    return {"posts": posts}


async def _account_or_404(db: AsyncSession, org_id: str, account_id: str) -> SocialAccount:
    res = await db.execute(
        select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.org_id == org_id)
    )
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    if not acc.access_token:
        raise HTTPException(status_code=400, detail="Akun belum punya token akses")
    return acc


def _comment_out(c: dict) -> dict:
    return {
        "id": c.get("id"),
        "text": c.get("text"),
        "username": c.get("username"),
        "timestamp": c.get("timestamp"),
        "like_count": c.get("like_count"),
        "hidden": c.get("hidden"),
        "replies": [
            {
                "id": r.get("id"),
                "text": r.get("text"),
                "username": r.get("username"),
                "timestamp": r.get("timestamp"),
            }
            for r in (c.get("replies", {}).get("data", []) if isinstance(c.get("replies"), dict) else [])
        ],
    }


@router.get("/accounts/{account_id}/posts/{post_id}/comments", response_model=Any)
async def list_comments(
    org_id: str, account_id: str, post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Comments on one post (with their replies), fetched live from Instagram."""
    await _require_member(db, org_id, current_user.id)
    acc = await _account_or_404(db, org_id, account_id)
    pres = await db.execute(
        select(SocialPost).where(SocialPost.id == post_id, SocialPost.account_id == account_id)
    )
    post = pres.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Postingan tidak ditemukan")

    fields = "id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # Strategy A: the comments edge.
            ra = await client.get(f"{INSTAGRAM_GRAPH}/{post.external_id}/comments", params={
                "fields": fields, "access_token": acc.access_token,
            })
            edge = ra.json()
            edge_list = edge.get("data") if isinstance(edge, dict) else None

            # Strategy B (fallback): comments expanded on the media node.
            node = None
            node_list = None
            if not edge_list:
                rb = await client.get(f"{INSTAGRAM_GRAPH}/{post.external_id}", params={
                    "fields": f"comments_count,comments{{{fields}}}",
                    "access_token": acc.access_token,
                })
                node = rb.json()
                node_list = ((node.get("comments") or {}).get("data")
                             if isinstance(node, dict) else None)
    except httpx.HTTPError as exc:
        logger.warning("IG comments fetch error for %s: %s", post.external_id, exc)
        raise HTTPException(status_code=502, detail="Gagal mengambil komentar dari Instagram")

    found = edge_list or node_list or []
    if found:
        return {"comments": [_comment_out(c) for c in found]}

    # comments_count > 0 but the list is empty with paging cursors present:
    # the classic Development-mode signature — Meta filters out comments from
    # people without a role on the app. Needs App Review (Advanced Access) +
    # Live mode to read comments from real users.
    if (post.comments_count or 0) > 0:
        logger.warning("IG comments empty media %s count=%s (likely dev-mode filtering). edge=%s node=%s",
                       post.external_id, post.comments_count, edge, node)
        return {
            "comments": [],
            "error": (
                f"Ada {post.comments_count} komentar tapi disembunyikan Instagram karena app masih mode "
                "Development (hanya komentar dari admin/tester app yang tampil). Perlu App Review "
                "(Advanced Access) + mode Live untuk baca komentar customer."
            ),
        }
    return {"comments": []}


@router.post("/accounts/{account_id}/comments/{comment_id}/reply", response_model=Any)
async def reply_comment(
    org_id: str, account_id: str, comment_id: str,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reply to a comment (posts under the comment thread)."""
    await _require_manager(db, org_id, current_user)
    acc = await _account_or_404(db, org_id, account_id)
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Pesan balasan kosong")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{INSTAGRAM_GRAPH}/{comment_id}/replies",
                params={"access_token": acc.access_token},
                data={"message": message},
            )
            data = r.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Gagal mengirim balasan")
    if not isinstance(data, dict) or "id" not in data:
        msg = (data.get("error") or {}).get("message") if isinstance(data, dict) else None
        raise HTTPException(status_code=400, detail=msg or "Gagal membalas komentar")
    return {"id": data["id"]}


@router.post("/accounts/{account_id}/comments/{comment_id}/hide", response_model=Any)
async def hide_comment(
    org_id: str, account_id: str, comment_id: str,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hide or unhide a comment."""
    await _require_manager(db, org_id, current_user)
    acc = await _account_or_404(db, org_id, account_id)
    hidden = bool(payload.get("hidden", True))
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{INSTAGRAM_GRAPH}/{comment_id}",
                params={"access_token": acc.access_token},
                data={"hide": "true" if hidden else "false"},
            )
            data = r.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Gagal menyembunyikan komentar")
    if isinstance(data, dict) and data.get("error"):
        raise HTTPException(status_code=400, detail=data["error"].get("message", "Gagal"))
    return {"hidden": hidden}


@router.delete("/accounts/{account_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    org_id: str, account_id: str, comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a comment (only comments on your own media can be deleted)."""
    await _require_manager(db, org_id, current_user)
    acc = await _account_or_404(db, org_id, account_id)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await client.delete(
                f"{INSTAGRAM_GRAPH}/{comment_id}", params={"access_token": acc.access_token}
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Gagal menghapus komentar")
    return None
