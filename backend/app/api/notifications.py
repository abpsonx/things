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
    from app.services.notification import notify_user
    await notify_user(
        db,
        user_id=str(current_user.id),
        type="test",
        content="Ini adalah notifikasi percobaan dari Things! 🚀"
    )
    return {"status": "success"}
