"""Notification service to handle DB and Push notifications."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.notification import Notification, PushSubscription
from app.services.push import send_push_notification
import logging

async def notify_user(
    db: AsyncSession, 
    user_id: str, 
    type: str, 
    content: str, 
    ref_id: str = None,
    org_id: str = None
):
    """
    Send a notification to a user (save to DB + trigger Web Push).
    """
    notif_type = type  # Avoid shadowing built-in type()

    # Ensure user_id is UUID object if it's a string
    from uuid import UUID as PyUUID
    if isinstance(user_id, str):
        try:
            user_id = PyUUID(user_id)
        except ValueError:
            pass

    if ref_id and isinstance(ref_id, str):
        try:
            ref_id = PyUUID(ref_id)
        except ValueError:
            pass

    # 1. Save to Database
    notif = Notification(
        user_id=user_id,
        type=notif_type,
        content=content,
        ref_id=ref_id
    )
    db.add(notif)
    await db.commit()  # Commit to get ID and ensure it's saved

    # 2. Get Push Subscriptions
    print(f"[NOTIFY] Looking for push subscriptions for user_id={user_id}")
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    subscriptions = result.scalars().all()
    print(f"[NOTIFY] Found {len(subscriptions)} push subscription(s)")

    # 3. Send Push Notifications
    push_data = {
        "title": "Things Update",
        "body": content,
        "url": "/dashboard",
        "icon": "/assets/logo.png"
    }

    for i, sub in enumerate(subscriptions):
        print(f"[NOTIFY] Sending push #{i+1} to endpoint: {sub.endpoint[:60]}...")
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {
                "p256dh": sub.p256dh,
                "auth": sub.auth
            }
        }
        success = send_push_notification(sub_info, push_data)
        print(f"[NOTIFY] Push #{i+1} result: {'SUCCESS' if success else 'FAILED'}")

    # 4. Broadcast via Socket.IO for in-app UI update
    from app.sockets.manager import sio
    await sio.emit("new_notification", {
        "id": str(notif.id),
        "type": notif_type,
        "content": content,
        "ref_id": str(ref_id) if ref_id else None,
        "is_read": False,
        "created_at": notif.created_at.isoformat()
    }, room=f"user_{user_id}")

    return notif
