"""Platform-level user administration — promote/demote platform roles.

Super User / Developer only. Lets an SU manage who else holds platform-tier
access (super_user / developer / staff) without poking the database.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import SUPERUSER_ROLES, is_superuser
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/platform-users", tags=["Platform Users"])

# Roles a Super User is allowed to assign.
ALLOWED_ROLES = {"super_user", "developer", "staff"}


class PlatformUserResponse(BaseModel):
    id: UUID
    name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    is_verified: bool = False

    class Config:
        from_attributes = True


class RoleUpdate(BaseModel):
    role: str


def _require_su(user: User) -> None:
    if not is_superuser(user):
        raise HTTPException(status_code=403, detail="Hanya Super User / Developer yang bisa mengakses ini")


@router.get("", response_model=List[PlatformUserResponse])
async def list_platform_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_su(current_user)
    res = await db.execute(select(User).order_by(User.created_at.desc()))
    return res.scalars().all()


@router.patch("/{user_id}/role", response_model=PlatformUserResponse)
async def set_platform_role(
    user_id: str,
    data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_su(current_user)
    new_role = (data.role or "").strip()
    if new_role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Role tidak valid. Pilih salah satu: {', '.join(sorted(ALLOWED_ROLES))}")

    target_res = await db.execute(select(User).where(User.id == UUID(user_id)))
    target = target_res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    if target.role == new_role:
        return target  # no-op

    # Lockout protection: if demoting the LAST superuser/developer on the
    # platform, refuse — otherwise no one can administer it anymore.
    if target.role in SUPERUSER_ROLES and new_role not in SUPERUSER_ROLES:
        count_res = await db.execute(
            select(func.count(User.id)).where(User.role.in_(SUPERUSER_ROLES))
        )
        remaining = (count_res.scalar() or 0) - 1
        if remaining < 1:
            raise HTTPException(
                status_code=400,
                detail="Tidak bisa demote: minimal harus ada 1 Super User / Developer di platform.",
            )

    target.role = new_role
    await db.commit()
    await db.refresh(target)
    return target
