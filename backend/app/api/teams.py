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

router = APIRouter(prefix="/organizations/{org_id}/teams", tags=["Teams"])


async def _check_org_membership(db: AsyncSession, org_id: str, user_id) -> OrgMember:
    """Verify user is a member of the organization."""
    result = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Anda bukan member organization ini")
    return member


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

    await db.commit()
    return {"message": f"Berhasil menambahkan {data.email} ke team"}


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

@router.post("/{team_id}/chat/messages", response_model=dict)
async def send_team_message(
    org_id: str, team_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message to the team chat."""
    await _check_org_membership(db, org_id, current_user.id)

    msg = TeamMessage(
        team_id=team_id,
        user_id=current_user.id,
        content=data.get("content")
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Broadcast via socket
    from app.sockets.manager import sio
    from app.models.team import TeamMessage as TMModel
    await sio.emit("team_message", {
        "id": str(msg.id),
        "user_id": str(msg.user_id),
        "content": msg.content,
        "created_at": msg.created_at.isoformat(),
        "user": {
            "name": current_user.name,
            "avatar_url": current_user.avatar_url
        }
    }, room=f"team_{team_id}")

    return {"status": "sent"}


@router.get("/{team_id}/chat/messages", response_model=List[dict])
async def list_team_messages(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List last 50 messages from team chat."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(TeamMessage)
        .options(selectinload(TeamMessage.user))
        .where(TeamMessage.team_id == team_id)
        .order_by(TeamMessage.created_at.asc())
        .limit(50)
    )
    messages = result.scalars().all()
    
    return [
        {
            "id": str(m.id),
            "user_id": str(m.user_id),
            "content": m.content,
            "created_at": m.created_at.isoformat(),
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
