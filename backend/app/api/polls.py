"""Polls — chat-room polling for project channels & team chats.

A poll is a separate row in `polls` but is always referenced by a chat
message (`messages.poll_id` for project channels, `team_messages.poll_id`
for team chats) so the poll renders inline with the rest of the
conversation. Voting is one row per (user, option) in `poll_votes`.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.poll import Poll, PollVote
from app.models.channel import Channel, Message
from app.models.team import Team, TeamMessage
from app.dependencies import get_current_user

router = APIRouter(prefix="/polls", tags=["Polls"])


def _tally(poll: Poll, current_user_id) -> dict:
    """Compute per-option vote counts + the current user's choices."""
    options = poll.options or []
    counts = [0] * len(options)
    my_votes: list[int] = []
    voters: set = set()
    for v in poll.votes or []:
        if 0 <= v.option_index < len(counts):
            counts[v.option_index] += 1
            voters.add(str(v.user_id))
            if str(v.user_id) == str(current_user_id):
                my_votes.append(v.option_index)
    total = sum(counts)
    return {
        "options": [{"text": text, "count": c} for text, c in zip(options, counts)],
        "total_votes": total,
        "unique_voters": len(voters),
        "my_votes": my_votes,
    }


def _serialize(poll: Poll, current_user_id) -> dict:
    t = _tally(poll, current_user_id)
    return {
        "id": str(poll.id),
        "question": poll.question,
        "options": t["options"],
        "allow_multi": poll.allow_multi,
        "closed_at": poll.closed_at.isoformat() if poll.closed_at else None,
        "created_by": str(poll.created_by),
        "created_at": poll.created_at.isoformat() if poll.created_at else None,
        "total_votes": t["total_votes"],
        "unique_voters": t["unique_voters"],
        "my_votes": t["my_votes"],
    }


async def _load_poll(db: AsyncSession, poll_id: str) -> Poll:
    res = await db.execute(
        select(Poll)
        .options(selectinload(Poll.votes))
        .where(Poll.id == poll_id)
    )
    poll = res.scalar_one_or_none()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll tidak ditemukan")
    return poll


@router.post("/channel/{channel_id}", response_model=dict)
async def create_channel_poll(
    channel_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a poll inside a project channel. Posts a companion chat message."""
    question = (data.get("question") or "").strip()
    options = [str(o).strip() for o in (data.get("options") or []) if str(o).strip()]
    allow_multi = bool(data.get("allow_multi", False))
    if not question:
        raise HTTPException(status_code=400, detail="Pertanyaan poll wajib")
    if len(options) < 2:
        raise HTTPException(status_code=400, detail="Minimal 2 opsi")
    if len(options) > 10:
        raise HTTPException(status_code=400, detail="Maksimal 10 opsi")

    ch_res = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = ch_res.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel tidak ditemukan")

    poll = Poll(
        channel_id=channel_id,
        created_by=current_user.id,
        question=question,
        options=options,
        allow_multi=allow_multi,
    )
    db.add(poll)
    await db.flush()
    poll_id = poll.id

    # Companion chat message so the poll appears in the channel timeline.
    msg = Message(
        channel_id=channel_id,
        user_id=current_user.id,
        content=f"📊 {question}",
        poll_id=poll_id,
    )
    db.add(msg)
    await db.flush()
    # Capture before commit — session expires attributes after commit and
    # accessing them would trigger lazy IO in an async-incompatible way.
    msg_snapshot = {
        "id": str(msg.id),
        "channel_id": str(msg.channel_id),
        "user_id": str(msg.user_id),
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
    }
    await db.commit()

    # Reload poll with votes eager-loaded so _serialize doesn't trigger
    # lazy IO on the expired session (would raise greenlet_spawn error).
    poll = await _load_poll(db, str(poll_id))
    poll_payload = _serialize(poll, current_user.id)

    # Broadcast as a regular new message via the channel's socket room.
    from app.sockets.manager import sio
    await sio.emit("new_message", {
        **msg_snapshot,
        "poll": poll_payload,
        "user": {"id": str(current_user.id), "name": current_user.name, "avatar_url": current_user.avatar_url},
    }, room=f"channel_{channel_id}")

    return {"message_id": msg_snapshot["id"], "poll": poll_payload}


@router.post("/team/{team_id}", response_model=dict)
async def create_team_poll(
    team_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a poll inside a team chat."""
    question = (data.get("question") or "").strip()
    options = [str(o).strip() for o in (data.get("options") or []) if str(o).strip()]
    allow_multi = bool(data.get("allow_multi", False))
    if not question:
        raise HTTPException(status_code=400, detail="Pertanyaan poll wajib")
    if len(options) < 2:
        raise HTTPException(status_code=400, detail="Minimal 2 opsi")
    if len(options) > 10:
        raise HTTPException(status_code=400, detail="Maksimal 10 opsi")

    team_res = await db.execute(select(Team).where(Team.id == team_id))
    if not team_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team tidak ditemukan")

    poll = Poll(
        team_id=team_id,
        created_by=current_user.id,
        question=question,
        options=options,
        allow_multi=allow_multi,
    )
    db.add(poll)
    await db.flush()
    poll_id = poll.id

    msg = TeamMessage(
        team_id=team_id,
        user_id=current_user.id,
        content=f"📊 {question}",
        poll_id=poll_id,
    )
    db.add(msg)
    await db.flush()
    msg_snapshot = {
        "id": str(msg.id),
        "user_id": str(msg.user_id),
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
    }
    await db.commit()

    # Reload poll with votes eager-loaded to avoid lazy-IO after commit.
    poll = await _load_poll(db, str(poll_id))
    poll_payload = _serialize(poll, current_user.id)

    from app.sockets.manager import sio
    await sio.emit("team_message", {
        **msg_snapshot,
        "poll": poll_payload,
        "user": {"name": current_user.name, "avatar_url": current_user.avatar_url},
    }, room=f"team_{team_id}")

    return {"message_id": msg_snapshot["id"], "poll": poll_payload}


@router.post("/{poll_id}/vote", response_model=dict)
async def vote_poll(
    poll_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cast a vote. Body: { option_index }."""
    poll = await _load_poll(db, poll_id)
    if poll.closed_at:
        raise HTTPException(status_code=400, detail="Poll sudah ditutup")

    try:
        option_index = int(data.get("option_index"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="option_index harus angka")
    if option_index < 0 or option_index >= len(poll.options or []):
        raise HTTPException(status_code=400, detail="option_index di luar batas")

    # Single-choice: clear any prior vote first
    if not poll.allow_multi:
        prior = await db.execute(
            select(PollVote).where(
                PollVote.poll_id == poll.id,
                PollVote.user_id == current_user.id,
            )
        )
        for v in prior.scalars().all():
            await db.delete(v)

    # Skip if user already voted for the same option (multi case)
    exists = await db.execute(
        select(PollVote).where(
            PollVote.poll_id == poll.id,
            PollVote.user_id == current_user.id,
            PollVote.option_index == option_index,
        )
    )
    if not exists.scalar_one_or_none():
        db.add(PollVote(poll_id=poll.id, user_id=current_user.id, option_index=option_index))

    await db.commit()

    # Reload with votes
    poll = await _load_poll(db, poll_id)
    payload = _serialize(poll, current_user.id)

    # Broadcast tally update so other clients update in real time
    from app.sockets.manager import sio
    room = f"channel_{poll.channel_id}" if poll.channel_id else f"team_{poll.team_id}"
    await sio.emit("poll_updated", payload, room=room)

    return payload


@router.delete("/{poll_id}/vote", response_model=dict)
async def unvote_poll(
    poll_id: str,
    option_index: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retract one of your votes (used for multi-choice polls)."""
    poll = await _load_poll(db, poll_id)
    if poll.closed_at:
        raise HTTPException(status_code=400, detail="Poll sudah ditutup")

    res = await db.execute(
        select(PollVote).where(
            PollVote.poll_id == poll.id,
            PollVote.user_id == current_user.id,
            PollVote.option_index == option_index,
        )
    )
    v = res.scalar_one_or_none()
    if v:
        await db.delete(v)
        await db.commit()

    poll = await _load_poll(db, poll_id)
    payload = _serialize(poll, current_user.id)

    from app.sockets.manager import sio
    room = f"channel_{poll.channel_id}" if poll.channel_id else f"team_{poll.team_id}"
    await sio.emit("poll_updated", payload, room=room)

    return payload


@router.post("/{poll_id}/close", response_model=dict)
async def close_poll(
    poll_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close a poll. Only the creator can close it."""
    poll = await _load_poll(db, poll_id)
    if str(poll.created_by) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Hanya pembuat poll yang bisa menutup")
    if not poll.closed_at:
        poll.closed_at = datetime.now(timezone.utc)
        await db.commit()
        poll = await _load_poll(db, poll_id)

    payload = _serialize(poll, current_user.id)

    from app.sockets.manager import sio
    room = f"channel_{poll.channel_id}" if poll.channel_id else f"team_{poll.team_id}"
    await sio.emit("poll_updated", payload, room=room)

    return payload


@router.get("/{poll_id}", response_model=dict)
async def get_poll(
    poll_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    poll = await _load_poll(db, poll_id)
    return _serialize(poll, current_user.id)
