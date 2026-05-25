from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from typing import List

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.notification import Notification
from app.schemas import NotificationResponse

router = APIRouter(prefix="/users/me/notifications", tags=["Notifications"])

# Presence endpoint lives on a different prefix but is small enough to ship
# from this file. Frontend hits /users/online to seed its presence store
# and then listens to the `presence_update` Socket.IO event for diffs.
presence_router = APIRouter(prefix="/users", tags=["Presence"])


@presence_router.get("/online")
async def list_online_users(current_user: User = Depends(get_current_user)):
    from app.sockets.manager import online_user_ids
    return {"online": sorted(online_user_ids())}


@presence_router.patch("/me/team-colors")
async def set_team_color(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set this user's personal bullet color for a team. Body: {team_id, color}.
    Pass color=null/"" to reset to the default."""
    team_id = str(data.get("team_id") or "").strip()
    color = data.get("color")
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id wajib")
    colors = dict(current_user.team_colors or {})
    if color:
        colors[team_id] = color
    else:
        colors.pop(team_id, None)
    current_user.team_colors = colors  # reassign so SQLAlchemy tracks the change
    await db.commit()
    return {"team_colors": colors}

@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()

@router.patch("/{notif_id}/read")
async def mark_notification_as_read(
    notif_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notif_id,
            Notification.user_id == current_user.id
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notif.is_read = True
    await db.commit()
    return {"status": "success"}

@router.post("/read-all")
async def mark_all_notifications_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"status": "success"}

@router.get("/chat-unread")
async def get_unread_chat_counts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get unread chat message counts grouped by project."""
    from sqlalchemy import text
    query = """
    SELECT c.project_id, COUNT(m.id) as unread_count
    FROM messages m
    JOIN channels c ON m.channel_id = c.id
    WHERE m.user_id != :user_id
    AND NOT m.read_by @> cast(:search as jsonb)
    GROUP BY c.project_id
    """
    
    result = await db.execute(text(query), {
        "user_id": str(current_user.id), 
        "search": f'[{{"id": "{current_user.id}"}}]'
    })
    
    counts = {}
    for row in result:
        counts[str(row[0])] = row[1]

    return counts


@router.get("/workspace-chat-unread")
async def get_unread_workspace_chat_counts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unread workspace-chat message counts grouped by org_id."""
    from sqlalchemy import text
    query = """
    SELECT c.org_id, COUNT(m.id) as unread_count
    FROM messages m
    JOIN channels c ON m.channel_id = c.id
    WHERE c.org_id IS NOT NULL
    AND m.user_id != :user_id
    AND NOT m.read_by @> cast(:search as jsonb)
    GROUP BY c.org_id
    """
    result = await db.execute(text(query), {
        "user_id": str(current_user.id),
        "search": f'[{{"id": "{current_user.id}"}}]',
    })
    return {str(row[0]): row[1] for row in result}

@router.get("/vapid-public-key")
async def get_vapid_key():
    from app.core.config import get_settings
    return {"publicKey": get_settings().VAPID_PUBLIC_KEY}

@router.post("/push-subscribe")
async def subscribe_push(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.notification import PushSubscription
    
    # Check if subscription already exists for this device/endpoint
    endpoint = data.get("endpoint")
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == endpoint
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        existing.p256dh = data.get("keys", {}).get("p256dh")
        existing.auth = data.get("keys", {}).get("auth")
    else:
        new_sub = PushSubscription(
            user_id=current_user.id,
            endpoint=endpoint,
            p256dh=data.get("keys", {}).get("p256dh"),
            auth=data.get("keys", {}).get("auth")
        )
        db.add(new_sub)
        
    await db.commit()
    return {"status": "success"}
@router.post("/test-push")
async def send_test_push(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a test push to the caller and report what happened to each
    of their push subscriptions, so the UI can show actionable feedback."""
    from app.models.notification import PushSubscription
    from app.services.push import send_push_notification
    from app.core.config import get_settings
    from sqlalchemy import delete
    import json as _json

    cfg = get_settings()
    diag = {
        "vapid_public_key_len": len(cfg.VAPID_PUBLIC_KEY or ""),
        "vapid_private_key_len": len(cfg.VAPID_PRIVATE_KEY or ""),
        "vapid_email": cfg.VAPID_CLAIMS_EMAIL,
    }

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == current_user.id)
    )
    subs = result.scalars().all()
    diag["subscription_count"] = len(subs)

    if not subs:
        return {
            "status": "no_subscription",
            "message": "Browser ini belum subscribe push. Pastikan klik Allow saat browser tanya, lalu reload.",
            "diag": diag,
        }

    import uuid as _uuid
    payload = {
        "title": "Things",
        "body": "Ini notif percobaan dari server 🚀",
        "url": "/dashboard",
        "icon": "/assets/logo.png",
        # Unique tag per test so macOS always shows it as a fresh banner
        # instead of silently merging into the previous test notif.
        "tag": f"test-push-{_uuid.uuid4()}",
    }

    outcomes = []
    dead_ids = []
    for sub in subs:
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        outcome, detail = send_push_notification(sub_info, payload)
        outcomes.append({
            "endpoint": sub.endpoint[:60] + "...",
            "outcome": outcome,
            "detail": detail,
        })
        if outcome == "dead":
            dead_ids.append(sub.id)

    if dead_ids:
        await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead_ids)))
        await db.commit()

    any_sent = any(o["outcome"] == "sent" for o in outcomes)
    return {
        "status": "ok" if any_sent else "all_failed",
        "message": (
            "Push terkirim ke push service. Cek notification center OS Anda."
            if any_sent
            else "Push gagal terkirim. Cek diag + outcomes untuk detail."
        ),
        "diag": diag,
        "outcomes": outcomes,
    }
