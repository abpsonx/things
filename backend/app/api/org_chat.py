"""Workspace (organization-level) chat — one shared #general room per org.

Reuses the Channel/Message models and the same Socket.IO room naming
(`channel_{id}`) as project chat, so the realtime layer is identical.
"""
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.channel import Channel, Message
from app.models.organization import OrgMember
from app.models.user import User
from app.schemas import MessageCreate, MessageResponse
from app.services.notification import notify_user
from app.sockets.manager import sio

router = APIRouter(prefix="/organizations/{org_id}/chat", tags=["Workspace Chat"])

WORKSPACE_CHANNEL_NAME = "general"
_MENTION_RE = re.compile(r"@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)")


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

    result = await db.execute(
        select(Message)
        .options(selectinload(Message.user))
        .where(Message.channel_id == ch.id)
        .order_by(Message.created_at.asc())
    )
    msgs = result.scalars().all()
    reactions_map = await fetch_reactions_for(db, "message", [m.id for m in msgs], current_user.id)
    out: list = []
    for m in msgs:
        resp = MessageResponse.model_validate(m)
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
        },
    }, room=f"channel_{ch.id}")

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
