"""Role-based permission helpers.

A "superuser" is any user whose platform-level User.role grants global
access across the entire system (every workspace + platform settings),
bypassing per-workspace role checks: "super_user" (business owner) and
"developer" (technical owner).

NOTE: "admin" is a per-WORKSPACE role (OrgMember.role), NOT a platform
superuser — it must never be in this set.
"""
from typing import Optional
from app.models.user import User

SUPERUSER_ROLES = frozenset({"super_user", "developer"})
DEVELOPER_ROLE = "developer"


def is_superuser(user: Optional[User]) -> bool:
    return user is not None and getattr(user, "role", None) in SUPERUSER_ROLES


def is_developer(user: Optional[User]) -> bool:
    return user is not None and getattr(user, "role", None) == DEVELOPER_ROLE


# ---- Workspace-scoped role checks (Manager+ = manager/owner-Admin/superuser) ----

async def _org_role(db, org_id, user_id) -> Optional[str]:
    from sqlalchemy import select
    from app.models.organization import OrgMember
    res = await db.execute(
        select(OrgMember.role).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    return res.scalar_one_or_none()


async def can_manage_org(db, org_id, user: User) -> bool:
    """True for Manager / Admin (owner role) / Super User / Developer."""
    if is_superuser(user):
        return True
    return (await _org_role(db, org_id, user.id)) in ("owner", "manager")


async def _project_org_id(db, project_id):
    from sqlalchemy import select
    from app.models.project import Project
    res = await db.execute(select(Project.org_id).where(Project.id == project_id))
    return res.scalar_one_or_none()


async def require_project_manager(db, project_id, user: User):
    """Raise 403 unless the user is Manager+ in the project's workspace."""
    from fastapi import HTTPException
    org_id = await _project_org_id(db, project_id)
    if not org_id or not await can_manage_org(db, org_id, user):
        raise HTTPException(status_code=403, detail="Hanya Manager ke atas yang bisa aksi ini")


async def require_org_manager(db, org_id, user: User):
    from fastapi import HTTPException
    if not await can_manage_org(db, org_id, user):
        raise HTTPException(status_code=403, detail="Hanya Manager ke atas yang bisa aksi ini")
