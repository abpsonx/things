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
    """List all tasks for a team (excludes archived)."""
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
        .where(Task.team_id == team_id, Task.archived_at.is_(None))
        .order_by(Task.position)
    )
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


@router.get("/{team_id}/tasks/archived", response_model=List[TaskResponse])
async def list_archived_team_tasks(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archived team tasks only."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.label import TaskLabel
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee),
        )
        .where(Task.team_id == team_id, Task.archived_at.isnot(None))
        .order_by(Task.archived_at.desc())
    )
    return [_task_to_response(t) for t in result.scalars().all()]


@router.post("/{team_id}/tasks/{task_id}/archive", response_model=TaskResponse)
async def archive_team_task(
    org_id: str, team_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a team task."""
    from datetime import datetime as _dt, timezone as _tz
    from app.models.label import TaskLabel
    await _check_org_membership(db, org_id, current_user.id)
    res = await db.execute(select(Task).where(Task.id == task_id, Task.team_id == team_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")
    task.archived_at = _dt.now(_tz.utc)
    await log_activity(db, org_id=org_id, user_id=current_user.id, action="task_archived",
                       entity_type="task", entity_id=task.id, team_id=team_id, metadata={"title": task.title})
    await db.commit()
    res = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks), selectinload(Task.comments),
            selectinload(Task.attachments), selectinload(Task.assignee),
        ).where(Task.id == task_id)
    )
    return _task_to_response(res.scalar_one())


@router.post("/{team_id}/tasks/{task_id}/restore", response_model=TaskResponse)
async def restore_team_task(
    org_id: str, team_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore an archived team task."""
    from app.models.label import TaskLabel
    await _check_org_membership(db, org_id, current_user.id)
    res = await db.execute(select(Task).where(Task.id == task_id, Task.team_id == team_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")
    task.archived_at = None
    await log_activity(db, org_id=org_id, user_id=current_user.id, action="task_restored",
                       entity_type="task", entity_id=task.id, team_id=team_id, metadata={"title": task.title})
    await db.commit()
    res = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks), selectinload(Task.comments),
            selectinload(Task.attachments), selectinload(Task.assignee),
        ).where(Task.id == task_id)
    )
    return _task_to_response(res.scalar_one())


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

    if old_status != data.status:
        from app.services.task_activity import status_label
        await log_activity(
            db, org_id=org_id, user_id=current_user.id,
            action="task_moved", entity_type="task", entity_id=task.id,
            team_id=team_id,
            metadata={"summary": [f"Status: {status_label(old_status)} → {status_label(data.status)}"]},
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

    # Status/position changes are free; other edits need permission.
    if not set(update_data.keys()) <= {"status", "position"}:
        from app.services.task_permissions import user_can_edit_task
        if not await user_can_edit_task(db, task, current_user):
            raise HTTPException(status_code=403, detail="Kamu belum punya izin mengedit task ini. Minta izin ke pembuat task.")

    old_status = task.status
    old_values = {
        "title": task.title, "description": task.description, "priority": task.priority,
        "status": task.status, "assignee_id": task.assignee_id, "due_date": task.due_date,
    }
    for key, value in update_data.items():
        setattr(task, key, value)

    from app.services.task_activity import build_task_change_summary
    summary = await build_task_change_summary(db, old_values, update_data)
    if summary:
        action = "task_moved" if "status" in update_data and update_data["status"] != old_status else "task_updated"
        await log_activity(
            db, org_id=org_id, user_id=current_user.id,
            action=action, entity_type="task", entity_id=task.id,
            team_id=team_id, metadata={"summary": summary},
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

    # Delete is restricted to the task creator (and workspace owner/manager).
    from app.services.task_permissions import is_manager_or_creator
    if not await is_manager_or_creator(db, task, current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat task (atau manager) yang bisa menghapus task ini.")

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
            "avatar_url": current_user.avatar_url,
            "tagline": current_user.tagline
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
            "avatar_url": current_user.avatar_url,
            "tagline": current_user.tagline
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
            "avatar_url": current_user.avatar_url,
            "tagline": current_user.tagline
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
                "avatar_url": m.user.avatar_url,
                "tagline": m.user.tagline
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


# ============ Team File + Wiki Endpoints ============

@router.get("/{team_id}/files-direct")
async def list_team_files(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List files uploaded directly to the team."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.team_file import TeamFile

    res = await db.execute(
        select(TeamFile)
        .options(selectinload(TeamFile.uploader))
        .where(TeamFile.team_id == team_id)
        .order_by(TeamFile.created_at.desc())
    )
    rows = res.scalars().all()
    return [
        {
            "id": str(f.id),
            "file_name": f.file_name,
            "file_url": f.file_path if f.file_path.startswith(("http", "/")) else f"/api/{f.file_path}",
            "file_size": f.file_size,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "uploader": {"id": str(f.uploader.id), "name": f.uploader.name, "avatar_url": f.uploader.avatar_url} if f.uploader else None,
        }
        for f in rows
    ]


@router.post("/{team_id}/files-direct")
async def upload_team_file(
    org_id: str, team_id: str, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file directly to the team."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.team_file import TeamFile

    upload_dir = f"uploads/teams/{team_id}/files"
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = file.filename or "file"
    stored = f"{upload_dir}/{datetime.now().timestamp()}_{safe_name}"
    with open(stored, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    size = None
    try:
        size = os.path.getsize(stored)
    except Exception:
        pass

    tf = TeamFile(
        team_id=team_id,
        uploaded_by=current_user.id,
        file_name=safe_name,
        file_path=stored,
        file_size=size,
    )
    db.add(tf)
    await db.commit()
    await db.refresh(tf)
    return {
        "id": str(tf.id),
        "file_name": tf.file_name,
        "file_url": f"/api/{tf.file_path}",
        "file_size": tf.file_size,
        "created_at": tf.created_at.isoformat() if tf.created_at else None,
        "uploader": {"id": str(current_user.id), "name": current_user.name, "avatar_url": current_user.avatar_url},
    }


@router.delete("/{team_id}/files-direct/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team_file(
    org_id: str, team_id: str, file_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a directly-uploaded team file (uploader or org owner/manager)."""
    member = await _check_org_membership(db, org_id, current_user.id)
    from app.models.team_file import TeamFile

    res = await db.execute(select(TeamFile).where(TeamFile.id == file_id, TeamFile.team_id == team_id))
    tf = res.scalar_one_or_none()
    if not tf:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    if str(tf.uploaded_by) != str(current_user.id) and member.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Hanya pengupload atau owner/manager yang bisa hapus")

    try:
        if tf.file_path and os.path.isfile(tf.file_path):
            os.remove(tf.file_path)
    except Exception:
        pass
    await db.delete(tf)
    await db.commit()
    return None


@router.get("/{team_id}/docs")
async def list_team_docs(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List team wiki documents."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.document import Document

    res = await db.execute(
        select(Document)
        .where(Document.team_id == team_id)
        .order_by(Document.updated_at.desc())
    )
    rows = res.scalars().all()
    return [
        {
            "id": str(d.id),
            "title": d.title,
            "content": d.content,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        }
        for d in rows
    ]


@router.post("/{team_id}/docs")
async def create_team_doc(
    org_id: str, team_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a team wiki document."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.document import Document

    doc = Document(
        team_id=team_id,
        created_by=current_user.id,
        title=(data.get("title") or "Tanpa Judul").strip() or "Tanpa Judul",
        content=data.get("content") or "",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {"id": str(doc.id), "title": doc.title, "content": doc.content}


@router.patch("/{team_id}/docs/{doc_id}")
async def update_team_doc(
    org_id: str, team_id: str, doc_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a team wiki document."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.document import Document

    res = await db.execute(select(Document).where(Document.id == doc_id, Document.team_id == team_id))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
    if "title" in data and data["title"] is not None:
        doc.title = data["title"].strip() or "Tanpa Judul"
    if "content" in data and data["content"] is not None:
        doc.content = data["content"]
    await db.commit()
    await db.refresh(doc)
    return {"id": str(doc.id), "title": doc.title, "content": doc.content}


@router.delete("/{team_id}/docs/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team_doc(
    org_id: str, team_id: str, doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a team wiki document."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.document import Document

    res = await db.execute(select(Document).where(Document.id == doc_id, Document.team_id == team_id))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
    await db.delete(doc)
    await db.commit()
    return None


# ============ Team Calendar / Event Endpoints ============

@router.get("/{team_id}/events")
async def list_team_events(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List events for a team.

    Private events are only visible to their attendees + the creator.
    """
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.event import Event, EventAttendee

    result = await db.execute(
        select(Event)
        .options(
            selectinload(Event.creator),
            selectinload(Event.attendees).selectinload(EventAttendee.user),
        )
        .where(Event.team_id == team_id)
        .order_by(Event.start_at.asc())
    )
    rows = result.scalars().all()
    out = []
    for e in rows:
        attendee_ids = [str(a.user_id) for a in (e.attendees or [])]
        if (e.visibility or "public") == "private":
            if str(current_user.id) not in attendee_ids and str(e.created_by) != str(current_user.id):
                continue
        out.append({
            "id": str(e.id),
            "title": e.title,
            "description": e.description,
            "start_at": e.start_at.isoformat() if e.start_at else None,
            "end_at": e.end_at.isoformat() if e.end_at else None,
            "visibility": e.visibility or "public",
            "category": e.category or "meeting",
            "created_by": str(e.created_by),
            "creator": {"id": str(e.creator.id), "name": e.creator.name} if e.creator else None,
            "attendees": [
                {"id": str(a.user_id), "name": a.user.name if a.user else "", "avatar_url": a.user.avatar_url if a.user else None}
                for a in (e.attendees or [])
            ],
        })
    return out


@router.post("/{team_id}/events", status_code=status.HTTP_201_CREATED)
async def create_team_event(
    org_id: str, team_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a team event + notify recipients.

    Body: { title, description?, start_at, end_at?, visibility?, category?, attendee_ids?[] }.
    visibility: "public" (default, semua) | "private" (hanya peserta).
    Empty attendee_ids on a public event = whole team.
    """
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.event import Event, EventAttendee
    from datetime import datetime as _dt

    title = (data.get("title") or "").strip()
    start_at = data.get("start_at")
    if not title or not start_at:
        raise HTTPException(status_code=400, detail="Judul & waktu mulai wajib")

    def _parse(v):
        if not v:
            return None
        try:
            return _dt.fromisoformat(str(v).replace("Z", "+00:00"))
        except Exception:
            return None

    visibility = data.get("visibility") if data.get("visibility") in ("public", "private") else "public"
    category = data.get("category") if data.get("category") in ("meeting", "event", "sale", "promo", "other") else "meeting"
    attendee_ids = data.get("attendee_ids") or []

    ev = Event(
        team_id=team_id,
        created_by=current_user.id,
        title=title,
        description=data.get("description"),
        start_at=_parse(start_at),
        end_at=_parse(data.get("end_at")),
        visibility=visibility,
        category=category,
    )
    db.add(ev)
    await db.flush()

    for uid in attendee_ids:
        db.add(EventAttendee(event_id=ev.id, user_id=uid, status="invited"))

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="event_created", entity_type="event", entity_id=ev.id,
        team_id=team_id, metadata={"title": title},
    )

    # Decide notify targets: explicit attendees, else (public) whole team.
    from app.services.notification import notify_user
    team_res = await db.execute(select(Team).where(Team.id == team_id))
    team_row = team_res.scalar_one_or_none()
    team_name = team_row.name if team_row else "tim"
    if attendee_ids:
        notify_targets = [str(u) for u in attendee_ids]
    elif visibility == "public":
        members_res = await db.execute(select(TeamMember).where(TeamMember.team_id == team_id))
        notify_targets = [str(m.user_id) for m in members_res.scalars().all()]
    else:
        notify_targets = []

    # Tagged people get a distinct "kamu di-tag" ping (and skip the generic one).
    mention_ids = [str(u) for u in (data.get("mention_ids") or [])]
    mentioned = set(mention_ids)
    for uid in mention_ids:
        if uid == str(current_user.id):
            continue
        await notify_user(
            db,
            user_id=uid,
            type="event",
            title=f"Kamu di-tag di jadwal: {title}",
            content=f"{current_user.name} menandai kamu di jadwal tim {team_name}",
            ref_id=str(ev.id),
            org_id=str(org_id),
            url=f"/org/{org_id}/team/{team_id}/calendar",
        )

    for uid in notify_targets:
        if uid == str(current_user.id) or uid in mentioned:
            continue
        await notify_user(
            db,
            user_id=uid,
            type="event",
            title=f"Jadwal baru: {title}",
            content=f"{current_user.name} membuat jadwal di tim {team_name}",
            ref_id=str(ev.id),
            org_id=str(org_id),
            url=f"/org/{org_id}/team/{team_id}/calendar",
        )

    await db.commit()
    await db.refresh(ev)
    return {
        "id": str(ev.id),
        "title": ev.title,
        "description": ev.description,
        "start_at": ev.start_at.isoformat() if ev.start_at else None,
        "end_at": ev.end_at.isoformat() if ev.end_at else None,
        "visibility": ev.visibility,
        "category": ev.category,
    }


@router.delete("/{team_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team_event(
    org_id: str, team_id: str, event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a team event (creator or org owner/manager)."""
    member = await _check_org_membership(db, org_id, current_user.id)
    from app.models.event import Event

    res = await db.execute(select(Event).where(Event.id == event_id, Event.team_id == team_id))
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Event tidak ditemukan")
    if str(ev.created_by) != str(current_user.id) and member.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Hanya pembuat atau owner/manager yang bisa hapus")

    await db.delete(ev)
    await db.commit()
    return None


# ============ Team Announcement Endpoints ============

@router.get("/{team_id}/announcements")
async def list_team_announcements(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List announcements for a team (newest first).

    Only announcements addressed to the current user are returned: either
    untargeted (visible to all) or where the user is an explicit recipient.
    The creator always sees their own.
    """
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import Announcement, AnnouncementRecipient, AnnouncementComment
    from datetime import datetime as _dt, timezone as _tz

    result = await db.execute(
        select(Announcement)
        .options(
            selectinload(Announcement.creator),
            selectinload(Announcement.recipients).selectinload(AnnouncementRecipient.user),
            selectinload(Announcement.comments),
        )
        .where(Announcement.team_id == team_id)
        .order_by(Announcement.created_at.desc())
    )
    rows = result.scalars().all()
    now = _dt.now(_tz.utc)
    out = []
    for a in rows:
        recipient_ids = [str(r.user_id) for r in (a.recipients or [])]
        # Visibility: untargeted, a recipient, or the creator
        if recipient_ids and str(current_user.id) not in recipient_ids and str(a.creator_id) != str(current_user.id):
            continue
        expires_at = a.expires_at
        is_expired = bool(expires_at and expires_at < now)
        out.append({
            "id": str(a.id),
            "title": a.title,
            "content": a.content,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "is_expired": is_expired,
            "creator_id": str(a.creator_id) if a.creator_id else None,
            "creator": {
                "id": str(a.creator.id),
                "name": a.creator.name,
                "avatar_url": a.creator.avatar_url,
            } if a.creator else None,
            "recipients": [
                {"id": str(r.user_id), "name": r.user.name if r.user else "", "avatar_url": r.user.avatar_url if r.user else None}
                for r in (a.recipients or [])
            ],
            "comment_count": len(a.comments or []),
        })
    return out


@router.post("/{team_id}/announcements", status_code=status.HTTP_201_CREATED)
async def create_team_announcement(
    org_id: str, team_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a team announcement + notify recipients.

    Body: { title, content, expires_at?, recipient_ids?[] }.
    Empty/absent recipient_ids = everyone in the team.
    """
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import Announcement, AnnouncementRecipient
    from datetime import datetime as _dt

    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="Judul dan isi pengumuman wajib")

    expires_at = None
    if data.get("expires_at"):
        try:
            expires_at = _dt.fromisoformat(str(data["expires_at"]).replace("Z", "+00:00"))
        except Exception:
            expires_at = None

    recipient_ids = data.get("recipient_ids") or []

    ann = Announcement(
        team_id=team_id,
        creator_id=current_user.id,
        title=title,
        content=content,
        expires_at=expires_at,
    )
    db.add(ann)
    await db.flush()

    for uid in recipient_ids:
        db.add(AnnouncementRecipient(announcement_id=ann.id, user_id=uid))

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="announcement_created", entity_type="announcement", entity_id=ann.id,
        team_id=team_id, metadata={"title": title},
    )

    # Decide who to notify: explicit recipients, otherwise all team members.
    from app.services.notification import notify_user
    team_res = await db.execute(select(Team).where(Team.id == team_id))
    team_row = team_res.scalar_one_or_none()
    team_name = team_row.name if team_row else "tim"
    if recipient_ids:
        notify_targets = [str(u) for u in recipient_ids]
    else:
        members_res = await db.execute(select(TeamMember).where(TeamMember.team_id == team_id))
        notify_targets = [str(m.user_id) for m in members_res.scalars().all()]

    # Tagged people get a distinct "kamu di-tag" ping (and skip the generic one).
    mention_ids = [str(u) for u in (data.get("mention_ids") or [])]
    mentioned = set(mention_ids)
    for uid in mention_ids:
        if uid == str(current_user.id):
            continue
        await notify_user(
            db,
            user_id=uid,
            type="announcement",
            title=f"Kamu di-tag di pengumuman: {title}",
            content=f"{current_user.name} menandai kamu di pengumuman tim {team_name}",
            ref_id=str(ann.id),
            org_id=str(org_id),
            url=f"/org/{org_id}/team/{team_id}/announcements",
        )

    for uid in notify_targets:
        if uid == str(current_user.id) or uid in mentioned:
            continue
        await notify_user(
            db,
            user_id=uid,
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
        "expires_at": ann.expires_at.isoformat() if ann.expires_at else None,
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

    from app.models.announcement import AnnouncementRecipient
    from datetime import datetime as _dt

    if "title" in data and data["title"]:
        ann.title = data["title"].strip()
    if "content" in data and data["content"]:
        ann.content = data["content"].strip()
    if "expires_at" in data:
        if data["expires_at"]:
            try:
                ann.expires_at = _dt.fromisoformat(str(data["expires_at"]).replace("Z", "+00:00"))
            except Exception:
                pass
        else:
            ann.expires_at = None
    if "recipient_ids" in data:
        # Replace recipient set
        existing = await db.execute(
            select(AnnouncementRecipient).where(AnnouncementRecipient.announcement_id == ann.id)
        )
        for r in existing.scalars().all():
            await db.delete(r)
        for uid in (data["recipient_ids"] or []):
            db.add(AnnouncementRecipient(announcement_id=ann.id, user_id=uid))

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


# ---- Announcement comments ----

@router.get("/{team_id}/announcements/{announcement_id}/comments")
async def list_announcement_comments(
    org_id: str, team_id: str, announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List comments on a team announcement (oldest first)."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import AnnouncementComment

    res = await db.execute(
        select(AnnouncementComment)
        .options(selectinload(AnnouncementComment.user))
        .where(AnnouncementComment.announcement_id == announcement_id)
        .order_by(AnnouncementComment.created_at.asc())
    )
    return [
        {
            "id": str(c.id),
            "content": c.content,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "user_id": str(c.user_id),
            "user": {"id": str(c.user.id), "name": c.user.name, "avatar_url": c.user.avatar_url} if c.user else None,
        }
        for c in res.scalars().all()
    ]


@router.post("/{team_id}/announcements/{announcement_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_announcement_comment(
    org_id: str, team_id: str, announcement_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Comment on a team announcement + notify the announcement creator."""
    await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import Announcement, AnnouncementComment

    content = (data.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Komentar kosong")

    ann_res = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id, Announcement.team_id == team_id)
    )
    ann = ann_res.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")

    comment = AnnouncementComment(
        announcement_id=announcement_id,
        user_id=current_user.id,
        content=content,
    )
    db.add(comment)

    # Notify the announcement creator (skip self)
    if ann.creator_id and str(ann.creator_id) != str(current_user.id):
        from app.services.notification import notify_user
        snippet = content[:60] + ("..." if len(content) > 60 else "")
        await notify_user(
            db,
            user_id=str(ann.creator_id),
            type="announcement_comment",
            title="Komentar pengumuman",
            content=f"{current_user.name} berkomentar di '{ann.title}': {snippet}",
            ref_id=str(announcement_id),
            org_id=str(org_id),
            url=f"/org/{org_id}/team/{team_id}/announcements",
        )

    await db.commit()
    await db.refresh(comment)
    return {
        "id": str(comment.id),
        "content": comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "user_id": str(current_user.id),
        "user": {"id": str(current_user.id), "name": current_user.name, "avatar_url": current_user.avatar_url},
    }


@router.delete("/{team_id}/announcements/{announcement_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement_comment(
    org_id: str, team_id: str, announcement_id: str, comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an announcement comment (author or org owner/manager)."""
    member = await _check_org_membership(db, org_id, current_user.id)
    from app.models.announcement import AnnouncementComment

    res = await db.execute(
        select(AnnouncementComment).where(
            AnnouncementComment.id == comment_id,
            AnnouncementComment.announcement_id == announcement_id,
        )
    )
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Komentar tidak ditemukan")
    if str(c.user_id) != str(current_user.id) and member.role not in ("owner", "manager"):
        raise HTTPException(status_code=403, detail="Tidak berhak menghapus komentar ini")

    await db.delete(c)
    await db.commit()
    return None
