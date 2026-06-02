"""Publisher untuk SocialScheduledPost — di-poll oleh scheduler tick.

Flow IG (Container API):
  1. POST /me/media (image_url, caption) → balas {id} (creation_id)
  2. Poll creation status sampai FINISHED (atau langsung publish untuk
     IMAGE singkat — biasanya selesai dalam ~3 detik)
  3. POST /me/media_publish (creation_id) → balas {id} = media_id
  4. GET /{media_id}?fields=permalink untuk dapat URL public

Error path: simpan ke kolom `error`, set status='failed', boleh
retry max 3x dgn exponential backoff (5min, 15min, 45min).
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

import httpx
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.core.database import async_session
from app.models.social_account import SocialAccount, SocialScheduledPost

logger = logging.getLogger(__name__)
INSTAGRAM_GRAPH = "https://graph.instagram.com"
MAX_ATTEMPTS = 3


def _backoff_minutes(attempt: int) -> int:
    """Exponential-ish backoff: 5, 15, 45 menit antara retry."""
    return {1: 5, 2: 15, 3: 45}.get(attempt, 60)


def _is_video_url(url: str) -> bool:
    """Cek ekstensi URL — file video atau gak."""
    ext = (url or "").lower().split("?", 1)[0]
    return any(ext.endswith(e) for e in (".mp4", ".mov", ".webm", ".m4v"))


async def _poll_container(client: httpx.AsyncClient, creation_id: str, token: str, timeout_s: int = 60) -> None:
    """Poll container status_code sampai FINISHED, atau raise kalau ERROR/timeout."""
    iters = max(1, timeout_s // 3)
    for _ in range(iters):
        await asyncio.sleep(3)
        sr = await client.get(f"{INSTAGRAM_GRAPH}/{creation_id}", params={
            "fields": "status_code",
            "access_token": token,
        })
        sd = sr.json()
        status_code = sd.get("status_code")
        if status_code == "FINISHED":
            return
        if status_code in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"container status {status_code}: {sd}")
    raise RuntimeError(f"container processing timeout (>{timeout_s}s)")


async def _create_child_container(client: httpx.AsyncClient, token: str, url: str, is_video: bool) -> str:
    """Bikin child container untuk satu item carousel. Return creation_id."""
    params = {"access_token": token, "is_carousel_item": "true"}
    if is_video:
        # Video di carousel tetap pakai media_type=VIDEO (bukan REELS).
        params["media_type"] = "VIDEO"
        params["video_url"] = url
    else:
        params["image_url"] = url
    r = await client.post(f"{INSTAGRAM_GRAPH}/me/media", params=params)
    data = r.json()
    if "id" not in data:
        raise RuntimeError(f"carousel child create failed: {data}")
    cid = str(data["id"])
    if is_video:
        # Video child butuh polling sebelum dipakai di carousel parent.
        await _poll_container(client, cid, token, timeout_s=90)
    return cid


async def _publish_one_ig(client: httpx.AsyncClient, acc: SocialAccount, p: SocialScheduledPost) -> None:
    """Publish satu post ke Instagram via Container API.

    media_type encode tujuan post:
      IMAGE    → feed image (default)
      REELS    → reels video (feed), support collaborators + share_to_feed
      STORIES  → story (image atau video, ditentukan dari ekstensi media_url)
      CAROUSEL → multi-media (2-10 item), pakai carousel_urls
    Story caption diabaikan oleh IG — story gak punya caption permanen.
    """
    token = acc.access_token
    media_type = (p.media_type or "IMAGE").upper()

    # ── CAROUSEL flow: bikin child container per item, lalu parent container.
    if media_type == "CAROUSEL":
        items = p.carousel_urls or []
        if not items or len(items) < 2:
            raise RuntimeError("carousel butuh minimal 2 media")
        child_ids: list[str] = []
        for it in items:
            if isinstance(it, dict):
                url = it.get("url") or ""
                is_vid = bool(it.get("is_video"))
            else:
                url = str(it)
                is_vid = _is_video_url(url)
            child_id = await _create_child_container(client, token, url, is_vid)
            child_ids.append(child_id)
        # Parent container
        parent_params = {
            "access_token": token,
            "media_type": "CAROUSEL",
            "children": ",".join(child_ids),
            "caption": p.caption or "",
        }
        pr = await client.post(f"{INSTAGRAM_GRAPH}/me/media", params=parent_params)
        pd = pr.json()
        if "id" not in pd:
            raise RuntimeError(f"carousel parent create failed: {pd}")
        creation_id = str(pd["id"])
        p.ig_creation_id = creation_id
        # Publish carousel
        pubr = await client.post(f"{INSTAGRAM_GRAPH}/me/media_publish", params={
            "creation_id": creation_id,
            "access_token": token,
        })
        pub = pubr.json()
        if "id" not in pub:
            raise RuntimeError(f"carousel publish failed: {pub}")
        media_id = str(pub["id"])
        p.ig_media_id = media_id
        await _fetch_permalink(client, p, token, media_id)
        p.status = "posted"
        p.posted_at = datetime.now(timezone.utc)
        p.error = None
        return

    # ── Single-media flow: IMAGE / REELS / STORIES.
    is_video = _is_video_url(p.media_url or "")

    # Step 1: create media container
    params = {"access_token": token}
    # Caption hanya relevan untuk FEED/REELS, story dilewat.
    if media_type != "STORIES":
        params["caption"] = p.caption or ""

    if media_type == "REELS":
        params["media_type"] = "REELS"
        params["video_url"] = p.media_url
        # Reels-only extras: collaborators + share_to_feed.
        if p.collaborators:
            # IG expects JSON array of usernames (max 3).
            import json as _json
            params["collaborators"] = _json.dumps(p.collaborators[:3])
        # Default share_to_feed = true di IG; explicit set kalau false.
        if p.share_to_feed is False:
            params["share_to_feed"] = "false"
    elif media_type == "VIDEO":  # legacy, treat as REELS
        params["media_type"] = "REELS"
        params["video_url"] = p.media_url
    elif media_type == "STORIES":
        params["media_type"] = "STORIES"
        if is_video:
            params["video_url"] = p.media_url
        else:
            params["image_url"] = p.media_url
    else:  # IMAGE feed
        params["image_url"] = p.media_url

    r = await client.post(f"{INSTAGRAM_GRAPH}/me/media", params=params)
    data = r.json()
    if "id" not in data:
        raise RuntimeError(f"create container failed: {data}")
    creation_id = str(data["id"])
    p.ig_creation_id = creation_id

    # Step 2: untuk video (Reels atau Story video), polling status sampai FINISHED.
    needs_polling = media_type in ("VIDEO", "REELS") or (media_type == "STORIES" and is_video)
    if needs_polling:
        await _poll_container(client, creation_id, token, timeout_s=60)

    # Step 3: publish container
    pr = await client.post(f"{INSTAGRAM_GRAPH}/me/media_publish", params={
        "creation_id": creation_id,
        "access_token": token,
    })
    pd = pr.json()
    if "id" not in pd:
        raise RuntimeError(f"publish failed: {pd}")
    media_id = str(pd["id"])
    p.ig_media_id = media_id

    # Step 4: ambil permalink (best-effort)
    await _fetch_permalink(client, p, token, media_id)

    p.status = "posted"
    p.posted_at = datetime.now(timezone.utc)
    p.error = None


async def _fetch_permalink(client: httpx.AsyncClient, p: SocialScheduledPost, token: str, media_id: str) -> None:
    """Best-effort: ambil URL public dari IG, simpan ke p.ig_permalink."""
    try:
        r = await client.get(f"{INSTAGRAM_GRAPH}/{media_id}", params={
            "fields": "permalink",
            "access_token": token,
        })
        d = r.json()
        if d.get("permalink"):
            p.ig_permalink = d["permalink"]
    except Exception:
        pass


async def publish_due_posts() -> None:
    """Cek pending posts yg scheduled_at <= now, publish satu per satu.

    Idempotent: lock via status='publishing' supaya kalau scheduler tick
    overlap, gak double-post. Setelah selesai (success or fail), status
    di-update final.
    """
    now = datetime.now(timezone.utc)
    async with async_session() as db:
        # Ambil pending atau failed yang sudah waktunya retry
        res = await db.execute(
            select(SocialScheduledPost)
            .options(selectinload(SocialScheduledPost.account))
            .where(
                and_(
                    or_(
                        SocialScheduledPost.status == "pending",
                        and_(
                            SocialScheduledPost.status == "failed",
                            SocialScheduledPost.attempts < MAX_ATTEMPTS,
                        ),
                    ),
                    SocialScheduledPost.scheduled_at <= now,
                )
            )
            .limit(20)
        )
        due = res.scalars().all()
        if not due:
            return

        async with httpx.AsyncClient(timeout=30) as client:
            for p in due:
                # Skip kalau retry belum cukup waktunya.
                if p.last_attempt_at:
                    next_ok = p.last_attempt_at + timedelta(minutes=_backoff_minutes(p.attempts))
                    if now < next_ok:
                        continue

                p.status = "publishing"
                p.attempts = (p.attempts or 0) + 1
                p.last_attempt_at = now
                await db.commit()

                try:
                    if not p.account or not p.account.access_token:
                        raise RuntimeError("akun tidak ada access_token (perlu hubungkan ulang)")
                    if p.account.platform != "instagram":
                        raise RuntimeError(f"platform {p.account.platform} belum didukung publisher")

                    await _publish_one_ig(client, p.account, p)
                    await db.commit()
                    logger.info("Published scheduled post %s → media %s", p.id, p.ig_media_id)
                except Exception as e:
                    p.status = "failed" if p.attempts < MAX_ATTEMPTS else "failed"
                    p.error = str(e)[:1000]
                    await db.commit()
                    logger.warning("Publish failed for %s (attempt %s): %s", p.id, p.attempts, e)
