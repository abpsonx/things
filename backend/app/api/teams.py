"""Team endpoints — CRUD and member management."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.organization import OrgMember
from app.models.team import Team, TeamMember, TeamMessage
from app.models.activity_log import ActivityLog
from app.models.task import Task
from app.schemas import (
    TeamCreate, TeamUpdate, TeamResponse, 
    TeamMemberResponse, UserResponse, InviteMemberRequest,
    ActivityLogResponse
)
from app.dependencies import get_current_user
from app.services import log_activity
from app.core.permissions import SUPERUSER_ROLES

router = APIRouter(prefix="/organizations/{org_id}/teams", tags=["Teams"])


async def _check_org_membership(db: AsyncSession, org_id: str, user_id) -> OrgMember:
    """Verify user is a member of the organization.

    Superusers (admin/developer) bypass and get a synthetic owner membership.
    """
    result = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if member:
        return member
    role_res = await db.execute(select(User.role).where(User.id == user_id))
    if role_res.scalar() in SUPERUSER_ROLES:
        return OrgMember(org_id=org_id, user_id=user_id, role="owner")
    raise HTTPException(status_code=403, detail="Anda bukan member organization ini")


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    org_id: str,
    data: TeamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new team in an organization."""
    await _check_org_membership(db, org_id, current_user.id)

    team = Team(
        org_id=org_id,
        name=data.name,
        description=data.description,
        created_by=current_user.id,
    )
    db.add(team)
    await db.flush()

    # Add creator as team lead
    tm = TeamMember(team_id=team.id, user_id=current_user.id, role="lead")
    db.add(tm)

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="team_created", entity_type="team", entity_id=team.id,
        team_id=team.id, metadata={"name": data.name},
    )

    await db.commit()
    await db.refresh(team)
    return TeamResponse.model_validate(team)


@router.get("", response_model=List[TeamResponse])
async def list_teams(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all teams in an organization."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(Team)
        .where(Team.org_id == org_id)
        .order_by(Team.created_at.desc())
    )
    teams = result.scalars().all()
    return [TeamResponse.model_validate(t) for t in teams]


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    org_id: str,
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get team detail."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.org_id == org_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team tidak ditemukan")

    return TeamResponse.model_validate(team)


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    org_id: str,
    team_id: str,
    data: TeamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update team details."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.org_id == org_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team tidak ditemukan")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(team, key, value)

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="team_updated", entity_type="team", entity_id=team.id,
        team_id=team.id, metadata=update_data,
    )

    await db.commit()
    await db.refresh(team)
    return TeamResponse.model_validate(team)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    org_id: str,
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a team."""
    org_member = await _check_org_membership(db, org_id, current_user.id)
    if org_member.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Hanya owner/manager yang bisa hapus team")

    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.org_id == org_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team tidak ditemukan")

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="team_deleted", entity_type="team", entity_id=team.id,
        team_id=team.id, metadata={"name": team.name},
    )

    await db.delete(team)
    await db.commit()


@router.get("/{team_id}/members", response_model=List[TeamMemberResponse])
async def list_team_members(
    org_id: str,
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List members of a team."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(TeamMember)
        .options(selectinload(TeamMember.user))
        .where(TeamMember.team_id == team_id)
    )
    members = result.scalars().all()
    return [
        TeamMemberResponse(
            id=m.id,
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at,
            user=UserResponse.model_validate(m.user) if m.user else None,
        )
        for m in members
    ]


@router.post("/{team_id}/members", status_code=status.HTTP_201_CREATED)
async def add_team_member(
    org_id: str,
    team_id: str,
    data: InviteMemberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a member to a team."""
    await _check_org_membership(db, org_id, current_user.id)

    # Find user
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    # Check if already a team member
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user.id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User sudah menjadi member team")

    tm = TeamMember(team_id=team_id, user_id=user.id, role="member")
    db.add(tm)

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="member_added_to_team", entity_type="member", entity_id=user.id,
        team_id=team_id, metadata={"email": data.email, "role": data.role},
    )

    # Notify the added team member
    from app.services.notification import notify_user
    team_res = await db.execute(select(Team).where(Team.id == team_id))
    team_row = team_res.scalar_one_or_none()
    team_name = team_row.name if team_row else "team"
    await notify_user(
        db,
        user_id=str(user.id),
        type="team_invite",
        title="Diundang ke Tim",
        content=f"{current_user.name} menambahkan kamu ke tim {team_name}",
        ref_id=str(team_id),
        org_id=str(org_id),
        url=f"/org/{org_id}/team/{team_id}/board",
    )

    await db.commit()
    return {"message": f"Berhasil menambahkan {data.email} ke team"}


@router.delete("/{team_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_member(
    org_id: str,
    team_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from a team."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(TeamMember).where(TeamMember.id == member_id, TeamMember.team_id == team_id)
    )
    tm = result.scalar_one_or_none()
    if not tm:
        raise HTTPException(status_code=404, detail="Member tidak ditemukan di team")

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="member_removed_from_team", entity_type="member", entity_id=tm.user_id,
        team_id=team_id, metadata={"user_id": str(tm.user_id)},
    )

    await db.delete(tm)
    await db.commit()
    return None


# ============ Team Task Endpoints ============

from sqlalchemy import func
from app.models.task import Task
from app.models.label import TaskLabel
from app.schemas import TaskCreate, TaskUpdate, TaskMoveRequest, TaskResponse, LabelResponse


def _task_to_response(task):
    labels = [LabelResponse(id=tl.label.id, name=tl.label.name, color=tl.label.color)
              for tl in (task.task_labels or []) if tl.label]
    resp = TaskResponse.model_validate(task)
    resp.labels = labels
    resp.comments_count = len(task.comments) if hasattr(task, 'comments') else 0
    resp.attachments_count = len(task.attachments) if hasattr(task, 'attachments') else 0
    return resp


@router.get("/{team_id}/tasks", response_model=List[TaskResponse])
async def list_team_tasks(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all tasks for a team."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.label import TaskLabel
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee)
        )
        .where(Task.team_id == team_id)
        .order_by(Task.position)
    )
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


@router.post("/{team_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_team_task(
    org_id: str, team_id: str, data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a task for a team."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(func.coalesce(func.max(Task.position), 0))
        .where(Task.team_id == team_id, Task.status == data.status)
    )
    max_pos = result.scalar()

    task = Task(
        team_id=team_id, title=data.title, description=data.description,
        status=data.status, priority=data.priority, assignee_id=data.assignee_id,
        created_by=current_user.id, due_date=data.due_date, position=max_pos + 1,
    )
    db.add(task)
    await db.flush()

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="task_created", entity_type="task", entity_id=task.id,
        team_id=team_id, metadata={"title": data.title, "status": data.status},
    )
    await db.commit()

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee)
        )
        .where(Task.id == task.id)
    )
    task = result.scalar_one()
    return _task_to_response(task)


@router.patch("/{team_id}/tasks/{task_id}/move", response_model=TaskResponse)
async def move_team_task(
    org_id: str, team_id: str, task_id: str, data: TaskMoveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a team task to a different status/position."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(select(Task).where(Task.id == task_id, Task.team_id == team_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    old_status = task.status
    task.status = data.status
    task.position = data.position

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="task_moved", entity_type="task", entity_id=task.id,
        team_id=team_id,
        metadata={"old_status": old_status, "new_status": data.status, "position": data.position},
    )
    await db.commit()

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee)
        )
        .where(Task.id == task_id)
    )
    task = result.scalar_one()
    return _task_to_response(task)


@router.get("/{team_id}/tasks/{task_id}", response_model=TaskResponse)
async def get_team_task(
    org_id: str, team_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detail for a specific team task."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee)
        )
        .where(Task.id == task_id, Task.team_id == team_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")
    
    return _task_to_response(task)


@router.put("/{team_id}/tasks/{task_id}", response_model=TaskResponse)
async def update_team_task(
    org_id: str, team_id: str, task_id: str, data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a team task."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(select(Task).where(Task.id == task_id, Task.team_id == team_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)

    await db.commit()

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee)
        )
        .where(Task.id == task_id)
    )
    task = result.scalar_one()
    return _task_to_response(task)


@router.delete("/{team_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team_task(
    org_id: str, team_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a team task."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(select(Task).where(Task.id == task_id, Task.team_id == team_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    await db.delete(task)
    await db.commit()
    return None

# ============ Team Chat Endpoints ============

# ============ Team Chat Endpoints ============
import os
import shutil
from datetime import datetime, timezone
from fastapi import UploadFile, File

@router.post("/{team_id}/chat/messages", response_model=dict)
async def send_team_message(
    org_id: str, team_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message to the team chat."""
    await _check_org_membership(db, org_id, current_user.id)

    parent_id_raw = data.get("parent_id")
    msg = TeamMessage(
        team_id=team_id,
        user_id=current_user.id,
        content=data.get("content"),
        file_url=data.get("file_url"),
        file_name=data.get("file_name"),
        file_type=data.get("file_type"),
        parent_id=parent_id_raw,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Build parent preview for reply context
    parent_preview = None
    if msg.parent_id:
        pr_res = await db.execute(
            select(TeamMessage).options(selectinload(TeamMessage.user)).where(TeamMessage.id == msg.parent_id)
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

    # Broadcast via socket
    from app.sockets.manager import sio
    await sio.emit("team_message", {
        "id": str(msg.id),
        "user_id": str(msg.user_id),
        "content": msg.content,
        "file_url": msg.file_url,
        "file_name": msg.file_name,
        "file_type": msg.file_type,
        "created_at": msg.created_at.isoformat(),
        "parent_id": str(msg.parent_id) if msg.parent_id else None,
        "parent": parent_preview,
        "user": {
            "name": current_user.name,
            "avatar_url": current_user.avatar_url
        }
    }, room=f"team_{team_id}")

    return {
        "id": str(msg.id),
        "user_id": str(msg.user_id),
        "content": msg.content,
        "file_url": msg.file_url,
        "file_name": msg.file_name,
        "file_type": msg.file_type,
        "created_at": msg.created_at.isoformat(),
        "edited_at": None,
        "parent_id": str(msg.parent_id) if msg.parent_id else None,
        "parent": parent_preview,
        "status": "sent",
        "user": {
            "name": current_user.name,
            "avatar_url": current_user.avatar_url
        }
    }


@router.put("/{team_id}/chat/messages/{message_id}", response_model=dict)
async def edit_team_message(
    org_id: str, team_id: str, message_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an existing chat message."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(TeamMessage).where(TeamMessage.id == message_id, TeamMessage.user_id == current_user.id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan atau Anda tidak berhak mengeditnya")

    msg.content = data.get("content")
    msg.edited_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)

    # Broadcast update
    from app.sockets.manager import sio
    await sio.emit("message_edited", {
        "id": str(msg.id),
        "content": msg.content,
        "edited_at": msg.edited_at.isoformat()
    }, room=f"team_{team_id}")

    return {"id": str(msg.id), "content": msg.content, "edited_at": msg.edited_at.isoformat()}


@router.delete("/{team_id}/chat/messages/{message_id}")
async def delete_team_message(
    org_id: str, team_id: str, message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat message."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(TeamMessage).where(TeamMessage.id == message_id, TeamMessage.user_id == current_user.id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan atau Anda tidak berhak menghapusnya")

    await db.delete(msg)
    await db.commit()

    # Broadcast deletion
    from app.sockets.manager import sio
    await sio.emit("message_deleted", str(message_id), room=f"team_{team_id}")

    return {"status": "deleted"}


@router.post("/{team_id}/chat/upload")
async def upload_chat_file(
    org_id: str, team_id: str, file: UploadFile = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to team chat."""
    await _check_org_membership(db, org_id, current_user.id)

    upload_dir = f"uploads/teams/{team_id}/chat"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = f"{upload_dir}/{datetime.now().timestamp()}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_url = f"/api/{file_path}" # Assuming Nginx/FastAPI serves /api/uploads
    
    # Send a message automatically with the file
    msg = TeamMessage(
        team_id=team_id,
        user_id=current_user.id,
        content=f"Sent a file: {file.filename}",
        file_url=file_url,
        file_name=file.filename,
        file_type=file.content_type
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Broadcast
    from app.sockets.manager import sio
    await sio.emit("team_message", {
        "id": str(msg.id),
        "user_id": str(msg.user_id),
        "content": msg.content,
        "file_url": msg.file_url,
        "file_name": msg.file_name,
        "file_type": msg.file_type,
        "created_at": msg.created_at.isoformat(),
        "user": {
            "name": current_user.name,
            "avatar_url": current_user.avatar_url
        }
    }, room=f"team_{team_id}")

    return {"file_url": file_url}


@router.get("/{team_id}/chat/messages", response_model=List[dict])
async def list_team_messages(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List last 50 messages from team chat."""
    await _check_org_membership(db, org_id, current_user.id)

    from app.models.poll import Poll
    from app.api.polls import _serialize as _serialize_poll
    from app.api.reactions import fetch_reactions_for

    result = await db.execute(
        select(TeamMessage)
        .options(
            selectinload(TeamMessage.user),
            selectinload(TeamMessage.poll).selectinload(Poll.votes),
        )
        .where(TeamMessage.team_id == team_id)
        .order_by(TeamMessage.created_at.asc())
        .limit(100)
    )
    messages = result.scalars().all()
    reactions_map = await fetch_reactions_for(
        db, "team_message", [m.id for m in messages], current_user.id,
    )

    # Resolve parents in one batched query so reply previews render
    parent_ids = {m.parent_id for m in messages if m.parent_id}
    parents_map: dict = {}
    if parent_ids:
        pr_res = await db.execute(
            select(TeamMessage)
            .options(selectinload(TeamMessage.user))
            .where(TeamMessage.id.in_(parent_ids))
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

    return [
        {
            "id": str(m.id),
            "user_id": str(m.user_id),
            "content": m.content,
            "file_url": m.file_url,
            "file_name": m.file_name,
            "file_type": m.file_type,
            "created_at": m.created_at.isoformat(),
            "edited_at": m.edited_at.isoformat() if m.edited_at else None,
            "parent_id": str(m.parent_id) if m.parent_id else None,
            "parent": parents_map.get(str(m.parent_id)) if m.parent_id else None,
            "poll": _serialize_poll(m.poll, current_user.id) if m.poll else None,
            "reactions": reactions_map.get(str(m.id), []),
            "user": {
                "name": m.user.name,
                "avatar_url": m.user.avatar_url
            }
        }
        for m in messages
    ]

# ============ Team Activity Endpoints ============

@router.get("/{team_id}/activities", response_model=List[ActivityLogResponse])
async def get_team_activities(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get activity logs for a specific team."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(ActivityLog)
        .options(selectinload(ActivityLog.user))
        .where(ActivityLog.team_id == team_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(100)
    )
    activities = result.scalars().all()
    return [ActivityLogResponse.model_validate(a) for a in activities]


# ============ Team Announcement Endpoints ============

@router.get("/{team_id}/announcements")
async def list_team_announcements(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List announcements for a team (newest first)."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import Announcement

    result = await db.execute(
        select(Announcement)
        .options(selectinload(Announcement.creator))
        .where(Announcement.team_id == team_id)
        .order_by(Announcement.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "title": a.title,
            "content": a.content,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            "creator_id": str(a.creator_id) if a.creator_id else None,
            "creator": {
                "id": str(a.creator.id),
                "name": a.creator.name,
                "avatar_url": a.creator.avatar_url,
            } if a.creator else None,
        }
        for a in rows
    ]


@router.post("/{team_id}/announcements", status_code=status.HTTP_201_CREATED)
async def create_team_announcement(
    org_id: str, team_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a team announcement + notify all team members."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import Announcement

    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="Judul dan isi pengumuman wajib")

    ann = Announcement(
        team_id=team_id,
        creator_id=current_user.id,
        title=title,
        content=content,
    )
    db.add(ann)
    await db.flush()

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="announcement_created", entity_type="announcement", entity_id=ann.id,
        team_id=team_id, metadata={"title": title},
    )

    # Notify all team members except the author
    from app.services.notification import notify_user
    team_res = await db.execute(select(Team).where(Team.id == team_id))
    team_row = team_res.scalar_one_or_none()
    team_name = team_row.name if team_row else "tim"
    members_res = await db.execute(select(TeamMember).where(TeamMember.team_id == team_id))
    for m in members_res.scalars().all():
        if str(m.user_id) == str(current_user.id):
            continue
        await notify_user(
            db,
            user_id=str(m.user_id),
            type="announcement",
            title=f"Pengumuman: {title}",
            content=f"{current_user.name} memposting pengumuman di tim {team_name}",
            ref_id=str(ann.id),
            org_id=str(org_id),
            url=f"/org/{org_id}/team/{team_id}/announcements",
        )

    await db.commit()
    await db.refresh(ann)
    return {
        "id": str(ann.id),
        "title": ann.title,
        "content": ann.content,
        "created_at": ann.created_at.isoformat() if ann.created_at else None,
        "creator": {"id": str(current_user.id), "name": current_user.name, "avatar_url": current_user.avatar_url},
    }


@router.put("/{team_id}/announcements/{announcement_id}")
async def update_team_announcement(
    org_id: str, team_id: str, announcement_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a team announcement (creator only)."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import Announcement

    res = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id, Announcement.team_id == team_id)
    )
    ann = res.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")
    if str(ann.creator_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Hanya pembuat pengumuman yang bisa mengedit")

    if "title" in data and data["title"]:
        ann.title = data["title"].strip()
    if "content" in data and data["content"]:
        ann.content = data["content"].strip()
    await db.commit()
    await db.refresh(ann)
    return {"id": str(ann.id), "title": ann.title, "content": ann.content}


@router.delete("/{team_id}/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team_announcement(
    org_id: str, team_id: str, announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a team announcement (creator or org owner/manager)."""
    member = await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import Announcement

    res = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id, Announcement.team_id == team_id)
    )
    ann = res.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")

    can_delete = (
        str(ann.creator_id) == str(current_user.id)
        or member.role in ("owner", "manager")
    )
    if not can_delete:
        raise HTTPException(status_code=403, detail="Hanya pembuat atau owner/manager yang bisa menghapus")

    await db.delete(ann)
    await db.commit()
    return None
