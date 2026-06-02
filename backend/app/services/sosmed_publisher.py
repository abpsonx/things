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


async def _publish_one_ig(client: httpx.AsyncClient, acc: SocialAccount, p: SocialScheduledPost) -> None:
    """Publish satu post ke Instagram via Container API."""
    token = acc.access_token
    media_type = (p.media_type or "IMAGE").upper()

    # Step 1: create media container
    params = {"access_token": token, "caption": p.caption or ""}
    if media_type in ("VIDEO", "REELS"):
        params["media_type"] = "REELS" if media_type == "REELS" else "VIDEO"
        params["video_url"] = p.media_url
    else:
        params["image_url"] = p.media_url

    r = await client.post(f"{INSTAGRAM_GRAPH}/me/media", params=params)
    data = r.json()
    if "id" not in data:
        raise RuntimeError(f"create container failed: {data}")
    creation_id = str(data["id"])
    p.ig_creation_id = creation_id

    # Step 2: untuk video, polling status sampai FINISHED.
    if media_type in ("VIDEO", "REELS"):
        for _ in range(20):  # ~60s timeout (3s * 20)
            await asyncio.sleep(3)
            sr = await client.get(f"{INSTAGRAM_GRAPH}/{creation_id}", params={
                "fields": "status_code",
                "access_token": token,
            })
            sd = sr.json()
            status_code = sd.get("status_code")
            if status_code == "FINISHED":
                break
            if status_code in ("ERROR", "EXPIRED"):
                raise RuntimeError(f"container status {status_code}: {sd}")
        else:
            raise RuntimeError("container processing timeout (>60s)")

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
    try:
        perma_r = await client.get(f"{INSTAGRAM_GRAPH}/{media_id}", params={
            "fields": "permalink",
            "access_token": token,
        })
        perma_d = perma_r.json()
        if perma_d.get("permalink"):
            p.ig_permalink = perma_d["permalink"]
    except Exception:
        pass

    p.status = "posted"
    p.posted_at = datetime.now(timezone.utc)
    p.error = None


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
