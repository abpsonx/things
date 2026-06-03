"""API endpoints for chat channels and messages."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from fastapi import UploadFile, File
import os
import uuid
import shutil

from app.core.database import get_db
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.channel import Channel, Message
from app.schemas import ChannelCreate, ChannelResponse, MessageResponse
from app.dependencies import get_current_user
from app.sockets.manager import sio

router = APIRouter(prefix="/projects/{project_id}/channels", tags=["Chat"])


@router.post("", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_channel(
    project_id: str,
    data: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new chat channel in a project."""
    channel = Channel(project_id=project_id, name=data.name)
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return channel


@router.get("", response_model=List[ChannelResponse])
async def get_channels(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all channels for a project."""
    result = await db.execute(
        select(Channel).where(Channel.project_id == project_id)
    )
    return result.scalars().all()


@router.put("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    project_id: str,
    channel_id: str,
    data: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename a chat channel."""
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel tidak ditemukan")
    
    channel.name = data.name
    await db.commit()
    await db.refresh(channel)
    return channel


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    project_id: str,
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat channel."""
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel tidak ditemukan")
    
    await db.delete(channel)
    await db.commit()
    return None



class MessageCreate(BaseModel):
    content: Optional[str] = None
    parent_id: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    is_sticker: Optional[bool] = False


@router.post("/{channel_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    project_id: str,
    channel_id: str,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a new message and broadcast via Socket.IO."""
    message = Message(
        channel_id=channel_id,
        user_id=current_user.id,
        content=data.content,
        parent_id=data.parent_id,
        attachment_url=data.attachment_url,
        attachment_name=data.attachment_name,
        is_sticker=bool(data.is_sticker),
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Reload with user info
    result = await db.execute(
        select(Message)
        .options(selectinload(Message.user))
        .where(Message.id == message.id)
    )
    full_message = result.scalar_one()

    # Broadcast via Socket.IO
    await sio.emit("new_message", {
        "id": str(full_message.id),
        "channel_id": str(full_message.channel_id),
        "user_id": str(full_message.user_id),
        "content": full_message.content,
        "parent_id": str(full_message.parent_id) if full_message.parent_id else None,
        "is_edited": full_message.is_edited,
        "is_read": full_message.is_read,
        "read_by": full_message.read_by or [],
        "attachment_url": full_message.attachment_url,
        "attachment_name": full_message.attachment_name,
        "is_sticker": full_message.is_sticker,
        "created_at": full_message.created_at.isoformat(),
        "user": {
            "id": str(current_user.id),
            "name": current_user.name,
            "avatar_url": current_user.avatar_url,
            "tagline": current_user.tagline
        }
    }, room=f"channel_{channel_id}")

    # Notify any users tagged via @[Name](uuid) in the message content
    if data.content:
        import re
        from app.models.channel import Channel
        from app.models.project import Project
        from app.services.notification import notify_user

        mention_re = re.compile(r"@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)")
        mentioned_ids = {m for m in mention_re.findall(data.content) if m != str(current_user.id)}
        if mentioned_ids:
            # Fetch project/org for deep-link URL
            ch_res = await db.execute(
                select(Channel).options(selectinload(Channel.project)).where(Channel.id == channel_id)
            )
            ch_row = ch_res.scalar_one_or_none()
            org_id = str(ch_row.project.org_id) if ch_row and ch_row.project else None
            proj_id = str(ch_row.project.id) if ch_row and ch_row.project else None
            ch_name = ch_row.name if ch_row else "channel"
            snippet = (data.content or "").strip()
            # strip mention tokens for a cleaner snippet
            snippet = mention_re.sub(lambda m: "@" + (m.group(0).split("[")[1].split("]")[0]), snippet)
            if len(snippet) > 80:
                snippet = snippet[:77] + "..."
            url = f"/org/{org_id}/project/{proj_id}/chat" if org_id and proj_id else "/dashboard"
            for uid in mentioned_ids:
                await notify_user(
                    db,
                    user_id=uid,
                    type="mention",
                    title=f"{current_user.name} menyebut kamu di #{ch_name}",
                    content=snippet or "Kamu di-tag dalam pesan",
                    ref_id=str(full_message.id),
                    org_id=org_id,
                    url=url,
                )

    return full_message


@router.get("/{channel_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    project_id: str,
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get message history for a channel."""
    from app.models.poll import Poll
    from app.api.polls import _serialize as _serialize_poll
    from app.api.reactions import fetch_reactions_for

    result = await db.execute(
        select(Message)
        .options(
            selectinload(Message.user),
            selectinload(Message.poll).selectinload(Poll.votes),
        )
        .where(Message.channel_id == channel_id)
        .order_by(Message.created_at.asc())
    )
    msgs = result.scalars().all()
    reactions_map = await fetch_reactions_for(
        db, "message", [m.id for m in msgs], current_user.id,
    )
    out: list = []
    for m in msgs:
        resp = MessageResponse.model_validate(m)
        if m.poll:
            resp.poll = _serialize_poll(m.poll, current_user.id)
        resp.reactions = reactions_map.get(str(m.id), [])
        out.append(resp)
    return out


@router.patch("/{channel_id}/messages/{message_id}", response_model=MessageResponse)
async def update_message(
    project_id: str,
    channel_id: str,
    message_id: str,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an existing message."""
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    
    if not message or str(message.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to edit this message")
    
    from datetime import datetime, timezone
    history = list(message.edit_history or [])
    history.append({
        "content": message.content,
        "edited_at": (message.edited_at or message.created_at).isoformat() if (message.edited_at or message.created_at) else None,
    })
    message.edit_history = history
    message.content = data.content
    message.is_edited = True
    message.edited_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(message)

    # Broadcast edit
    await sio.emit("message_updated", {
        "id": str(message.id),
        "channel_id": str(message.channel_id),
        "content": message.content,
        "is_edited": True,
        "edited_at": message.edited_at.isoformat() if message.edited_at else None,
        "edit_history": message.edit_history,
    }, room=f"channel_{channel_id}")

    return message


@router.delete("/{channel_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    project_id: str,
    channel_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a message."""
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    
    if not message or str(message.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this message")
    
    await db.delete(message)
    await db.commit()
    
    # Broadcast delete
    await sio.emit("message_deleted", {
        "id": message_id,
        "channel_id": channel_id
    }, room=f"channel_{channel_id}")
    
    return None

@router.post("/{channel_id}/messages/{message_id}/pin", response_model=MessageResponse)
async def toggle_pin_message(
    project_id: str,
    channel_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle pin status of a message."""
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    message.is_pinned = not message.is_pinned
    await db.commit()
    await db.refresh(message)
    
    # Broadcast pin update
    await sio.emit("message_pinned", {
        "id": str(message.id),
        "channel_id": str(message.channel_id),
        "is_pinned": message.is_pinned
    }, room=f"channel_{channel_id}")
    
    return message

@router.post("/{channel_id}/messages/{message_id}/star", response_model=MessageResponse)
async def toggle_star_message(
    project_id: str,
    channel_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle star status of a message."""
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    message.is_starred = not message.is_starred
    await db.commit()
    await db.refresh(message)
    
    # Broadcast star update
    await sio.emit("message_starred", {
        "id": str(message.id),
        "channel_id": str(message.channel_id),
        "is_starred": message.is_starred
    }, room=f"channel_{channel_id}")
    
    return message

class ReadMessagesRequest(BaseModel):
    message_ids: List[str]

@router.post("/{channel_id}/messages/read")
async def mark_messages_read(
    project_id: str,
    channel_id: str,
    data: ReadMessagesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark multiple messages as read and broadcast."""
    from datetime import datetime, timezone
    
    if not data.message_ids:
        return {"status": "success", "updated_count": 0}
        
    result = await db.execute(select(Message).where(Message.id.in_(data.message_ids)))
    messages = result.scalars().all()
    
    read_data = []
    now = datetime.now(timezone.utc).isoformat()
    reader_info = {
        "id": str(current_user.id),
        "name": current_user.name,
        "read_at": now
    }
    
    for msg in messages:
        if str(msg.user_id) == str(current_user.id):
            continue
            
        read_by = msg.read_by or []
        if not any(r.get("id") == str(current_user.id) for r in read_by):
            new_read_by = list(read_by)
            new_read_by.append(reader_info)
            msg.read_by = new_read_by
            msg.is_read = True
            
            read_data.append({
                "message_id": str(msg.id),
                "read_by": new_read_by
            })
            
    if read_data:
        await db.commit()
        await sio.emit("messages_read", {
            "channel_id": channel_id,
            "updates": read_data
        }, room=f"channel_{channel_id}")
        
    return {"status": "success", "updated_count": len(read_data)}

@router.post("/{channel_id}/messages/upload")
async def upload_message_attachment(
    project_id: str,
    channel_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a file attachment for a chat message."""
    UPLOAD_DIR = "uploads"
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
        
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Gunakan path relatif agar lebih stabil di berbagai environment
    url = f"/api/uploads/{unique_filename}"
    return {"url": url, "filename": file.filename}

@router.delete("/{channel_id}/clear", status_code=status.HTTP_204_NO_CONTENT)
async def clear_channel_messages(
    project_id: str,
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all messages in a channel."""
    from sqlalchemy import delete
    await db.execute(delete(Message).where(Message.channel_id == channel_id))
    await db.commit()
    
    # Broadcast clear
    await sio.emit("channel_cleared", {
        "channel_id": channel_id
    }, room=f"channel_{channel_id}")
    
    return None
