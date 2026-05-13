"""Direct Messaging endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from typing import List
import os, uuid, shutil
from app.core.database import get_db
from app.models.user import User
from app.models.dm import DMChannel, DMMessage
from app.dependencies import get_current_user
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

router = APIRouter(prefix="/dm", tags=["Direct Messages"])

class DMChannelCreate(BaseModel):
    org_id: UUID
    other_user_id: UUID

class DMMessageCreate(BaseModel):
    content: str

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
    # Check if channel exists
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
    
    # Trigger socket broadcast
    from app.sockets.manager import sio
    await sio.emit("dm_received", {
        "channel_id": str(channel_id),
        "message": {
            "id": str(message.id),
            "content": message.content,
            "user_id": str(current_user.id),
            "created_at": str(message.created_at),
            "user": {"id": str(current_user.id), "name": current_user.name, "avatar_url": current_user.avatar_url}
        }
    }, room=f"dm_{channel_id}")
    
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
    
    await db.delete(message)
    await db.commit()
    return {"status": "success"}

@router.post("/channels/{channel_id}/attachments")
async def upload_dm_attachment(
    channel_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file in a DM channel."""
    # Ensure uploads directory exists
    os.makedirs("uploads", exist_ok=True)
    
    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join("uploads", unique_filename)

    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Create message with attachment
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
    
    # Trigger socket broadcast
    from app.sockets.manager import sio
    await sio.emit("dm_received", {
        "channel_id": str(channel_id),
        "message": {
            "id": str(message.id),
            "content": message.content,
            "user_id": str(current_user.id),
            "created_at": str(message.created_at),
            "attachment_url": message.attachment_url,
            "attachment_name": message.attachment_name,
            "user": {"id": str(current_user.id), "name": current_user.name, "avatar_url": current_user.avatar_url}
        }
    }, room=f"dm_{channel_id}")
    
    return message

