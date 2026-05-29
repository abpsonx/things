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
    parent_id: Optional[UUID] = None
    # Optional remote attachment (e.g. Giphy sticker URL) — when set, the
    # message renders as an image without uploading anything to our server.
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    is_sticker: Optional[bool] = False

class ReactionCreate(BaseModel):
    emoji: str


# ─── REST Endpoints ──────────────────────────────────────────────────────────

@router.get("/channels")
async def list_dm_channels(
    org_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all DM channels for the current user in an organization.

    Returns each channel + lightweight `last_message` preview (content +
    created_at + sender_id) so the sidebar can show "Sampai mana terakhir
    obrolan" tanpa fetch terpisah. Juga `unread_count` per channel."""
    from sqlalchemy import func as safunc
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
    channels = result.scalars().all()
    if not channels:
        return []

    ch_ids = [c.id for c in channels]

    # Bulk-fetch latest message id per channel via window function.
    last_msgs_q = await db.execute(
        select(DMMessage)
        .where(DMMessage.dm_channel_id.in_(ch_ids))
        .order_by(DMMessage.dm_channel_id, DMMessage.created_at.desc())
    )
    last_per_channel: dict = {}
    for m in last_msgs_q.scalars().all():
        cid = str(m.dm_channel_id)
        if cid not in last_per_channel:  # first row per channel = latest
            last_per_channel[cid] = m

    # Unread count per channel (messages from the OTHER user that aren't read).
    unread_q = await db.execute(
        select(DMMessage.dm_channel_id, safunc.count(DMMessage.id))
        .where(
            DMMessage.dm_channel_id.in_(ch_ids),
            DMMessage.user_id != current_user.id,
            DMMessage.is_read == False,
        )
        .group_by(DMMessage.dm_channel_id)
    )
    unread_per_channel = {str(cid): int(n) for cid, n in unread_q.all()}

    out = []
    for ch in channels:
        last = last_per_channel.get(str(ch.id))
        last_preview = None
        if last:
            snippet = (last.content or "").strip()
            if last.attachment_url and not snippet:
                snippet = "📎 Lampiran"
            if len(snippet) > 80:
                snippet = snippet[:77] + "..."
            last_preview = {
                "content": snippet,
                "user_id": str(last.user_id),
                "created_at": last.created_at.isoformat(),
                "is_attachment": bool(last.attachment_url),
            }
        out.append({
            "id": str(ch.id),
            "org_id": str(ch.org_id),
            "user1_id": str(ch.user1_id),
            "user2_id": str(ch.user2_id),
            "user1": {
                "id": str(ch.user1.id),
                "name": ch.user1.name,
                "avatar_url": ch.user1.avatar_url,
            } if ch.user1 else None,
            "user2": {
                "id": str(ch.user2.id),
                "name": ch.user2.name,
                "avatar_url": ch.user2.avatar_url,
            } if ch.user2 else None,
            "last_message": last_preview,
            "unread_count": unread_per_channel.get(str(ch.id), 0),
        })
    return out

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
    """Get message history for a DM channel. Each row carries a small
    `parent` preview when it's a reply, so the UI can render the quote
    block without resolving parent_ids itself."""
    result = await db.execute(
        select(DMMessage)
        .options(selectinload(DMMessage.user))
        .where(DMMessage.dm_channel_id == channel_id)
        .order_by(DMMessage.created_at.asc())
    )
    rows = result.scalars().all()

    # Collect parents in one shot to avoid an N+1 query.
    parent_ids = {m.parent_id for m in rows if m.parent_id}
    parents_map: dict = {}
    if parent_ids:
        pr_res = await db.execute(
            select(DMMessage)
            .options(selectinload(DMMessage.user))
            .where(DMMessage.id.in_(parent_ids))
        )
        for pr in pr_res.scalars().all():
            snippet = (pr.content or "").strip()
            if len(snippet) > 120:
                snippet = snippet[:117] + "..."
            parents_map[str(pr.id)] = {
                "id": str(pr.id),
                "content": snippet,
                "user": {"id": str(pr.user.id), "name": pr.user.name} if pr.user else None,
            }

    out = []
    for m in rows:
        row = {
            "id": str(m.id),
            "dm_channel_id": str(m.dm_channel_id),
            "user_id": str(m.user_id),
            "content": m.content,
            "is_read": m.is_read,
            "is_delivered": m.is_delivered,
            "read_at": m.read_at.isoformat() if m.read_at else None,
            "delivered_at": m.delivered_at.isoformat() if m.delivered_at else None,
            "reactions": m.reactions or {},
            "attachment_url": m.attachment_url,
            "attachment_name": m.attachment_name,
            "is_sticker": m.is_sticker,
            "edited_at": m.edited_at.isoformat() if m.edited_at else None,
            "edit_history": m.edit_history or [],
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "parent_id": str(m.parent_id) if m.parent_id else None,
            "parent": parents_map.get(str(m.parent_id)) if m.parent_id else None,
            "user": {
                "id": str(m.user.id),
                "name": m.user.name,
                "avatar_url": m.user.avatar_url,
            } if m.user else None,
        }
        out.append(row)
    return out

@router.post("/channels/{channel_id}/messages")
async def send_dm_message(
    channel_id: str,
    data: DMMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message in a DM channel."""
    from app.sockets.manager import online_user_ids
    now = datetime.now(timezone.utc)

    # Optimisme delivery: kalau recipient sedang online (punya socket aktif),
    # tandai is_delivered=True langsung — bukan menunggu mereka buka chat.
    # Ini bikin UI sender bisa show ✓✓ abu-abu (delivered) sebelum lawan
    # membaca, mirror behaviour WhatsApp / Telegram.
    channel_res = await db.execute(select(DMChannel).where(DMChannel.id == channel_id))
    channel = channel_res.scalar_one_or_none()
    recipient_id = None
    delivered_now = False
    if channel:
        recipient_id = channel.user2_id if channel.user1_id == current_user.id else channel.user1_id
        delivered_now = str(recipient_id) in online_user_ids()

    message = DMMessage(
        dm_channel_id=channel_id,
        user_id=current_user.id,
        content=data.content,
        attachment_url=data.attachment_url,
        attachment_name=data.attachment_name,
        is_sticker=bool(data.is_sticker),
        is_delivered=delivered_now,
        is_read=False,
        delivered_at=now if delivered_now else None,
        read_at=None,
        parent_id=data.parent_id,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Build a tiny parent preview so the frontend can render the
    # "replying to" header without an extra round trip.
    parent_preview = None
    if message.parent_id:
        pr_res = await db.execute(
            select(DMMessage).options(selectinload(DMMessage.user)).where(DMMessage.id == message.parent_id)
        )
        pr = pr_res.scalar_one_or_none()
        if pr:
            snippet = (pr.content or "").strip()
            if len(snippet) > 120:
                snippet = snippet[:117] + "..."
            parent_preview = {
                "id": str(pr.id),
                "content": snippet,
                "user": {"id": str(pr.user.id), "name": pr.user.name} if pr.user else None,
            }

    # Notify the OTHER party (web push + socket.io toast) — channel +
    # recipient_id sudah di-resolve di awal handler.
    if channel and recipient_id:
        from app.services.notification import notify_user
        snippet = (data.content or "").strip()
        if len(snippet) > 80:
            snippet = snippet[:77] + "..."
        await notify_user(
            db,
            user_id=str(recipient_id),
            type="dm",
            title=f"{current_user.name}",
            content=snippet or "Mengirim pesan",
            ref_id=str(channel.id),
            org_id=str(channel.org_id),
            url=f"/org/{channel.org_id}/dm/{current_user.id}",
        )

    # Broadcast via native WebSocket to other clients (not sender)
    payload = {
        "type": "dm_received",
        "sender_id": str(current_user.id),
        "channel_id": str(channel_id),
        "message": {
            "id": str(message.id),
            "content": message.content,
            "user_id": str(current_user.id),
            "dm_channel_id": str(channel_id),
            "created_at": message.created_at.isoformat(),
            "attachment_url": message.attachment_url,
            "attachment_name": message.attachment_name,
            "is_sticker": message.is_sticker,
            "is_image": bool(
                message.attachment_url and (
                    message.attachment_url.lower().endswith((".gif", ".png", ".jpg", ".jpeg", ".webp"))
                    or "giphy" in (message.attachment_url or "").lower()
                )
            ),
            "is_read": False,
            "is_delivered": message.is_delivered,
            "read_at": None,
            "delivered_at": message.delivered_at.isoformat() if message.delivered_at else None,
            "reactions": {},
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "avatar_url": current_user.avatar_url
            },
            "parent_id": str(message.parent_id) if message.parent_id else None,
            "parent": parent_preview,
            "temp_id": data.temp_id,
        }
    }
    await dm_ws_manager.broadcast(channel_id, payload)

    # Beritahu SENDER (tab/window lain milik sender, plus ack delivered)
    # bahwa pesan ini sudah delivered — penting agar UI mereka langsung
    # update single ✓ → double ✓ tanpa menunggu refresh atau bukan-read.
    if message.is_delivered:
        await dm_ws_manager.broadcast(channel_id, {
            "type": "dm_delivered",
            "channel_id": str(channel_id),
            "message_ids": [str(message.id)],
            "delivered_at": message.delivered_at.isoformat() if message.delivered_at else None,
        })

    return {
        "id": str(message.id),
        "content": message.content,
        "user_id": str(current_user.id),
        "dm_channel_id": str(channel_id),
        "created_at": message.created_at.isoformat(),
        "attachment_url": message.attachment_url,
        "attachment_name": message.attachment_name,
        "is_sticker": message.is_sticker,
        "is_image": bool(
            message.attachment_url and (
                message.attachment_url.lower().endswith((".gif", ".png", ".jpg", ".jpeg", ".webp"))
                or "giphy" in (message.attachment_url or "").lower()
            )
        ),
        "is_read": False,
        "is_delivered": message.is_delivered,
        "read_at": None,
        "delivered_at": message.delivered_at.isoformat() if message.delivered_at else None,
        "reactions": {},
        "user": {"id": str(current_user.id), "name": current_user.name, "avatar_url": current_user.avatar_url},
        "parent_id": str(message.parent_id) if message.parent_id else None,
        "parent": parent_preview,
        "temp_id": data.temp_id,
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
    
    history = list(message.edit_history or [])
    history.append({
        "content": message.content,
        "edited_at": (message.edited_at or message.created_at).isoformat() if (message.edited_at or message.created_at) else None,
    })
    message.edit_history = history
    message.content = data.content
    message.edited_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(message)

    # Broadcast edit event
    await dm_ws_manager.broadcast(str(message.dm_channel_id), {
        "type": "dm_edited",
        "channel_id": str(message.dm_channel_id),
        "message": {
            "id": str(message.id),
            "content": message.content,
            "edited_at": message.edited_at.isoformat() if message.edited_at else None,
            "edit_history": message.edit_history,
        },
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
    is_sticker: bool = Query(False),
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

    from app.sockets.manager import online_user_ids
    now = datetime.now(timezone.utc)
    channel_res = await db.execute(select(DMChannel).where(DMChannel.id == channel_id))
    channel = channel_res.scalar_one_or_none()
    recipient_id = None
    delivered_now = False
    if channel:
        recipient_id = channel.user2_id if channel.user1_id == current_user.id else channel.user1_id
        delivered_now = str(recipient_id) in online_user_ids()

    message = DMMessage(
        dm_channel_id=channel_id,
        user_id=current_user.id,
        content=file.filename or "Sent a file",
        attachment_url=f"/api/uploads/{unique_filename}",
        attachment_name=file.filename or "file",
        is_sticker=bool(is_sticker),
        is_delivered=delivered_now,
        is_read=False,
        delivered_at=now if delivered_now else None,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Notify the recipient of the attachment
    if channel and recipient_id:
        from app.services.notification import notify_user
        await notify_user(
            db,
            user_id=str(recipient_id),
            type="dm",
            title=f"{current_user.name}",
            content=f"Mengirim file: {file.filename or 'lampiran'}",
            ref_id=str(channel.id),
            org_id=str(channel.org_id),
            url=f"/org/{channel.org_id}/dm/{current_user.id}",
        )
    
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
            "is_sticker": message.is_sticker,
            "file_size": file_size,
            "is_image": is_image,
            "is_video": is_video,
            "is_audio": is_audio,
            "is_pdf": is_pdf,
            "is_read": False,
            "is_delivered": message.is_delivered,
            "read_at": None,
            "delivered_at": message.delivered_at.isoformat() if message.delivered_at else None,
            "reactions": {},
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "avatar_url": current_user.avatar_url
            },
            "temp_id": temp_id
        }
    })

    # Beritahu sender (tab lain) bahwa pesan ini sudah delivered.
    if message.is_delivered:
        await dm_ws_manager.broadcast(str(channel_id), {
            "type": "dm_delivered",
            "channel_id": str(channel_id),
            "message_ids": [str(message.id)],
            "delivered_at": message.delivered_at.isoformat() if message.delivered_at else None,
        })

    return {
        "id": str(message.id),
        "content": message.content,
        "user_id": str(current_user.id),
        "dm_channel_id": str(channel_id),
        "created_at": message.created_at.isoformat(),
        "attachment_url": message.attachment_url,
        "attachment_name": message.attachment_name,
        "is_sticker": message.is_sticker,
        "file_size": file_size,
        "is_image": is_image,
        "is_video": is_video,
        "is_audio": is_audio,
        "is_pdf": is_pdf,
        "is_read": False,
        "is_delivered": message.is_delivered,
        "read_at": None,
        "delivered_at": message.delivered_at.isoformat() if message.delivered_at else None,
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

    await dm_ws_manager.connect(websocket, channel_id, user_id)
    
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
                    continue
                # Relay typing indicator to the other participant(s)
                try:
                    parsed = json.loads(data)
                except (ValueError, TypeError):
                    parsed = None
                if isinstance(parsed, dict) and parsed.get("type") == "typing":
                    await dm_ws_manager.broadcast(channel_id, {
                        "type": "dm_typing",
                        "sender_id": user_id,
                        "user_id": user_id,
                        "name": parsed.get("name"),
                        "typing": bool(parsed.get("typing")),
                    })
            except asyncio.TimeoutError:
                logger.warning(f"[DM-WS] Client timeout (no ping for 60s), closing {channel_id}")
                break
    except Exception as e:
        logger.warning(f"[DM-WS] Connection error or disconnect: {e}")
    finally:
        dm_ws_manager.disconnect(websocket, channel_id)