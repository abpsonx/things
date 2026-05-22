"""Social media module — connected brand accounts (Instagram + TikTok).

Foundation only for now: list/disconnect accounts and report whether the
platform OAuth apps are configured. The OAuth connect flow and metric/post
sync are wired in once the Meta + TikTok developer apps exist.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any
from app.core.database import get_db
from app.core.config import get_settings
from app.models.user import User
from app.models.organization import OrgMember
from app.models.social_account import SocialAccount
from app.dependencies import get_current_user

router = APIRouter(prefix="/organizations/{org_id}/sosmed", tags=["Social Media"])


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
