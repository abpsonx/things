"""Direct Messaging endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from typing import List
import os, uuid, shutil
from app.core.database import get_db
from app.models.user import User
from app.models.dm import DMChannel, DMMessage
from app.dependencies import get_current_user
from app.sockets.dm_ws import dm_ws_manager
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

router = APIRouter(prefix="/dm", tags=["Direct Messages"])

class DMChannelCreate(BaseModel):
    org_id: UUID
    other_user_id: UUID

class DMMessageCreate(BaseModel):
    content: str


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
    message = DMMessage(
        dm_channel_id=channel_id,
        user_id=current_user.id,
        content=data.content
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
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "avatar_url": current_user.avatar_url
            }
        }
    }
    await dm_ws_manager.broadcast(channel_id, payload)
    
    return message

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file in a DM channel."""
    os.makedirs("uploads", exist_ok=True)
    
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join("uploads", unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    message = DMMessage(
        dm_channel_id=channel_id,
        user_id=current_user.id,
        content=f"Sent a file: {file.filename}",
        attachment_url=f"/api/uploads/{unique_filename}",
        attachment_name=file.filename
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    
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
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "avatar_url": current_user.avatar_url
            }
        }
    })
    
    return message


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

    # Authenticate via token query param (WS can't send Authorization headers easily)
    user_id = verify_token(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    await dm_ws_manager.connect(websocket, channel_id)
    try:
        while True:
            # Keep connection alive — client sends ping, we echo pong
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        dm_ws_manager.disconnect(websocket, channel_id)
