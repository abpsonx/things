"""Socket.IO manager for real-time features."""
import socketio
from typing import Dict, Any

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",  # Allow all for development
    logger=True,
    engineio_logger=True
)

# In-memory storage for active users and their sids
# sid -> user_id
active_users: Dict[str, str] = {}

@sio.event
async def connect(sid, environ):
    print(f"User connected: {sid}")

@sio.event
async def disconnect(sid):
    if sid in active_users:
        del active_users[sid]
    print(f"User disconnected: {sid}")

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
        active_users[sid] = user_id
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
