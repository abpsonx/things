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
from app.models.social_account import SocialAccount, SocialMetric, SocialPost, SocialScheduledPost, SocialStory
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

# Instagram Business Login (login with Instagram, not Facebook).
INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize"
INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
INSTAGRAM_GRAPH = "https://graph.instagram.com"
# FB Login flow — unlock hashtag search, Marketplace, business_discovery.
# Pakai Page access token, semua call ke graph.facebook.com.
FACEBOOK_AUTH_URL = "https://www.facebook.com/v22.0/dialog/oauth"
FACEBOOK_TOKEN_URL = "https://graph.facebook.com/v22.0/oauth/access_token"
FACEBOOK_GRAPH = "https://graph.facebook.com/v22.0"
# Scope buat FB Login flow. Beberapa butuh App Review (production mode).
# Dev mode (kalau user app testers/admin) langsung jalan tanpa review.
FACEBOOK_SCOPES = (
    "pages_show_list,"
    "pages_read_engagement,"
    "instagram_basic,"
    "instagram_content_publish,"
    "instagram_manage_comments,"
    "instagram_manage_insights,"
    "instagram_manage_messages,"
    "business_management"
)
# Read profile/media/insights + manage comments & messages (DM). Adding a
# scope here requires users to re-authorize (re-click Hubungkan).
INSTAGRAM_SCOPES = (
    "instagram_business_basic,instagram_business_manage_insights,"
    "instagram_business_manage_comments,instagram_business_manage_messages"
    # Catatan: hashtag search (Opsi 2) udah covered di scope di atas.
    # Creator Marketplace Discovery (Opsi 1) butuh scope
    # `instagram_creator_marketplace_discovery` + App Review Meta yg approve
    # use case kita. Setelah App Review jalan, tambah scope di sini & user
    # re-connect.
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


async def _ig_fetch_insights(client: httpx.AsyncClient, ig_user_id: str, token: str) -> dict:
    """Fetch profile activity + audience demographics dari Graph API v22+.

    Pakai metric names yang masih supported pasca-v22 (April 2025): `views`,
    `accounts_engaged`, `reach`, `website_clicks`, `total_interactions`.
    Demographics pakai `engaged_audience_demographics` dengan breakdown
    gender/age/city/country.

    Errors yang muncul disurface ke output (key `errors`) supaya FE bisa
    tampil keterangan persis kenapa kosong (mis. \"akun harus Business\",
    \"follower < 100\", dst).

    Output:
      {
        profile: {views, website_clicks, accounts_engaged, reach,
                  total_interactions},
        demographics: {gender_age, city, country, age},
        errors: [str, ...],
        fetched_at: iso,
      }
    """
    out: dict = {"profile": {}, "demographics": {}, "errors": []}

    def _capture(label: str, data):
        """IG error returns {error: {message, type, code}}. Collect human msg."""
        if isinstance(data, dict) and "error" in data:
            err = data["error"]
            msg = err.get("message") or str(err)
            out["errors"].append(f"{label}: {msg}")
            return True
        return False

    # 1) Profile activity (total_value mode, v22+).
    #    Catatan: response IG selalu disimpan ke out["raw_profile"] supaya
    #    user bisa cek persis metric apa yg IG kirim (mis. profile_links_taps
    #    kadang silently di-skip kalau akun belum eligible).
    today = datetime.now(timezone.utc).date()
    since = (today - timedelta(days=7)).isoformat()
    until = today.isoformat()
    try:
        r = await client.get(f"{INSTAGRAM_GRAPH}/{ig_user_id}/insights", params={
            "metric": "views,reach,accounts_engaged,total_interactions,website_clicks",
            "metric_type": "total_value",
            "period": "day",
            "since": since, "until": until,
            "access_token": token,
        })
        data = r.json()
        out["raw_profile"] = data
        if not _capture("profile", data):
            for item in (data.get("data") or []):
                name = item.get("name")
                tv = (item.get("total_value") or {}).get("value")
                if name and tv is not None:
                    out["profile"][name] = tv
    except Exception as e:
        logger.warning("IG profile insights HTTP failed for %s: %s", ig_user_id, e)
        out["errors"].append(f"profile: {e}")

    # 1b) profile_links_taps — call terpisah dengan period=days_28 yang
    #     biasanya lebih ramah untuk metric ini. Juga simpan raw.
    try:
        r = await client.get(f"{INSTAGRAM_GRAPH}/{ig_user_id}/insights", params={
            "metric": "profile_links_taps",
            "metric_type": "total_value",
            "period": "day",
            "since": since, "until": until,
            "access_token": token,
        })
        data = r.json()
        out["raw_profile_links"] = data
        if not _capture("profile.profile_links_taps", data):
            for item in (data.get("data") or []):
                tv = (item.get("total_value") or {}).get("value")
                if tv is not None:
                    out["profile"]["profile_links_taps"] = tv
    except Exception as e:
        logger.warning("IG profile_links_taps HTTP failed for %s: %s", ig_user_id, e)
        out["errors"].append(f"profile_links_taps: {e}")

    # 2) Audience demographics — period=lifetime, butuh ≥100 follower
    #    + Business mode. Single panggilan untuk total_value tipe `top` per
    #    breakdown — Graph v22 mendukung 4 breakdown sekaligus dengan
    #    parameter `breakdown=` repeat.
    for metric, breakdown, key in [
        ("engaged_audience_demographics", "age", "age"),
        ("engaged_audience_demographics", "gender", "gender_age"),
        ("engaged_audience_demographics", "city", "city"),
        ("engaged_audience_demographics", "country", "country"),
    ]:
        try:
            r = await client.get(f"{INSTAGRAM_GRAPH}/{ig_user_id}/insights", params={
                "metric": metric,
                "period": "lifetime",
                "breakdown": breakdown,
                "metric_type": "total_value",
                "access_token": token,
            })
            data = r.json()
            if _capture(f"demographics.{key}", data):
                continue
            results = (((data.get("data") or [{}])[0]).get("total_value") or {}).get("breakdowns") or []
            for b in results:
                values = b.get("results") or []
                bucket: dict = out["demographics"].setdefault(key, {})
                for v in values:
                    dims = v.get("dimension_values") or []
                    val = v.get("value")
                    if dims and val is not None:
                        bucket[" · ".join(str(x) for x in dims)] = val
        except Exception as e:
            logger.warning("IG demographics %s HTTP failed for %s: %s", key, ig_user_id, e)
            out["errors"].append(f"demographics.{key}: {e}")

    out["fetched_at"] = datetime.now(timezone.utc).isoformat()
    return out


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

    # Audience demographics + profile activity (best-effort).
    ig_user_id = data.get("user_id") or data.get("id") or acc.external_id
    if ig_user_id and acc.access_token:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                acc.insights = await _ig_fetch_insights(client, str(ig_user_id), acc.access_token)
        except Exception as e:
            logger.warning("IG insights fetch outer failure for %s: %s", acc.id, e)

    # Sync stories (snapshot biar stories yang tinggal beberapa jam survive
    # even after expire). Best-effort; gak boleh fail seluruh snapshot.
    try:
        await _ig_sync_stories(db, acc)
    except Exception as e:
        logger.warning("IG stories sync outer failure for %s: %s", acc.id, e)
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


async def _ig_media_insights(client: httpx.AsyncClient, media_id: str, token: str, media_type: str | None = None) -> dict:
    """Fetch insights (incl. deep metrics) untuk satu media.

    Set metric tergantung media_type. Reels punya watch-time + navigation
    yang gak ada di IMAGE; IMAGE/CAROUSEL punya profile_visits/follows.
    Degrade ke set lebih kecil kalau API tolak (token scope kurang, dll).
    """
    mt = (media_type or "").upper()
    if mt in ("VIDEO", "REELS"):
        # Reels metrics — watch_time keys: ig_reels_avg_watch_time, ig_reels_video_view_total_time
        chain = (
            "reach,saved,shares,total_interactions,comments,likes,views,ig_reels_avg_watch_time,ig_reels_video_view_total_time",
            "reach,saved,shares,total_interactions,views",
            "reach,saved,shares",
            "reach,saved",
            "reach",
        )
    elif mt == "CAROUSEL_ALBUM":
        chain = (
            "reach,saved,shares,total_interactions,profile_visits,profile_activity,follows",
            "reach,saved,shares,total_interactions",
            "reach,saved,shares",
            "reach,saved",
            "reach",
        )
    else:  # IMAGE atau fallback default
        chain = (
            "reach,saved,shares,total_interactions,profile_visits,profile_activity,follows",
            "reach,saved,shares,total_interactions",
            "reach,saved,shares",
            "reach,saved",
            "reach",
        )

    for metrics in chain:
        try:
            params = {"metric": metrics, "access_token": token}
            # total_value REQUIRED untuk metric baru di v22+ (profile_visits dll).
            # Aman juga buat metric lama.
            if any(k in metrics for k in ("total_interactions", "profile_visits", "profile_activity", "follows", "ig_reels_")):
                params["metric_type"] = "total_value"
            r = await client.get(f"{INSTAGRAM_GRAPH}/{media_id}/insights", params=params)
            data = r.json()
        except httpx.HTTPError:
            return {}
        if isinstance(data, dict) and "data" in data:
            out = {}
            for row in data["data"]:
                name = row.get("name")
                # Format response berbeda untuk metric_type=total_value:
                # `total_value: {value: N}` di level row, bukan dalam values[].
                tv = row.get("total_value")
                if isinstance(tv, dict) and "value" in tv:
                    out[name] = tv["value"]
                else:
                    vals = row.get("values") or [{}]
                    out[name] = vals[0].get("value")
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
                probe = await _ig_media_insights(client, str(items[0].get("id")), acc.access_token, items[0].get("media_type"))
                if probe:
                    insights[0] = probe
                    rest = await asyncio.gather(
                        *[_ig_media_insights(client, str(it.get("id")), acc.access_token, it.get("media_type")) for it in items[1:]]
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
        p.views = ins.get("views")
        p.total_interactions = ins.get("total_interactions")
        p.profile_visits = ins.get("profile_visits")
        p.profile_activity = ins.get("profile_activity")
        p.follows = ins.get("follows")
        p.navigation = ins.get("navigation")
        p.avg_watch_time_ms = ins.get("ig_reels_avg_watch_time")
        p.total_watch_time_ms = ins.get("ig_reels_video_view_total_time")
        p.fetched_at = now
        count += 1
    return count


async def _ig_story_insights(client: httpx.AsyncClient, story_id: str, token: str) -> dict:
    """Fetch insights untuk satu story. Returns {} kalau gak available.

    Story metrics: impressions, reach, exits, taps_forward, taps_back,
    replies, profile_visits, follows. Note: untuk story lama (sudah lewat
    24 jam) insights kadang sudah expired juga — degrade ke set lebih
    kecil daripada gagal total.
    """
    full = "impressions,reach,exits,taps_forward,taps_back,replies,profile_visits,follows"
    for metrics in (full, "impressions,reach,exits,replies", "impressions,reach"):
        try:
            r = await client.get(f"{INSTAGRAM_GRAPH}/{story_id}/insights", params={
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


async def _ig_sync_stories(db: AsyncSession, acc: SocialAccount) -> int:
    """Pull active stories + insights ke social_stories.

    Stories expire 24 jam; kita simpan permanen di sini supaya analitiknya
    survive walau story aslinya udah hilang dari IG. Kalau story sudah ada
    di DB (matched by external_id), insights di-refresh aja.
    """
    if acc.platform != "instagram" or not acc.access_token:
        return 0
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{INSTAGRAM_GRAPH}/me/stories", params={
                "fields": "id,media_type,media_url,thumbnail_url,permalink,timestamp",
                "access_token": acc.access_token,
            })
            data = r.json()
            if not isinstance(data, dict) or "data" not in data:
                logger.warning("IG stories sync API error for %s: %s", acc.id, data)
                return 0
            items = data["data"]
            insights = [{} for _ in items]
            if items:
                results = await asyncio.gather(
                    *[_ig_story_insights(client, str(it.get("id")), acc.access_token) for it in items]
                )
                for i, ins in enumerate(results):
                    insights[i] = ins
    except httpx.HTTPError as exc:
        logger.warning("IG stories sync HTTP error for %s: %s", acc.id, exc)
        return 0

    existing = await db.execute(select(SocialStory).where(SocialStory.account_id == acc.id))
    by_external = {s.external_id: s for s in existing.scalars().all()}
    now = datetime.now(timezone.utc)
    count = 0
    for item, ins in zip(items, insights):
        ext = str(item.get("id"))
        if not ext:
            continue
        s = by_external.get(ext)
        if not s:
            s = SocialStory(account_id=acc.id, external_id=ext)
            db.add(s)
        s.media_type = item.get("media_type")
        s.media_url = item.get("media_url")
        s.thumbnail_url = item.get("thumbnail_url")
        s.permalink = item.get("permalink")
        posted = _parse_ig_time(item.get("timestamp"))
        s.posted_at = posted
        s.expires_at = (posted + timedelta(hours=24)) if posted else None
        s.impressions = ins.get("impressions")
        s.reach = ins.get("reach")
        s.exits = ins.get("exits")
        s.taps_forward = ins.get("taps_forward")
        s.taps_back = ins.get("taps_back")
        s.replies = ins.get("replies")
        s.profile_visits = ins.get("profile_visits")
        s.follows = ins.get("follows")
        s.fetched_at = now
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


def _fb_redirect_uri() -> str:
    """Public OAuth callback URL Facebook redirects back to."""
    base = (get_settings().FRONTEND_URL or "").rstrip("/")
    return f"{base}/api/sosmed/oauth/facebook/callback"


@router.get("/connect/facebook", response_model=Any)
async def connect_facebook(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start FB Login for Business (FBLB) flow — unlocks hashtag search,
    Marketplace, business_discovery.

    FBLB butuh `config_id` parameter (bukan `scope`) — scope sudah di-bake
    di Configuration yg dibuat lewat Meta Dev Dashboard > Facebook Login
    for Business > Konfigurasi.

    Prerequisite (di sisi user/brand):
    1. Punya akun Facebook + admin FB Page
    2. FB Page link ke akun IG (IG app: Settings → Account → Sharing to
       Other Apps → Facebook)
    3. Akun IG Business atau Creator (bukan Personal)
    """
    await _require_member(db, org_id, current_user.id)
    s = get_settings()
    if not (s.META_CLIENT_ID and s.META_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="Meta belum dikonfigurasi (META_CLIENT_ID/SECRET kosong)")
    if not s.META_FB_CONFIG_ID:
        raise HTTPException(
            status_code=400,
            detail=(
                "META_FB_CONFIG_ID belum di-set di env. Bikin Configuration di "
                "Meta Dev Dashboard → Facebook Login for Business → Konfigurasi, "
                "lalu copy Configuration ID ke env."
            ),
        )
    state = create_access_token(
        {"org_id": str(org_id), "uid": str(current_user.id), "scope": "fb_connect"},
        expires_delta=timedelta(minutes=15),
    )
    # FBLB params: scope ditentukan via config_id (bukan literal scope string).
    params = {
        "client_id": s.META_CLIENT_ID,
        "config_id": s.META_FB_CONFIG_ID,
        "redirect_uri": _fb_redirect_uri(),
        "response_type": "code",
        "state": state,
    }
    return {"auth_url": f"{FACEBOOK_AUTH_URL}?{urlencode(params)}"}


@webhook_router.get("/oauth/facebook/callback")
async def facebook_oauth_callback(
    db: AsyncSession = Depends(get_db),
    code: str = Query(""),
    state: str = Query(""),
    error: str = Query(""),
):
    """FB OAuth redirect target.

    Flow:
    1. Exchange code → short-lived FB user token
    2. Exchange short-lived → long-lived FB user token (~60 days)
    3. GET /me/accounts — list of FB Pages user admin
    4. Per Page, GET /{page-id}?fields=instagram_business_account → cek
       Page mana yg link ke IG
    5. Per IG-linked Page, ambil profil IG → simpan SocialAccount baru
       atau update existing (matched by ig_user_id)
    """
    s = get_settings()
    front = (s.FRONTEND_URL or "").rstrip("/")

    def _back(org: str, params: dict):
        dest = f"{front}/org/{org}/sosmed" if org else front
        return RedirectResponse(url=f"{dest}?{urlencode(params)}")

    payload = decode_token(state) or {}
    org_id = payload.get("org_id")
    uid = payload.get("uid")
    if payload.get("scope") != "fb_connect" or not org_id or not uid:
        return _back(org_id or "", {"fb_error": "bad_state"})

    if error or not code:
        return _back(org_id, {"fb_error": error or "no_code"})

    member = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == uid)
    )
    if not member.scalar_one_or_none():
        return _back(org_id, {"fb_error": "not_member"})

    redirect_uri = _fb_redirect_uri()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # Step 1: code → short-lived user token
            tok = await client.get(FACEBOOK_TOKEN_URL, params={
                "client_id": s.META_CLIENT_ID,
                "client_secret": s.META_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "code": code,
            })
            tok_data = tok.json()
            if "access_token" not in tok_data:
                logger.warning("FB token exchange failed: %s", tok_data)
                return _back(org_id, {"fb_error": "token_exchange"})
            short_token = tok_data["access_token"]

            # Step 2: short → long-lived (~60 days)
            ll = await client.get(FACEBOOK_TOKEN_URL, params={
                "grant_type": "fb_exchange_token",
                "client_id": s.META_CLIENT_ID,
                "client_secret": s.META_CLIENT_SECRET,
                "fb_exchange_token": short_token,
            })
            ll_data = ll.json()
            user_token = ll_data.get("access_token", short_token)
            expires_in = ll_data.get("expires_in")

            # Get FB user info
            me = await client.get(f"{FACEBOOK_GRAPH}/me", params={
                "fields": "id,name",
                "access_token": user_token,
            })
            me_data = me.json()
            fb_user_id = me_data.get("id")

            # Step 3: list Pages
            pages_res = await client.get(f"{FACEBOOK_GRAPH}/me/accounts", params={
                "fields": "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}",
                "access_token": user_token,
            })
            pages_data = pages_res.json()
    except httpx.HTTPError as exc:
        logger.warning("FB OAuth HTTP error: %s", exc)
        return _back(org_id, {"fb_error": "network"})

    if not isinstance(pages_data, dict) or "data" not in pages_data:
        err_msg = pages_data.get("error", {}).get("message") if isinstance(pages_data, dict) else "no_pages"
        return _back(org_id, {"fb_error": err_msg or "no_pages"})

    pages = pages_data["data"]
    if not pages:
        return _back(org_id, {"fb_error": "no_pages_admin"})

    # Filter Page yang punya IG linked
    ig_pages = [p for p in pages if p.get("instagram_business_account")]
    if not ig_pages:
        return _back(org_id, {"fb_error": "no_ig_linked"})

    # Upsert SocialAccount per IG-linked page (biasanya 1, tapi support multi)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=int(expires_in)) if expires_in else None
    )
    connected_usernames = []
    for p in ig_pages:
        ig = p["instagram_business_account"]
        ig_user_id = str(ig.get("id") or "")
        if not ig_user_id:
            continue
        existing = await db.execute(
            select(SocialAccount).where(
                SocialAccount.org_id == uuid.UUID(org_id),
                SocialAccount.platform == "instagram",
                SocialAccount.external_id == ig_user_id,
            )
        )
        acc = existing.scalar_one_or_none()
        if not acc:
            acc = SocialAccount(
                org_id=uuid.UUID(org_id), platform="instagram",
                external_id=ig_user_id, connected_by=uuid.UUID(uid),
            )
            db.add(acc)
        acc.username = ig.get("username")
        acc.display_name = ig.get("name") or ig.get("username")
        acc.avatar_url = ig.get("profile_picture_url")
        # Convention: untuk auth_type=fb_page, access_token = Page token
        # supaya existing code yg pakai acc.access_token tetep ke-handle
        # (asalkan base URL switched ke FACEBOOK_GRAPH).
        acc.access_token = p["access_token"]
        acc.token_expires_at = expires_at
        acc.scopes = FACEBOOK_SCOPES
        acc.auth_type = "fb_page"
        acc.fb_user_id = fb_user_id
        acc.fb_user_token = user_token
        acc.page_id = p["id"]
        acc.page_access_token = p["access_token"]
        acc.page_name = p.get("name")
        connected_usernames.append(ig.get("username") or ig_user_id)

    await db.commit()
    return _back(org_id, {"fb_connected": ",".join(connected_usernames)})


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
        # Audience demographics + profile activity (IG only — TikTok null).
        "insights": acc.insights,
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
            "views": p.views,
            "total_interactions": p.total_interactions,
            "profile_visits": p.profile_visits,
            "profile_activity": p.profile_activity,
            "follows": p.follows,
            "navigation": p.navigation,
            "avg_watch_time_ms": p.avg_watch_time_ms,
            "total_watch_time_ms": p.total_watch_time_ms,
            "engagement": (p.like_count or 0) + (p.comments_count or 0) + (p.shares or 0) + (p.saved or 0),
        }
        for p in rows.scalars().all()
    ]
    return {"posts": posts}


@router.get("/accounts/{account_id}/stories", response_model=Any)
async def account_stories(
    org_id: str, account_id: str,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List semua stories (active + archived snapshot) untuk satu akun.

    Stories yg masih live di IG akan auto re-sync; yg sudah expired
    (>24 jam) tetap muncul dari cache DB. Refresh paksa re-fetch via
    `refresh=true`.
    """
    await _require_member(db, org_id, current_user.id)
    res = await db.execute(
        select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.org_id == org_id)
    )
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")

    newest = await db.execute(
        select(SocialStory.fetched_at).where(SocialStory.account_id == acc.id)
        .order_by(SocialStory.fetched_at.desc()).limit(1)
    )
    last_fetch = newest.scalar_one_or_none()
    stale = last_fetch is None or (datetime.now(timezone.utc) - last_fetch) > timedelta(hours=1)
    if refresh or stale:
        await _ig_sync_stories(db, acc)
        await db.commit()

    rows = await db.execute(
        select(SocialStory).where(SocialStory.account_id == acc.id)
        .order_by(SocialStory.posted_at.desc().nullslast())
        .limit(200)
    )
    now = datetime.now(timezone.utc)
    items = []
    for s in rows.scalars().all():
        taps = (s.taps_forward or 0) + (s.taps_back or 0)
        completion = None
        if s.impressions and s.exits is not None:
            completion = max(0.0, round((1 - (s.exits / s.impressions)) * 100, 1))
        items.append({
            "id": str(s.id),
            "external_id": s.external_id,
            "media_type": s.media_type,
            "media_url": s.media_url,
            "thumbnail_url": s.thumbnail_url or s.media_url,
            "permalink": s.permalink,
            "posted_at": s.posted_at.isoformat() if s.posted_at else None,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "is_live": bool(s.expires_at and s.expires_at > now),
            "impressions": s.impressions,
            "reach": s.reach,
            "exits": s.exits,
            "taps_forward": s.taps_forward,
            "taps_back": s.taps_back,
            "taps_total": taps if (s.taps_forward is not None or s.taps_back is not None) else None,
            "replies": s.replies,
            "profile_visits": s.profile_visits,
            "follows": s.follows,
            "completion_rate": completion,
        })
    # Summary agregat (untuk header card di UI).
    if items:
        def _sum(k):
            vals = [i[k] for i in items if i.get(k) is not None]
            return sum(vals) if vals else None
        n_live = sum(1 for i in items if i["is_live"])
        summary = {
            "count": len(items),
            "live_count": n_live,
            "total_impressions": _sum("impressions"),
            "total_reach": _sum("reach"),
            "total_replies": _sum("replies"),
            "total_exits": _sum("exits"),
            "total_profile_visits": _sum("profile_visits"),
            "total_follows": _sum("follows"),
        }
    else:
        summary = {"count": 0, "live_count": 0}
    return {"stories": items, "summary": summary}


@router.get("/accounts/{account_id}/ig-lookup", response_model=Any)
async def ig_username_lookup(
    org_id: str, account_id: str,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate IG username + return public profile preview.

    Pakai Business Discovery API — query lewat token akun kita ke username
    target. Hanya jalan kalau target adalah akun Business/Creator (yang
    memang requirement buat collab post). Pas buat validate sebelum
    invite collaborator.
    """
    await _require_member(db, org_id, current_user.id)
    acc = await _account_or_404(db, org_id, account_id)
    if acc.platform != "instagram":
        raise HTTPException(status_code=400, detail="Lookup hanya untuk IG")

    uname = username.strip().lstrip("@")
    if not uname:
        raise HTTPException(status_code=400, detail="username kosong")
    # IG username constraint: alphanumeric, period, underscore — basic sanity.
    if not all(c.isalnum() or c in "._" for c in uname) or len(uname) > 30:
        raise HTTPException(status_code=400, detail="format username tidak valid")

    ig_user_id = acc.external_id
    if not ig_user_id:
        raise HTTPException(status_code=400, detail="akun belum punya external_id")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{INSTAGRAM_GRAPH}/{ig_user_id}", params={
                "fields": f"business_discovery.username({uname}){{username,name,profile_picture_url,followers_count,media_count}}",
                "access_token": acc.access_token,
            })
            data = r.json()
    except httpx.HTTPError as exc:
        logger.warning("IG lookup HTTP error: %s", exc)
        raise HTTPException(status_code=502, detail="Gagal hubungi Instagram")

    # Error response dari Graph API → username gak ketemu atau bukan Business.
    if isinstance(data, dict) and "error" in data:
        err = data["error"]
        msg = err.get("message", "tidak ditemukan")
        # Code 24: business_discovery target tidak Business account.
        # Code 110: tidak ditemukan.
        if err.get("code") in (24, 110) or "business" in msg.lower():
            return {
                "found": False,
                "username": uname,
                "reason": "Akun tidak ditemukan, atau bukan akun Business/Creator (syarat collab IG).",
            }
        return {"found": False, "username": uname, "reason": msg}

    bd = (data or {}).get("business_discovery")
    if not bd:
        return {"found": False, "username": uname, "reason": "Tidak ditemukan"}

    return {
        "found": True,
        "username": bd.get("username") or uname,
        "name": bd.get("name"),
        "profile_picture_url": bd.get("profile_picture_url"),
        "followers_count": bd.get("followers_count"),
        "media_count": bd.get("media_count"),
    }


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


# ─── Auto Posting / Scheduler ────────────────────────────────────────────────

def _scheduled_post_out(p: SocialScheduledPost) -> dict:
    return {
        "id": str(p.id),
        "account_id": str(p.account_id),
        "design_brief_id": str(p.design_brief_id) if p.design_brief_id else None,
        "caption": p.caption,
        "media_url": p.media_url,
        "media_type": p.media_type,
        "carousel_urls": p.carousel_urls,
        "collaborators": p.collaborators,
        "share_to_feed": p.share_to_feed,
        "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
        "status": p.status,
        "ig_media_id": p.ig_media_id,
        "ig_permalink": p.ig_permalink,
        "posted_at": p.posted_at.isoformat() if p.posted_at else None,
        "error": p.error,
        "attempts": p.attempts,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _normalize_public_url(url: str) -> str:
    """Buat URL relatif (/api/uploads/...) jadi absolut pakai FRONTEND_URL."""
    if url.startswith("/"):
        base = (get_settings().FRONTEND_URL or "").rstrip("/")
        return f"{base}{url}"
    return url


@router.post("/accounts/{account_id}/scheduled-posts", response_model=Any)
async def create_scheduled_post(
    org_id: str, account_id: str,
    data: dict,  # {caption, media_url, media_type, scheduled_at, design_brief_id?}
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Jadwalkan posting ke IG/TikTok. media_url harus URL publik
    (IG fetch dari sini saat publish)."""
    await _require_member(db, org_id, current_user.id)
    res = await db.execute(
        select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.org_id == org_id)
    )
    acc = res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")

    media_url = (data.get("media_url") or "").strip()
    media_type = (data.get("media_type") or "IMAGE").upper()
    scheduled_at_raw = data.get("scheduled_at")
    if not media_url or not scheduled_at_raw:
        raise HTTPException(status_code=400, detail="media_url & scheduled_at wajib")
    try:
        scheduled_at = datetime.fromisoformat(scheduled_at_raw.replace("Z", "+00:00"))
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="scheduled_at harus ISO 8601")

    # Boleh schedule masa sekarang (publish-now); reject jika terlalu lampau.
    if scheduled_at < datetime.now(timezone.utc) - timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="scheduled_at sudah lewat")

    # Normalize media_url ke full URL — IG butuh public absolute URL.
    media_url = _normalize_public_url(media_url)

    # CAROUSEL: validate + normalize urls list.
    carousel_urls_in = data.get("carousel_urls") or None
    carousel_urls_out = None
    if media_type == "CAROUSEL":
        if not isinstance(carousel_urls_in, list) or len(carousel_urls_in) < 2:
            raise HTTPException(status_code=400, detail="Carousel butuh minimal 2 media")
        if len(carousel_urls_in) > 10:
            raise HTTPException(status_code=400, detail="Carousel maksimal 10 media")
        carousel_urls_out = []
        for it in carousel_urls_in:
            if isinstance(it, str):
                url = _normalize_public_url(it.strip())
                ext = url.lower().split("?", 1)[0]
                is_vid = any(ext.endswith(e) for e in (".mp4", ".mov", ".webm", ".m4v"))
                carousel_urls_out.append({"url": url, "is_video": is_vid})
            elif isinstance(it, dict) and it.get("url"):
                carousel_urls_out.append({
                    "url": _normalize_public_url(it["url"].strip()),
                    "is_video": bool(it.get("is_video")),
                })

    # Collaborators: only meaningful untuk REELS (atau CAROUSEL-with-video).
    collaborators_in = data.get("collaborators") or None
    collaborators_out = None
    if isinstance(collaborators_in, list):
        cleaned = [str(c).strip().lstrip("@") for c in collaborators_in if str(c).strip()]
        if len(cleaned) > 3:
            raise HTTPException(status_code=400, detail="Maksimal 3 collaborator")
        collaborators_out = cleaned or None

    share_to_feed = bool(data.get("share_to_feed", True))

    p = SocialScheduledPost(
        account_id=acc.id,
        org_id=acc.org_id,
        created_by=current_user.id,
        design_brief_id=data.get("design_brief_id"),
        caption=data.get("caption") or None,
        media_url=media_url,
        media_type=media_type,
        carousel_urls=carousel_urls_out,
        collaborators=collaborators_out,
        share_to_feed=share_to_feed,
        scheduled_at=scheduled_at,
        status="pending",
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _scheduled_post_out(p)


@router.get("/accounts/{account_id}/scheduled-posts", response_model=Any)
async def list_scheduled_posts(
    org_id: str, account_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List semua scheduled post utk akun ini (pending + posted/failed
    100 terakhir untuk audit)."""
    await _require_member(db, org_id, current_user.id)
    res = await db.execute(
        select(SocialScheduledPost)
        .where(SocialScheduledPost.account_id == account_id)
        .order_by(SocialScheduledPost.scheduled_at.desc())
        .limit(100)
    )
    rows = res.scalars().all()
    return {"items": [_scheduled_post_out(p) for p in rows]}


@router.delete("/scheduled-posts/{post_id}", status_code=204)
async def cancel_scheduled_post(
    org_id: str, post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Batalkan scheduled post — hanya jika status masih pending."""
    await _require_member(db, org_id, current_user.id)
    res = await db.execute(
        select(SocialScheduledPost).where(
            SocialScheduledPost.id == post_id,
            SocialScheduledPost.org_id == org_id,
        )
    )
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Scheduled post tidak ditemukan")
    if p.status not in ("pending", "failed"):
        raise HTTPException(status_code=400, detail="Hanya status pending/failed yang bisa dibatalkan")
    p.status = "cancelled"
    await db.commit()
    return None
