"""Brand labels — org-scoped endpoint.

Brand labels awalnya cuma ada per-team (lewat /briefs/_brands).
Sekarang juga bisa org-scoped supaya UnifiedCalendar (yang dipakai di
global / workspace / project / team) bisa pick label tanpa kebelet team.

GET endpoint balikin UNION: brand org-level + brand team-level dari semua
team yg user adalah member-nya. Frontend tinggal render satu list.
POST create brand baru org-level (team_id=NULL).
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_, func as safunc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.team import TeamMember
from app.models.organization import OrgMember
from app.models.design_brief import DesignBrand
from app.schemas import DesignBrandCreate, DesignBrandResponse

router = APIRouter(prefix="/organizations/{org_id}/brands", tags=["Brand Labels"])


async def _require_org_member(db: AsyncSession, org_id: str, user_id) -> None:
    res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")


@router.get("", response_model=List[DesignBrandResponse])
async def list_org_brands(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List semua brand yg visible buat user di workspace ini.

    Union: brand org-level (org_id match, team_id NULL) + brand semua team
    user adalah member-nya. Dedup tidak dilakukan karena tiap brand punya
    id unik.
    """
    await _require_org_member(db, org_id, current_user.id)
    team_ids_q = select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
    team_ids = list((await db.execute(team_ids_q)).scalars().all())

    res = await db.execute(
        select(DesignBrand)
        .where(
            or_(
                DesignBrand.org_id == org_id,
                DesignBrand.team_id.in_(team_ids) if team_ids else False,
            )
        )
        .order_by(DesignBrand.name)
    )
    return list(res.scalars().all())


@router.post("", response_model=DesignBrandResponse, status_code=status.HTTP_201_CREATED)
async def create_org_brand(
    org_id: str,
    data: DesignBrandCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create brand org-level (team_id NULL). Dipakai dari kalender."""
    await _require_org_member(db, org_id, current_user.id)
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama brand wajib")
    # Cek duplicate per org (case-insensitive, di lingkup org-level brands).
    dup = await db.execute(
        select(DesignBrand).where(
            DesignBrand.org_id == org_id,
            DesignBrand.team_id.is_(None),
            safunc.lower(DesignBrand.name) == name.lower(),
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Brand dengan nama itu sudah ada")
    brand = DesignBrand(org_id=org_id, team_id=None, name=name, color=data.color)
    db.add(brand)
    await db.commit()
    await db.refresh(brand)
    return brand
