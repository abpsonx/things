"""Workspace (organization-level) chat — one shared #general room per org.

Reuses the Channel/Message models and the same Socket.IO room naming
(`channel_{id}`) as project chat, so the realtime layer is identical.
"""
import logging
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.channel import Channel, Message
from app.models.notification import PushSubscription
from app.models.organization import OrgMember
from app.models.user import User
from app.schemas import MessageCreate, MessageResponse
from app.services.notification import notify_user
from app.services.push import send_push_notification
from app.sockets.manager import online_user_ids, sio

router = APIRouter(prefix="/organizations/{org_id}/chat", tags=["Workspace Chat"])
logger = logging.getLogger(__name__)

WORKSPACE_CHANNEL_NAME = "general"
_MENTION_RE = re.compile(r"@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)")


class ReadWorkspaceRequest(BaseModel):
    message_ids: Optional[List[str]] = None


async def _require_member(db: AsyncSession, org_id: str, user_id) -> None:
    res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")


async def _get_or_create_channel(db: AsyncSession, org_id: str) -> Channel:
    res = await db.execute(
        select(Channel).where(Channel.org_id == uuid.UUID(org_id)).limit(1)
    )
    ch = res.scalar_one_or_none()
    if not ch:
        ch = Channel(org_id=uuid.UUID(org_id), project_id=None, name=WORKSPACE_CHANNEL_NAME)
        db.add(ch)
        await db.commit()
        await db.refresh(ch)
    return ch


@router.get("")
async def get_workspace_chat(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve (creating if needed) the workspace channel for this org."""
    await _require_member(db, org_id, current_user.id)
    ch = await _get_or_create_channel(db, org_id)
    return {"id": str(ch.id), "name": ch.name, "org_id": org_id}


@router.get("/messages", response_model=List[MessageResponse])
async def get_workspace_messages(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    ch = await _get_or_create_channel(db, org_id)
    from app.api.reactions import fetch_reactions_for
    from app.api.polls import _serialize as _serialize_poll
    from app.models.poll import Poll

    result = await db.execute(
        select(Message)
        .options(
            selectinload(Message.user),
            selectinload(Message.poll).selectinload(Poll.votes),
        )
        .where(Message.channel_id == ch.id)
        .order_by(Message.created_at.asc())
    )
    msgs = result.scalars().all()
    reactions_map = await fetch_reactions_for(db, "message", [m.id for m in msgs], current_user.id)
    out: list = []
    for m in msgs:
        resp = MessageResponse.model_validate(m)
        if m.poll:
            resp.poll = _serialize_poll(m.poll, current_user.id)
        resp.reactions = reactions_map.get(str(m.id), [])
        out.append(resp)
    return out


@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace_message(
    org_id: str,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    ch = await _get_or_create_channel(db, org_id)

    message = Message(
        channel_id=ch.id,
        user_id=current_user.id,
        content=data.content,
        parent_id=data.parent_id,
        attachment_url=data.attachment_url,
        attachment_name=data.attachment_name,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    result = await db.execute(
        select(Message).options(selectinload(Message.user)).where(Message.id == message.id)
    )
    full_message = result.scalar_one()

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
        "created_at": full_message.created_at.isoformat(),
        "user": {
            "id": str(current_user.id),
            "name": current_user.name,
            "avatar_url": current_user.avatar_url,
            "tagline": current_user.tagline,
        },
    }, room=f"channel_{ch.id}")

    # Notify the other members: a live sidebar badge for those online, and a
    # web-push banner for those offline (so they see it with the app closed).
    mem = await db.execute(select(OrgMember.user_id).where(OrgMember.org_id == uuid.UUID(org_id)))
    member_ids = [m for (m,) in mem.all() if str(m) != str(current_user.id)]
    online = online_user_ids()
    for member_id in member_ids:
        await sio.emit("workspace_chat_unread", {"org_id": org_id}, room=f"user_{member_id}")

    offline_ids = [m for m in member_ids if str(m) not in online]
    if offline_ids:
        snippet = (data.content or "").strip()
        if full_message.attachment_url and not snippet:
            snippet = "mengirim lampiran"
        if len(snippet) > 120:
            snippet = snippet[:117] + "..."
        push_data = {
            "title": f"{current_user.name} · Chat Workspace",
            "body": snippet or "pesan baru",
            "url": f"/org/{org_id}/chat",
            "icon": "/assets/logo.png",
            "tag": f"wschat-{org_id}",
        }
        subs = await db.execute(select(PushSubscription).where(PushSubscription.user_id.in_(offline_ids)))
        for sub in subs.scalars().all():
            try:
                send_push_notification(
                    {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    push_data,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("workspace push failed: %s", exc)

    # Notify @mentioned members.
    if data.content:
        mentioned_ids = {m for m in _MENTION_RE.findall(data.content) if m != str(current_user.id)}
        if mentioned_ids:
            snippet = _MENTION_RE.sub(lambda m: "@" + m.group(0).split("[")[1].split("]")[0], data.content).strip()
            if len(snippet) > 80:
                snippet = snippet[:77] + "..."
            for uid in mentioned_ids:
                await notify_user(
                    db, user_id=uid, type="mention",
                    title=f"{current_user.name} menyebut kamu di Chat Workspace",
                    content=snippet or "Kamu di-tag dalam pesan",
                    ref_id=str(full_message.id), org_id=org_id,
                    url=f"/org/{org_id}/chat",
                )

    return full_message


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def update_workspace_message(
    org_id: str, message_id: str,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    ch = await _get_or_create_channel(db, org_id)
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message or str(message.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Tidak boleh mengedit pesan ini")

    message.content = data.content
    message.is_edited = True
    message.edited_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(message)

    await sio.emit("message_updated", {
        "id": str(message.id),
        "channel_id": str(message.channel_id),
        "content": message.content,
        "is_edited": True,
        "edited_at": message.edited_at.isoformat() if message.edited_at else None,
    }, room=f"channel_{ch.id}")
    return message


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace_message(
    org_id: str, message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    ch = await _get_or_create_channel(db, org_id)
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message or str(message.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Tidak boleh menghapus pesan ini")
    await db.delete(message)
    await db.commit()
    await sio.emit("message_deleted", {"id": message_id, "channel_id": str(ch.id)}, room=f"channel_{ch.id}")
    return None


@router.post("/messages/{message_id}/pin", response_model=MessageResponse)
async def toggle_pin_workspace_message(
    org_id: str, message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    ch = await _get_or_create_channel(db, org_id)
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan")
    message.is_pinned = not message.is_pinned
    await db.commit()
    await db.refresh(message)
    await sio.emit("message_pinned", {
        "id": str(message.id), "channel_id": str(ch.id), "is_pinned": message.is_pinned,
    }, room=f"channel_{ch.id}")
    return message


@router.post("/messages/{message_id}/star", response_model=MessageResponse)
async def toggle_star_workspace_message(
    org_id: str, message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    ch = await _get_or_create_channel(db, org_id)
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan")
    message.is_starred = not message.is_starred
    await db.commit()
    await db.refresh(message)
    await sio.emit("message_starred", {
        "id": str(message.id), "channel_id": str(ch.id), "is_starred": message.is_starred,
    }, room=f"channel_{ch.id}")
    return message


@router.delete("/clear", status_code=status.HTTP_204_NO_CONTENT)
async def clear_workspace_messages(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.permissions import can_manage_org
    from sqlalchemy import delete
    await _require_member(db, org_id, current_user.id)
    if not await can_manage_org(db, uuid.UUID(org_id), current_user):
        raise HTTPException(status_code=403, detail="Hanya Manager ke atas yang bisa mengosongkan chat")
    ch = await _get_or_create_channel(db, org_id)
    await db.execute(delete(Message).where(Message.channel_id == ch.id))
    await db.commit()
    await sio.emit("channel_cleared", {"channel_id": str(ch.id)}, room=f"channel_{ch.id}")
    return None


@router.post("/read")
async def mark_workspace_read(
    org_id: str,
    data: Optional[ReadWorkspaceRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark messages in the workspace channel as read by the current user.

    Accepts an optional list of message_ids (parity with project chat); when
    omitted, marks every message in the channel as read.
    """
    await _require_member(db, org_id, current_user.id)
    ch = await _get_or_create_channel(db, org_id)
    q = select(Message).where(Message.channel_id == ch.id)
    if data and data.message_ids:
        q = q.where(Message.id.in_(data.message_ids))
    result = await db.execute(q)
    now = datetime.now(timezone.utc).isoformat()
    reader = {"id": str(current_user.id), "name": current_user.name, "read_at": now}
    updates = []
    for msg in result.scalars().all():
        if str(msg.user_id) == str(current_user.id):
            continue
        read_by = msg.read_by or []
        if not any(r.get("id") == str(current_user.id) for r in read_by):
            new_read_by = [*read_by, reader]
            msg.read_by = new_read_by
            msg.is_read = True
            updates.append({"message_id": str(msg.id), "read_by": new_read_by})
    if updates:
        await db.commit()
        await sio.emit("messages_read", {"channel_id": str(ch.id), "updates": updates}, room=f"channel_{ch.id}")
    return {"status": "success", "updated_count": len(updates)}


@router.post("/messages/upload")
async def upload_workspace_attachment(
    org_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(db, org_id, current_user.id)
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    with open(os.path.join(upload_dir, unique_filename), "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"url": f"/api/uploads/{unique_filename}", "filename": file.filename}
