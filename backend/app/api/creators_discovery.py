"""Creator Discovery — cari creator baru di IG buat ditambah ke pool.

3 mode:
1. Marketplace — pakai instagram_creator_marketplace_discovery API (butuh
   App Review Meta; di-Indonesia adoption tipis tapi tetep gw expose).
2. Hashtag — search hashtag tertentu, ambil top media, ekstrak creator
   yg posting. Reliable, gak butuh scope tambahan.
3. Quick Scout — bukan API call, cuma gen link search IG biar user
   scout manual (di-handle full di frontend).
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
import logging

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.organization import OrgMember
from app.models.social_account import SocialAccount

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/organizations/{org_id}/creators/discover", tags=["Creator Discovery"])
INSTAGRAM_GRAPH = "https://graph.instagram.com"


async def _require_org_member(db: AsyncSession, org_id: str, user: User) -> None:
    res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user.id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")


async def _get_ig_account(db: AsyncSession, org_id: str, account_id: Optional[str] = None) -> SocialAccount:
    """Ambil IG account untuk auth token. Kalau account_id gak di-specify,
    pakai IG account pertama di workspace."""
    stmt = select(SocialAccount).where(
        SocialAccount.org_id == org_id,
        SocialAccount.platform == "instagram",
    )
    if account_id:
        stmt = stmt.where(SocialAccount.id == account_id)
    res = await db.execute(stmt.limit(1))
    acc = res.scalar_one_or_none()
    if not acc or not acc.access_token or not acc.external_id:
        raise HTTPException(
            status_code=400,
            detail="Belum ada akun IG ter-connect di workspace ini. Hubungkan dulu di /sosmed.",
        )
    return acc


# ─── Hashtag Discovery ────────────────────────────────────────────────────

class HashtagSearchIn(BaseModel):
    hashtag: str  # tanpa #
    account_id: Optional[str] = None  # IG account buat auth (default: pertama)
    mode: Optional[str] = "top"  # "top" | "recent"


@router.post("/hashtag")
async def discover_by_hashtag(
    org_id: str,
    data: HashtagSearchIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search creator via hashtag IG.

    Flow:
    1. ig_hashtag_search → cari hashtag ID dari nama
    2. /{hashtag-id}/top_media → ambil 25 top post
    3. Group by username → list creator + sample post

    Return: list creator dgn count post + sample media.
    Filter follower/tier gak bisa di-API (IG gak expose follower dari hashtag);
    user manual filter setelah dapet list.
    """
    await _require_org_member(db, org_id, current_user)
    tag = (data.hashtag or "").strip().lstrip("#").lower()
    if not tag:
        raise HTTPException(status_code=400, detail="Hashtag wajib")
    if not all(c.isalnum() or c == "_" for c in tag) or len(tag) > 100:
        raise HTTPException(status_code=400, detail="Format hashtag tidak valid")

    acc = await _get_ig_account(db, org_id, data.account_id)
    ig_user_id = acc.external_id
    token = acc.access_token
    edge = "top_media" if data.mode != "recent" else "recent_media"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: hashtag ID
            r1 = await client.get(f"{INSTAGRAM_GRAPH}/ig_hashtag_search", params={
                "user_id": ig_user_id, "q": tag, "access_token": token,
            })
            d1 = r1.json()
            if not isinstance(d1, dict) or not d1.get("data"):
                err = d1.get("error", {}).get("message") if isinstance(d1, dict) else None
                raise HTTPException(
                    status_code=400,
                    detail=err or f"Hashtag #{tag} gak ketemu di IG",
                )
            hashtag_id = d1["data"][0]["id"]

            # Step 2: top/recent media
            r2 = await client.get(f"{INSTAGRAM_GRAPH}/{hashtag_id}/{edge}", params={
                "user_id": ig_user_id,
                "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
                "access_token": token,
            })
            d2 = r2.json()
            if not isinstance(d2, dict) or "data" not in d2:
                err = d2.get("error", {}).get("message") if isinstance(d2, dict) else None
                raise HTTPException(
                    status_code=400,
                    detail=err or "Gagal ambil media dari hashtag",
                )
            media_items = d2["data"]
    except httpx.HTTPError as exc:
        logger.warning("IG hashtag discovery HTTP error: %s", exc)
        raise HTTPException(status_code=502, detail="Gagal hubungi Instagram")

    # IG public hashtag API tidak ngembaliin username creator (cuma media).
    # Jadi hasil ini = list MEDIA, bukan creator. User klik permalink buat
    # buka post → dari post bisa lihat siapa yg posting → manual tambah ke pool.
    # NOTE: Limitation IG API: hashtag endpoint tidak punya field `username`
    # untuk privacy reason. User harus buka link IG manual.
    items = [
        {
            "id": str(m.get("id")),
            "caption": (m.get("caption") or "")[:280],  # truncate
            "media_type": m.get("media_type"),
            "media_url": m.get("media_url"),
            "thumbnail_url": m.get("thumbnail_url") or m.get("media_url"),
            "permalink": m.get("permalink"),
            "timestamp": m.get("timestamp"),
            "like_count": m.get("like_count"),
            "comments_count": m.get("comments_count"),
        }
        for m in media_items
    ]
    return {
        "hashtag": tag,
        "hashtag_id": hashtag_id,
        "count": len(items),
        "items": items,
        "note": (
            "IG gak expose username creator di public hashtag API (privacy). "
            "Klik permalink buka post di IG → lihat creator-nya → manual "
            "tambah ke pool via tombol 'Tambah ke Pool'."
        ),
    }


# ─── Creator Marketplace Discovery ────────────────────────────────────────

class MarketplaceSearchIn(BaseModel):
    account_id: Optional[str] = None
    audience_country: Optional[str] = "ID"  # ISO 2-letter
    audience_city: Optional[str] = None
    follower_min: Optional[int] = None
    follower_max: Optional[int] = None
    interests: Optional[List[str]] = None  # ["food", "beauty", ...]


@router.post("/marketplace")
async def discover_marketplace(
    org_id: str,
    data: MarketplaceSearchIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search creator via IG Creator Marketplace API.

    PRECONDITIONS yang sering bikin gagal:
    - Scope `instagram_creator_marketplace_discovery` belum di-grant
      (butuh App Review Meta yg di-approve).
    - Akun Brand kita harus claim Meta Business Portfolio.
    - Creator harus opt-in ke Marketplace dari sisi mereka (di Indonesia
      adoption tipis, jadi hasil mungkin sedikit).

    Kalau IG balik error scope insufficient → user perlu Meta App Review
    + re-connect akun.
    """
    await _require_org_member(db, org_id, current_user)
    acc = await _get_ig_account(db, org_id, data.account_id)
    ig_user_id = acc.external_id
    token = acc.access_token

    # Build query params buat Marketplace search.
    params = {
        "access_token": token,
        "fields": "username,name,follower_count,profile_picture_url,biography,media_count",
    }
    if data.audience_country:
        params["audience_country"] = data.audience_country
    if data.audience_city:
        params["audience_city"] = data.audience_city
    if data.follower_min is not None:
        params["follower_count_min"] = data.follower_min
    if data.follower_max is not None:
        params["follower_count_max"] = data.follower_max
    if data.interests:
        params["interests"] = ",".join(data.interests)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Edge ini berdasar Meta docs Creator Marketplace API. Kalau
            # endpoint berubah, perlu update sesuai docs terbaru.
            r = await client.get(
                f"{INSTAGRAM_GRAPH}/{ig_user_id}/creator_marketplace_search",
                params=params,
            )
            d = r.json()
    except httpx.HTTPError as exc:
        logger.warning("IG marketplace HTTP error: %s", exc)
        raise HTTPException(status_code=502, detail="Gagal hubungi Instagram")

    if isinstance(d, dict) and "error" in d:
        err = d["error"]
        code = err.get("code")
        msg = err.get("message", "Marketplace API error")
        # Common errors → kasih hint yang actionable.
        hint = ""
        if code in (200, 10):
            hint = " Akun belum di-grant scope instagram_creator_marketplace_discovery — perlu App Review Meta."
        elif "permission" in msg.lower() or "not authorized" in msg.lower():
            hint = " Permission scope kurang. App Things perlu App Review buat scope marketplace."
        raise HTTPException(status_code=400, detail=f"{msg}.{hint}")

    creators = (d or {}).get("data") or []
    items = [
        {
            "ig_username": c.get("username"),
            "display_name": c.get("name"),
            "follower_count": c.get("follower_count"),
            "avatar_url": c.get("profile_picture_url"),
            "biography": (c.get("biography") or "")[:280],
            "media_count": c.get("media_count"),
        }
        for c in creators if c.get("username")
    ]
    return {"count": len(items), "items": items}
