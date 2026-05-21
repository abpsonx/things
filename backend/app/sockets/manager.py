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
        print(f"User {sid} registered as: {user_id}")


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
