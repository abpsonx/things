"""Flat file index per project — used by the chat /file slash command.

Returns one combined list of:
- Project documents (Wiki pages)
- Task attachments uploaded in this project

so the picker can show "every file in this project" regardless of
where it lives.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.user import User
from app.models.document import Document
from app.models.attachment import Attachment
from app.models.task import Task
from app.models.project import Project
from app.models.channel import Channel, Message
from app.dependencies import get_current_user

router = APIRouter(prefix="/projects/{project_id}/files-index", tags=["FileIndex"])


@router.get("")
async def list_project_files(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    # 1. Wiki documents
    docs_res = await db.execute(
        select(Document)
        .where(Document.project_id == project_id)
        .order_by(Document.updated_at.desc())
    )
    docs = docs_res.scalars().all()

    # 2. Task attachments (joined with task to confirm project ownership)
    att_res = await db.execute(
        select(Attachment, Task.id.label("task_id"))
        .join(Task, Task.id == Attachment.task_id)
        .where(Task.project_id == project_id)
        .order_by(Attachment.created_at.desc())
    )
    atts = att_res.all()

    # 3. Files shared in this project's chat channels
    chat_res = await db.execute(
        select(Message, Channel.id.label("channel_id"))
        .join(Channel, Channel.id == Message.channel_id)
        .where(Channel.project_id == project_id, Message.attachment_url.isnot(None))
        .order_by(Message.created_at.desc())
    )
    chats = chat_res.all()

    out: list[dict] = []
    for d in docs:
        out.append({
            "id": str(d.id),
            "name": d.title,
            "kind": "doc",
            "url": None,  # frontend builds /docs?doc=<id>
        })
    for row in atts:
        att = row[0]
        task_id = row[1]
        out.append({
            "id": str(att.id),
            "name": att.file_name,
            "kind": "attachment",
            # served from nginx /api/uploads/<path>
            "url": f"/api/uploads/{att.file_path}",
            "task_id": str(task_id),
        })
    for row in chats:
        m = row[0]
        url = m.attachment_url
        if url and not url.startswith("http") and not url.startswith("/"):
            url = f"/api/uploads/{url}"
        out.append({
            "id": str(m.id),
            "name": m.attachment_name or "Lampiran chat",
            "kind": "chat_file",
            "url": url,
        })
    return out
