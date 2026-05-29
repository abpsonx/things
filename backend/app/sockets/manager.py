"""Socket.IO manager for real-time features."""
import socketio
from typing import Dict, Any, Set

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",  # Allow all for development
    logger=True,
    engineio_logger=True
)

# In-memory storage for active users and their sids
# sid -> user_id
active_users: Dict[str, str] = {}


def online_user_ids() -> Set[str]:
    """User IDs currently connected (deduped across multiple tabs/devices)."""
    return set(active_users.values())


@sio.event
async def connect(sid, environ):
    print(f"User connected: {sid}")

@sio.event
async def disconnect(sid):
    user_id = active_users.pop(sid, None)
    print(f"User disconnected: {sid}")
    if user_id and user_id not in active_users.values():
        await sio.emit("presence_update", {"user_id": user_id, "online": False})
        # Stempel last_seen_at saat semua tab/koneksi user ini ditutup,
        # supaya UI DM bisa tampilkan "Terakhir online X menit lalu".
        try:
            await _stamp_last_seen(user_id)
        except Exception as e:
            print(f"[disconnect] failed to stamp last_seen for {user_id}: {e}")


async def _stamp_last_seen(user_id: str) -> None:
    from datetime import datetime, timezone
    from sqlalchemy import update as _sa_update
    from app.core.database import async_session
    from app.models.user import User
    async with async_session() as db:
        await db.execute(
            _sa_update(User).where(User.id == user_id).values(last_seen_at=datetime.now(timezone.utc))
        )
        await db.commit()

@sio.event
async def join_channel(sid, data):
    channel_id = data.get("channel_id")
    if channel_id:
        await sio.enter_room(sid, f"channel_{channel_id}")
        print(f"User {sid} joined channel: {channel_id}")

@sio.event
async def join_user(sid, data):
    user_id = data.get("user_id")
    if user_id:
        await sio.enter_room(sid, f"user_{user_id}")
        # First connection for this user → broadcast online
        was_offline = user_id not in active_users.values()
        active_users[sid] = user_id
        if was_offline:
            await sio.emit("presence_update", {"user_id": user_id, "online": True})
            # Catch-up: tandai semua DM yang ditujukan ke user ini (yang masih
            # belum delivered) sebagai delivered SEKARANG. Mirror behavior WA
            # di mana ✓ jadi ✓✓ begitu lawan bicara online lagi, walau dia
            # belum buka chat.
            try:
                await _mark_pending_dms_delivered(user_id)
            except Exception as e:
                print(f"[join_user] failed to flush pending dm deliveries for {user_id}: {e}")
        print(f"User {sid} registered as: {user_id}")


async def _mark_pending_dms_delivered(user_id: str) -> None:
    """When a user comes online, mark every DM addressed to them that's
    still pending delivery as delivered, and broadcast a dm_delivered event
    per channel so senders' UI updates ✓ → ✓✓ in real-time."""
    from datetime import datetime, timezone
    from sqlalchemy import select, and_
    from app.core.database import async_session
    from app.models.dm import DMChannel, DMMessage
    from app.api.dm import dm_ws_manager

    now = datetime.now(timezone.utc)
    async with async_session() as db:
        # Channels yang melibatkan user.
        ch_res = await db.execute(
            select(DMChannel).where(
                (DMChannel.user1_id == user_id) | (DMChannel.user2_id == user_id)
            )
        )
        channel_ids = [c.id for c in ch_res.scalars().all()]
        if not channel_ids:
            return

        # Ambil pesan yang user ini = recipient (bukan sender), belum delivered.
        msg_res = await db.execute(
            select(DMMessage).where(
                and_(
                    DMMessage.dm_channel_id.in_(channel_ids),
                    DMMessage.user_id != user_id,
                    DMMessage.is_delivered == False,
                )
            )
        )
        by_channel: dict = {}
        for m in msg_res.scalars().all():
            m.is_delivered = True
            m.delivered_at = now
            by_channel.setdefault(str(m.dm_channel_id), []).append(str(m.id))

        if not by_channel:
            return
        await db.commit()

    # Broadcast per channel — senders' WS will update ✓ → ✓✓ instantly.
    for ch_id, msg_ids in by_channel.items():
        await dm_ws_manager.broadcast(ch_id, {
            "type": "dm_delivered",
            "channel_id": ch_id,
            "message_ids": msg_ids,
            "delivered_at": now.isoformat(),
        })


@sio.event
async def leave_channel(sid, data):

    channel_id = data.get("channel_id")
    if channel_id:
        await sio.leave_room(sid, f"channel_{channel_id}")
        print(f"User {sid} left channel: {channel_id}")

@sio.event
async def send_message(sid, data):
    # This is a fallback, normally messages go through REST API
    # and are then broadcasted via Socket.IO
    channel_id = data.get("channel_id")
    content = data.get("content")
    user_id = data.get("user_id")
    
    if channel_id and content:
        # Broadcast to everyone in the room except sender (optionally)
        await sio.emit("new_message", {
            "channel_id": channel_id,
            "content": content,
            "user_id": user_id,
            "created_at": "now" # In real usage, this comes from DB
        }, room=f"channel_{channel_id}")
@sio.event
async def typing(sid, data):
    """Relay a typing indicator to everyone else in the room.

    data: { room: "channel_<id>" | "team_<id>", user_id, name, typing: bool }
    """
    room = data.get("room")
    if not room:
        return
    await sio.emit(
        "typing",
        {
            "room": room,
            "user_id": data.get("user_id"),
            "name": data.get("name"),
            "typing": bool(data.get("typing")),
        },
        room=room,
        skip_sid=sid,
    )


@sio.event
async def join_team(sid, team_id):
    if team_id:
        await sio.enter_room(sid, f"team_{team_id}")
        print(f"User {sid} joined team room: {team_id}")

@sio.event
async def leave_team(sid, team_id):
    if team_id:
        await sio.leave_room(sid, f"team_{team_id}")
        print(f"User {sid} left team room: {team_id}")
