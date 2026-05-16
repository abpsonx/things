"""Rate limiting configuration using slowapi.

Superusers (admin/developer) bypass the limiter: every request gets a
unique key, so no two requests share a bucket.
"""
import uuid
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.security import decode_token
from app.core.permissions import SUPERUSER_ROLES


def _key_func(request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = decode_token(auth.split(" ", 1)[1])
        if payload and payload.get("role") in SUPERUSER_ROLES:
            return f"superuser:{uuid.uuid4()}"
    return get_remote_address(request)


limiter = Limiter(key_func=_key_func)
