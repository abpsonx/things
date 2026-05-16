"""Role-based permission helpers.

A "superuser" is any user whose User.role grants global access across the
entire system, bypassing per-organization role checks. Currently this
includes "admin" and "developer".
"""
from typing import Optional
from app.models.user import User

SUPERUSER_ROLES = frozenset({"admin", "developer"})
DEVELOPER_ROLE = "developer"


def is_superuser(user: Optional[User]) -> bool:
    return user is not None and getattr(user, "role", None) in SUPERUSER_ROLES


def is_developer(user: Optional[User]) -> bool:
    return user is not None and getattr(user, "role", None) == DEVELOPER_ROLE
