"""Direct Messaging endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, update
from sqlalchemy.orm import selectinload
from typing import List, Optional
import os, uuid, shutil, logging, json
logger = logging.getLogger(__name__)
from app.core.database import get_db
from app.models.user import User
from app.models.dm import DMChannel, DMMessage
from app.dependencies import get_current_user
from app.sockets.dm_ws import dm_ws_manager
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime, timezone
import asyncio

router = APIRouter(prefix="/dm", tags=["Direct Messages"])

class DMChannelCreate(BaseModel):
    org_id: UUID
    other_user_id: UUID

class DMMessageCreate(BaseModel):
    content: str
    temp_id: Optional[str] = None

class ReactionCreate(BaseModel):
    emoji: str


# ─── REST Endpoints ──────────────────────────────────────────────────────────

@router.get("/channels")
async def list_dm_channels(
    org_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all DM channels for the current user in an organization."""
    result = await db.execute(
        select(DMChannel)
        .options(selectinload(DMChannel.user1), selectinload(DMChannel.user2))
        .where(
            and_(
                DMChannel.org_id == org_id,
                or_(DMChannel.user1_id == current_user.id, DMChannel.user2_id == current_user.id)
            )
        )
    )
    return result.scalars().all()

@router.post("/channels", status_code=status.HTTP_201_CREATED)
async def get_or_create_dm_channel(
    data: DMChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find or create a 1-on-1 DM channel."""
    result = await db.execute(
        select(DMChannel)
        .options(selectinload(DMChannel.user1), selectinload(DMChannel.user2))
        .where(
            and_(
                DMChannel.org_id == data.org_id,
                or_(
                    and_(DMChannel.user1_id == current_user.id, DMChannel.user2_id == data.other_user_id),
                    and_(DMChannel.user1_id == data.other_user_id, DMChannel.user2_id == current_user.id)
                )
            )
        )
    )
    channel = result.scalar_one_or_none()
    
    if not channel:
        channel = DMChannel(
            org_id=data.org_id,
            user1_id=current_user.id,
            user2_id=data.other_user_id
        )
        db.add(channel)
        await db.commit()
        await db.refresh(channel, ["user1", "user2"])
        
    return channel

@router.get("/channels/{channel_id}/messages")
async def get_dm_messages(
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get message history for a DM channel."""
    result = await db.execute(
        select(DMMessage)
        .options(selectinload(DMMessage.user))
        .where(DMMessage.dm_channel_id == channel_id)
        .order_by(DMMessage.created_at.asc())
    )
    return result.scalars().all()

@router.post("/channels/{channel_id}/messages")
async def send_dm_message(
    channel_id: str,
    data: DMMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message in a DM channel."""
    now = datetime.now(timezone.utc)
    message = DMMessage(
        dm_channel_id=channel_id,
        user_id=current_user.id,
        content=data.content,
        is_delivered=False,
        is_read=False,
        delivered_at=None,
        read_at=None,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Broadcast via native WebSocket to all clients in this channel
    payload = {
        "type": "dm_received",
        "channel_id": str(channel_id),
        "message": {
            "id": str(message.id),
            "content": message.content,
            "user_id": str(current_user.id),
            "dm_channel_id": str(channel_id),
            "created_at": message.created_at.isoformat(),
            "attachment_url": None,
            "attachment_name": None,
            "is_read": False,
            "is_delivered": False,
            "read_at": None,
            "delivered_at": None,
            "reactions": {},
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "avatar_url": current_user.avatar_url
            },
            "temp_id": data.temp_id
        }
    }
    await dm_ws_manager.broadcast(channel_id, payload)
    
    return {
        "id": str(message.id),
        "content": message.content,
        "user_id": str(current_user.id),
        "dm_channel_id": str(channel_id),
        "created_at": message.created_at.isoformat(),
        "is_read": False,
        "is_delivered": False,
        "read_at": None,
        "delivered_at": None,
        "reactions": {},
        "user": {"id": str(current_user.id), "name": current_user.name, "avatar_url": current_user.avatar_url},
        "temp_id": data.temp_id
    }

@router.put("/messages/{message_id}")
async def edit_dm_message(
    message_id: UUID,
    data: DMMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an existing DM message."""
    result = await db.execute(
        select(DMMessage).where(DMMessage.id == message_id, DMMessage.user_id == current_user.id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan atau bukan milik Anda")
    
    message.content = data.content
    await db.commit()

    # Broadcast edit event
    await dm_ws_manager.broadcast(str(message.dm_channel_id), {
        "type": "dm_edited",
        "channel_id": str(message.dm_channel_id),
        "message": {"id": str(message.id), "content": message.content}
    })

    return message

@router.delete("/messages/{message_id}")
async def delete_dm_message(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a DM message."""
    result = await db.execute(
        select(DMMessage).where(DMMessage.id == message_id, DMMessage.user_id == current_user.id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan atau bukan milik Anda")
    
    channel_id = str(message.dm_channel_id)
    msg_id = str(message.id)

    await db.delete(message)
    await db.commit()

    # Broadcast delete event
    await dm_ws_manager.broadcast(channel_id, {
        "type": "dm_deleted",
        "channel_id": channel_id,
        "message_id": msg_id
    })

    return {"status": "success"}

@router.post("/channels/{channel_id}/attachments")
async def upload_dm_attachment(
    channel_id: UUID,
    file: UploadFile = File(...),
    temp_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file in a DM channel. Supports any file type."""
    os.makedirs("uploads", exist_ok=True)
    
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join("uploads", unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_size = os.path.getsize(file_path)
    
    message = DMMessage(
        dm_channel_id=channel_id,
        user_id=current_user.id,
        content=file.filename or "Sent a file",
        attachment_url=f"/api/uploads/{unique_filename}",
        attachment_name=file.filename or "file",
        is_delivered=False,
        is_read=False,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    
    # Detect file type for preview
    is_image = bool(file.filename and file.filename.lower().split('.')[-1] in ('jpg','jpeg','png','gif','webp','svg','bmp','ico'))
    is_video = bool(file.filename and file.filename.lower().split('.')[-1] in ('mp4','webm','mov','avi','mkv','wmv'))
    is_audio = bool(file.filename and file.filename.lower().split('.')[-1] in ('mp3','wav','ogg','aac','flac','m4a'))
    is_pdf = bool(file.filename and file.filename.lower().split('.')[-1] == 'pdf')
    
    # Broadcast via native WebSocket
    await dm_ws_manager.broadcast(str(channel_id), {
        "type": "dm_received",
        "channel_id": str(channel_id),
        "message": {
            "id": str(message.id),
            "content": message.content,
            "user_id": str(current_user.id),
            "dm_channel_id": str(channel_id),
            "created_at": message.created_at.isoformat(),
            "attachment_url": message.attachment_url,
            "attachment_name": message.attachment_name,
            "file_size": file_size,
            "is_image": is_image,
            "is_video": is_video,
            "is_audio": is_audio,
            "is_pdf": is_pdf,
            "is_read": False,
            "is_delivered": False,
            "read_at": None,
            "delivered_at": None,
            "reactions": {},
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "avatar_url": current_user.avatar_url
            },
            "temp_id": temp_id
        }
    })
    
    return {
        "id": str(message.id),
        "content": message.content,
        "user_id": str(current_user.id),
        "dm_channel_id": str(channel_id),
        "created_at": message.created_at.isoformat(),
        "attachment_url": message.attachment_url,
        "attachment_name": message.attachment_name,
        "file_size": file_size,
        "is_image": is_image,
        "is_video": is_video,
        "is_audio": is_audio,
        "is_pdf": is_pdf,
        "is_read": False,
        "is_delivered": False,
        "read_at": None,
        "delivered_at": None,
        "reactions": {},
        "user": {
            "id": str(current_user.id),
            "name": current_user.name,
            "avatar_url": current_user.avatar_url
        },
        "temp_id": temp_id
    }


# ─── Reactions ────────────────────────────────────────────────────────────────

@router.post("/messages/{message_id}/react")
async def react_to_message(
    message_id: UUID,
    data: ReactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add or remove emoji reaction on a message. Toggle: add if not exists, remove if exists."""
    result = await db.execute(
        select(DMMessage).where(DMMessage.id == message_id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan")
    
    # Initialize reactions if None
    if message.reactions is None:
        message.reactions = {}
    
    user_id_str = str(current_user.id)
    reactions = dict(message.reactions)
    
    # Toggle: if same user already reacted with same emoji, remove it
    if user_id_str in reactions and reactions[user_id_str] == data.emoji:
        del reactions[user_id_str]
    else:
        reactions[user_id_str] = data.emoji
    
    message.reactions = reactions
    await db.commit()
    
    # Broadcast reaction update
    await dm_ws_manager.broadcast(str(message.dm_channel_id), {
        "type": "dm_reacted",
        "channel_id": str(message.dm_channel_id),
        "message_id": str(message.id),
        "reactions": reactions,
        "user_id": user_id_str,
        "emoji": data.emoji
    })
    
    return {"message_id": str(message.id), "reactions": reactions}


# ─── Read receipts ────────────────────────────────────────────────────────────

@router.post("/channels/{channel_id}/read")
async def mark_channel_read(
    channel_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all unread messages in a channel as read (by the other user)."""
    now = datetime.now(timezone.utc)
    
    # Update all messages from other user that are not read
    result = await db.execute(
        select(DMMessage).where(
            and_(
                DMMessage.dm_channel_id == channel_id,
                DMMessage.user_id != current_user.id,
                DMMessage.is_read == False
            )
        )
    )
    unread_messages = result.scalars().all()
    
    updated_ids = []
    for msg in unread_messages:
        msg.is_read = True
        msg.read_at = now
        msg.is_delivered = True
        msg.delivered_at = msg.delivered_at or now
        updated_ids.append(str(msg.id))
    
    await db.commit()
    
    if updated_ids:
        # Broadcast read receipts
        await dm_ws_manager.broadcast(str(channel_id), {
            "type": "dm_read",
            "channel_id": str(channel_id),
            "message_ids": updated_ids,
            "read_by": str(current_user.id),
            "read_at": now.isoformat()
        })
    
    return {"updated": len(updated_ids), "message_ids": updated_ids}


# ─── Native WebSocket Endpoint ────────────────────────────────────────────────

@router.websocket("/ws/{channel_id}")
async def dm_websocket(
    websocket: WebSocket,
    channel_id: str,
    token: str = Query(..., description="JWT access token"),
):
    """
    Native WebSocket endpoint for real-time DM.
    Client connects with: wss://<host>/api/dm/ws/<channel_id>?token=<jwt>
    """
    from app.core.security import verify_token

    await websocket.accept()
    
    # Authenticate via token query param
    user_id = verify_token(token)
    if not user_id:
        await websocket.send_json({"type": "error", "message": "Invalid token"})
        await websocket.close(code=4001)
        return

    await dm_ws_manager.connect(websocket, channel_id)
    
    # Send initial connection ack
    await websocket.send_json({
        "type": "connected",
        "user_id": user_id,
        "channel_id": channel_id
    })
    
    try:
        while True:
            # Keep connection alive — client sends ping, we echo pong
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0
                )
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                logger.warning(f"[DM-WS] Client timeout (no ping for 60s), closing {channel_id}")
                break
    except Exception as e:
        logger.warning(f"[DM-WS] Connection error or disconnect: {e}")
    finally:
        dm_ws_manager.disconnect(websocket, channel_id)