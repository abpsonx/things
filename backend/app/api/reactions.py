"""Emoji reactions on comments + chat messages.

Endpoints expect a body like:
    { "target_type": "comment" | "message" | "team_message",
      "target_id": "<uuid>",
      "emoji": "👍" }

POST toggles ON (idempotent — if already exists, returns the same row).
DELETE toggles OFF (idempotent — no-op if not present).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.reaction import Reaction
from app.dependencies import get_current_user

router = APIRouter(prefix="/reactions", tags=["Reactions"])

ALLOWED_TARGETS = {"comment", "message", "team_message"}
EMOJI_MAX_LEN = 20


def _serialize(reactions: list[Reaction], current_user_id) -> list[dict]:
    """Group reactions by emoji + return tally + user list per emoji."""
    by_emoji: dict[str, dict] = {}
    for r in reactions:
        bucket = by_emoji.setdefault(r.emoji, {"emoji": r.emoji, "count": 0, "users": [], "me": False})
        bucket["count"] += 1
        if r.user:
            bucket["users"].append({"id": str(r.user.id), "name": r.user.name})
        if str(r.user_id) == str(current_user_id):
            bucket["me"] = True
    # Sort by count desc, then emoji
    return sorted(by_emoji.values(), key=lambda b: (-b["count"], b["emoji"]))


async def _target_room(db: AsyncSession, target_type: str, target_id: str) -> str | None:
    """Compute the socket room a reaction event should broadcast to."""
    if target_type == "message":
        from app.models.channel import Message
        res = await db.execute(select(Message.channel_id).where(Message.id == target_id))
        ch = res.scalar_one_or_none()
        return f"channel_{ch}" if ch else None
    if target_type == "team_message":
        from app.models.team import TeamMessage
        res = await db.execute(select(TeamMessage.team_id).where(TeamMessage.id == target_id))
        t = res.scalar_one_or_none()
        return f"team_{t}" if t else None
    if target_type == "comment":
        from app.models.comment import Comment
        res = await db.execute(select(Comment.task_id).where(Comment.id == target_id))
        t = res.scalar_one_or_none()
        return f"task_{t}" if t else None
    return None


async def _emit_update(db: AsyncSession, target_type: str, target_id: str, current_user_id):
    """Broadcast the latest tally for a target."""
    res = await db.execute(
        select(Reaction)
        .options(selectinload(Reaction.user))
        .where(Reaction.target_type == target_type, Reaction.target_id == target_id)
    )
    reactions = res.scalars().all()
    payload = {
        "target_type": target_type,
        "target_id": str(target_id),
        "reactions": _serialize(reactions, current_user_id),
    }
    room = await _target_room(db, target_type, target_id)
    if room:
        from app.sockets.manager import sio
        await sio.emit("reaction_updated", payload, room=room)
    return payload


async def _lookup_target_author_and_url(db: AsyncSession, target_type: str, target_id: str) -> tuple[str | None, str | None, str | None, str | None]:
    """Return (author_user_id, snippet, url, org_id) for the reaction target."""
    if target_type == "message":
        from app.models.channel import Message, Channel
        from app.models.project import Project
        res = await db.execute(
            select(Message, Channel, Project)
            .join(Channel, Channel.id == Message.channel_id)
            .join(Project, Project.id == Channel.project_id)
            .where(Message.id == target_id)
        )
        row = res.first()
        if not row:
            return None, None, None, None
        msg, _ch, proj = row
        snippet = (msg.content or "").strip()
        if len(snippet) > 60:
            snippet = snippet[:57] + "..."
        url = f"/org/{proj.org_id}/project/{proj.id}/chat"
        return str(msg.user_id), snippet, url, str(proj.org_id)
    if target_type == "team_message":
        from app.models.team import TeamMessage, Team
        res = await db.execute(
            select(TeamMessage, Team)
            .join(Team, Team.id == TeamMessage.team_id)
            .where(TeamMessage.id == target_id)
        )
        row = res.first()
        if not row:
            return None, None, None, None
        msg, team = row
        snippet = (msg.content or "").strip()
        if len(snippet) > 60:
            snippet = snippet[:57] + "..."
        url = f"/org/{team.org_id}/team/{team.id}/chat"
        return str(msg.user_id), snippet, url, str(team.org_id)
    if target_type == "comment":
        from app.models.comment import Comment
        from app.models.task import Task
        from app.models.project import Project
        res = await db.execute(
            select(Comment, Task, Project)
            .join(Task, Task.id == Comment.task_id)
            .outerjoin(Project, Project.id == Task.project_id)
            .where(Comment.id == target_id)
        )
        row = res.first()
        if not row:
            return None, None, None, None
        comment, task, proj = row
        snippet = (comment.content or "").strip()
        if len(snippet) > 60:
            snippet = snippet[:57] + "..."
        if proj:
            url = f"/org/{proj.org_id}/project/{proj.id}/board?task={task.id}"
            return str(comment.user_id), snippet, url, str(proj.org_id)
        return str(comment.user_id), snippet, None, None
    return None, None, None, None


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_reaction(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_type = data.get("target_type")
    target_id = data.get("target_id")
    emoji = (data.get("emoji") or "").strip()
    if target_type not in ALLOWED_TARGETS:
        raise HTTPException(status_code=400, detail="target_type tidak valid")
    if not target_id:
        raise HTTPException(status_code=400, detail="target_id wajib")
    if not emoji or len(emoji) > EMOJI_MAX_LEN:
        raise HTTPException(status_code=400, detail="emoji wajib (max 20 char)")

    # Idempotent: skip if already exists
    existing = await db.execute(
        select(Reaction).where(
            Reaction.target_type == target_type,
            Reaction.target_id == target_id,
            Reaction.user_id == current_user.id,
            Reaction.emoji == emoji,
        )
    )
    was_new = False
    if not existing.scalar_one_or_none():
        db.add(Reaction(
            target_type=target_type,
            target_id=target_id,
            user_id=current_user.id,
            emoji=emoji,
        ))
        await db.commit()
        was_new = True

    payload = await _emit_update(db, target_type, target_id, current_user.id)

    # Notify the original author — only on a fresh reaction and not when
    # reacting to your own message.
    if was_new:
        try:
            author_id, snippet, url, org_id = await _lookup_target_author_and_url(db, target_type, target_id)
            if author_id and author_id != str(current_user.id):
                from app.services.notification import notify_user
                label = "komentar" if target_type == "comment" else "pesan"
                await notify_user(
                    db,
                    user_id=author_id,
                    type="reaction",
                    title="Reaksi baru",
                    content=f"{current_user.name} bereaksi {emoji} ke {label}mu: {snippet}",
                    ref_id=str(target_id),
                    org_id=org_id,
                    url=url or "/dashboard",
                )
        except Exception as e:
            print(f"[reactions] notify failed: {e}")

    return payload


@router.delete("", status_code=status.HTTP_200_OK)
async def remove_reaction(
    target_type: str,
    target_id: str,
    emoji: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if target_type not in ALLOWED_TARGETS:
        raise HTTPException(status_code=400, detail="target_type tidak valid")

    res = await db.execute(
        select(Reaction).where(
            Reaction.target_type == target_type,
            Reaction.target_id == target_id,
            Reaction.user_id == current_user.id,
            Reaction.emoji == emoji,
        )
    )
    r = res.scalar_one_or_none()
    if r:
        await db.delete(r)
        await db.commit()

    return await _emit_update(db, target_type, target_id, current_user.id)


async def fetch_reactions_for(db: AsyncSession, target_type: str, target_ids: list, current_user_id) -> dict:
    """Bulk fetch reactions for many target_ids of the same type.

    Returns a map { str(target_id): [serialized buckets] } so callers can
    attach reactions to each row in their response payload.
    """
    if not target_ids:
        return {}
    res = await db.execute(
        select(Reaction)
        .options(selectinload(Reaction.user))
        .where(Reaction.target_type == target_type, Reaction.target_id.in_(target_ids))
    )
    rows = res.scalars().all()
    grouped: dict[str, list] = {}
    for r in rows:
        grouped.setdefault(str(r.target_id), []).append(r)
    return {tid: _serialize(rs, current_user_id) for tid, rs in grouped.items()}
