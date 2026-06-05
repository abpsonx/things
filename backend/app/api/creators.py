"""Creator Pool API — org-scoped CRUD + campaign history.

Akses: semua anggota workspace boleh add/edit/list. Delete (creator atau
campaign) cuma boleh oleh owner/manager workspace + SU/Dev.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func as safunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.permissions import is_superuser
from app.dependencies import get_current_user
from app.models.user import User
from app.models.organization import OrgMember
from app.models.creator import Creator, CreatorCampaign
from app.schemas import (
    CreatorCreate, CreatorUpdate, CreatorResponse, CreatorDetailResponse,
    CreatorCampaignCreate, CreatorCampaignUpdate, CreatorCampaignResponse,
)

router = APIRouter(prefix="/organizations/{org_id}/creators", tags=["Creator Pool"])

VALID_STATUSES = {"active", "inactive", "blacklist"}
VALID_TIERS = {"nano", "micro", "mid", "macro", "mega"}
VALID_CAMPAIGN_STATUSES = {"planned", "ongoing", "done", "cancelled"}


async def _require_org_member(db: AsyncSession, org_id: str, user: User) -> OrgMember:
    if is_superuser(user):
        # SU/Dev: return a synthetic membership object (gak strict cek role).
        return OrgMember(org_id=org_id, user_id=user.id, role="owner")
    res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user.id)
    )
    om = res.scalar_one_or_none()
    if not om:
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")
    return om


async def _require_manager(db: AsyncSession, org_id: str, user: User) -> None:
    om = await _require_org_member(db, org_id, user)
    if om.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Cuma Admin/Manager workspace yang bisa")


def _normalize_username(raw: str) -> str:
    return raw.strip().lstrip("@").lower()


def _serialize(c: Creator) -> dict:
    """Build response dict — termasuk agregat campaign."""
    campaigns = c.campaigns or []
    done = [ca for ca in campaigns if ca.status == "done" and ca.budget]
    total = sum((ca.budget or 0) for ca in done)
    last = None
    dated = [ca for ca in campaigns if ca.campaign_date]
    if dated:
        last = max(ca.campaign_date for ca in dated)
    return {
        "id": c.id, "org_id": c.org_id,
        "ig_username": c.ig_username, "display_name": c.display_name,
        "avatar_url": c.avatar_url, "tier": c.tier,
        "follower_count": c.follower_count, "categories": c.categories or [],
        "location": c.location,
        "contact_email": c.contact_email, "contact_phone": c.contact_phone, "contact_wa": c.contact_wa,
        "rate_card": c.rate_card or {}, "notes": c.notes, "status": c.status,
        "created_by": c.created_by,
        "created_at": c.created_at, "updated_at": c.updated_at,
        "campaign_count": len(campaigns),
        "total_spent": total,
        "last_campaign_date": last,
    }


# ─── Creator CRUD ─────────────────────────────────────────────────────────

@router.get("", response_model=List[CreatorResponse])
async def list_creators(
    org_id: str,
    q: Optional[str] = Query(None, description="Search by username/name"),
    status: Optional[str] = Query(None, description="Filter status"),
    tier: Optional[str] = Query(None, description="Filter tier"),
    category: Optional[str] = Query(None, description="Filter satu kategori"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List semua creator workspace ini. Support search + filter."""
    await _require_org_member(db, org_id, current_user)
    stmt = (
        select(Creator)
        .options(selectinload(Creator.campaigns))
        .where(Creator.org_id == org_id)
    )
    if status and status in VALID_STATUSES:
        stmt = stmt.where(Creator.status == status)
    if tier and tier in VALID_TIERS:
        stmt = stmt.where(Creator.tier == tier)
    if q:
        like = f"%{q.lower()}%"
        # Search broad: username, nama, lokasi, kontak, notes.
        # COALESCE(..., '') biar field NULL gak match dgn pattern like '%%'.
        stmt = stmt.where(
            safunc.lower(Creator.ig_username).like(like)
            | safunc.lower(safunc.coalesce(Creator.display_name, "")).like(like)
            | safunc.lower(safunc.coalesce(Creator.location, "")).like(like)
            | safunc.lower(safunc.coalesce(Creator.notes, "")).like(like)
            | safunc.lower(safunc.coalesce(Creator.contact_email, "")).like(like)
            | safunc.lower(safunc.coalesce(Creator.contact_phone, "")).like(like)
            | safunc.lower(safunc.coalesce(Creator.contact_wa, "")).like(like)
        )
    stmt = stmt.order_by(Creator.created_at.desc())
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    if category:
        # JSONB filter di Python (gak banyak data biasanya — workspace skalanya ratusan)
        rows = [c for c in rows if category in (c.categories or [])]
    return [_serialize(c) for c in rows]


@router.post("", response_model=CreatorResponse, status_code=status.HTTP_201_CREATED)
async def create_creator(
    org_id: str,
    data: CreatorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tambah creator ke pool. Semua anggota workspace boleh."""
    await _require_org_member(db, org_id, current_user)
    uname = _normalize_username(data.ig_username)
    if not uname:
        raise HTTPException(status_code=400, detail="ig_username wajib")
    # Cek duplikat per org
    dup = await db.execute(
        select(Creator).where(Creator.org_id == org_id, Creator.ig_username == uname)
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Creator @{uname} sudah ada di pool")

    tier = data.tier if data.tier in VALID_TIERS else None
    st = data.status if data.status in VALID_STATUSES else "active"

    c = Creator(
        org_id=org_id,
        ig_username=uname,
        display_name=data.display_name,
        avatar_url=data.avatar_url,
        tier=tier,
        follower_count=data.follower_count,
        categories=data.categories or [],
        location=data.location,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
        contact_wa=data.contact_wa,
        rate_card=data.rate_card or {},
        notes=data.notes,
        status=st,
        created_by=current_user.id,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    # Reload campaigns (empty) buat _serialize
    res = await db.execute(
        select(Creator).options(selectinload(Creator.campaigns)).where(Creator.id == c.id)
    )
    return _serialize(res.scalar_one())


@router.get("/{creator_id}", response_model=CreatorDetailResponse)
async def get_creator(
    org_id: str, creator_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detail creator + full campaign history."""
    await _require_org_member(db, org_id, current_user)
    res = await db.execute(
        select(Creator)
        .options(
            selectinload(Creator.campaigns).selectinload(CreatorCampaign.brand),
        )
        .where(Creator.id == creator_id, Creator.org_id == org_id)
    )
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Creator tidak ditemukan")
    base = _serialize(c)
    base["campaigns"] = c.campaigns or []
    return base


@router.patch("/{creator_id}", response_model=CreatorResponse)
async def update_creator(
    org_id: str, creator_id: str,
    data: CreatorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_org_member(db, org_id, current_user)
    res = await db.execute(
        select(Creator).options(selectinload(Creator.campaigns))
        .where(Creator.id == creator_id, Creator.org_id == org_id)
    )
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Creator tidak ditemukan")

    payload = data.model_dump(exclude_unset=True)
    if "ig_username" in payload and payload["ig_username"]:
        uname = _normalize_username(payload["ig_username"])
        if uname != c.ig_username:
            dup = await db.execute(
                select(Creator).where(
                    Creator.org_id == org_id,
                    Creator.ig_username == uname,
                    Creator.id != c.id,
                )
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=400, detail=f"@{uname} sudah ada")
            c.ig_username = uname
        payload.pop("ig_username")
    if "tier" in payload and payload["tier"] not in VALID_TIERS:
        payload.pop("tier")
    if "status" in payload and payload["status"] not in VALID_STATUSES:
        payload.pop("status")

    for k, v in payload.items():
        setattr(c, k, v)
    await db.commit()
    await db.refresh(c)
    res2 = await db.execute(
        select(Creator).options(selectinload(Creator.campaigns)).where(Creator.id == c.id)
    )
    return _serialize(res2.scalar_one())


@router.delete("/{creator_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_creator(
    org_id: str, creator_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete cuma boleh Manager+ — biar gak ada anggota nakal hapus pool."""
    await _require_manager(db, org_id, current_user)
    res = await db.execute(
        select(Creator).where(Creator.id == creator_id, Creator.org_id == org_id)
    )
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Creator tidak ditemukan")
    await db.delete(c)
    await db.commit()
    return None


# ─── Campaign history per creator ────────────────────────────────────────

@router.post("/{creator_id}/campaigns", response_model=CreatorCampaignResponse, status_code=status.HTTP_201_CREATED)
async def add_campaign(
    org_id: str, creator_id: str,
    data: CreatorCampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_org_member(db, org_id, current_user)
    # Pastikan creator ada di org ini
    res = await db.execute(
        select(Creator.id).where(Creator.id == creator_id, Creator.org_id == org_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Creator tidak ditemukan")

    st = data.status if data.status in VALID_CAMPAIGN_STATUSES else "planned"
    cc = CreatorCampaign(
        creator_id=creator_id,
        brand_id=data.brand_id,
        title=data.title.strip(),
        campaign_date=data.campaign_date,
        deliverables=data.deliverables or [],
        budget=data.budget,
        status=st,
        result_notes=data.result_notes,
        design_brief_id=data.design_brief_id,
        content_brief_id=data.content_brief_id,
        created_by=current_user.id,
    )
    db.add(cc)
    await db.commit()
    await db.refresh(cc)
    res2 = await db.execute(
        select(CreatorCampaign).options(selectinload(CreatorCampaign.brand))
        .where(CreatorCampaign.id == cc.id)
    )
    return res2.scalar_one()


@router.patch("/{creator_id}/campaigns/{campaign_id}", response_model=CreatorCampaignResponse)
async def update_campaign(
    org_id: str, creator_id: str, campaign_id: str,
    data: CreatorCampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_org_member(db, org_id, current_user)
    res = await db.execute(
        select(CreatorCampaign).join(Creator).where(
            CreatorCampaign.id == campaign_id,
            CreatorCampaign.creator_id == creator_id,
            Creator.org_id == org_id,
        )
    )
    cc = res.scalar_one_or_none()
    if not cc:
        raise HTTPException(status_code=404, detail="Campaign tidak ditemukan")

    payload = data.model_dump(exclude_unset=True)
    if "status" in payload and payload["status"] not in VALID_CAMPAIGN_STATUSES:
        payload.pop("status")
    for k, v in payload.items():
        setattr(cc, k, v)
    await db.commit()
    await db.refresh(cc)
    res2 = await db.execute(
        select(CreatorCampaign).options(selectinload(CreatorCampaign.brand))
        .where(CreatorCampaign.id == cc.id)
    )
    return res2.scalar_one()


@router.delete("/{creator_id}/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    org_id: str, creator_id: str, campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_org_member(db, org_id, current_user)
    res = await db.execute(
        select(CreatorCampaign).join(Creator).where(
            CreatorCampaign.id == campaign_id,
            CreatorCampaign.creator_id == creator_id,
            Creator.org_id == org_id,
        )
    )
    cc = res.scalar_one_or_none()
    if not cc:
        raise HTTPException(status_code=404, detail="Campaign tidak ditemukan")
    await db.delete(cc)
    await db.commit()
    return None
