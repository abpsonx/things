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
