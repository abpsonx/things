"""Team endpoints — CRUD and member management."""
import re
from uuid import UUID as _UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.models.user import User
from app.models.organization import OrgMember
from app.models.team import Team, TeamMember, TeamMessage
from app.models.team_board_column import TeamBoardColumn
from app.models.activity_log import ActivityLog
from app.models.task import Task, TaskAssignee
from app.schemas import (
    TeamCreate, TeamUpdate, TeamResponse, 
    TeamMemberResponse, UserResponse, InviteMemberRequest,
    ActivityLogResponse
)
from app.dependencies import get_current_user
from app.services import log_activity
from app.core.permissions import SUPERUSER_ROLES, is_superuser

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


async def _is_team_member(db: AsyncSession, team_id, user_id) -> bool:
    res = await db.execute(
        select(TeamMember.id).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    return res.scalar_one_or_none() is not None


async def _require_team_access(db: AsyncSession, org_id: str, team_id: str, user: User) -> OrgMember:
    """Gate access to a specific team. Workspace Admin (owner) / Super User /
    Developer see every team; everyone else (Manager + Member) must actually
    be a member of THIS team. Returns the caller's OrgMember (synthetic for SU)."""
    member = await _check_org_membership(db, org_id, user.id)
    if member.role == "owner":  # Admin workspace bypass; SU gets synthetic 'owner' via _check_org_membership
        return member
    if await _is_team_member(db, team_id, user.id):
        return member
    raise HTTPException(status_code=403, detail="Kamu bukan anggota tim ini")


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
    """List teams in an organization.

    Workspace Admin (owner) + Super User / Developer see every team; Manager
    and regular Members only see teams they actually belong to (teams are
    private to their members — including Managers).
    """
    member = await _check_org_membership(db, org_id, current_user.id)

    query = select(Team).where(Team.org_id == org_id)
    if member.role != "owner":  # Admin bypass; SU gets synthetic 'owner'
        query = query.where(
            Team.id.in_(
                select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
            )
        )
    result = await db.execute(query.order_by(Team.created_at.desc()))
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
    await _require_team_access(db, org_id, team_id, current_user)

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
    await _require_team_access(db, org_id, team_id, current_user)

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
    """Delete a team — restricted to the team's creator or platform SU/Developer."""
    await _require_team_access(db, org_id, team_id, current_user)

    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.org_id == org_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team tidak ditemukan")

    if not is_superuser(current_user) and str(team.created_by) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Hanya pembuat tim atau Super User yang bisa menghapus tim")

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
    await _require_team_access(db, org_id, team_id, current_user)

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
    await _require_team_access(db, org_id, team_id, current_user)

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
    await _require_team_access(db, org_id, team_id, current_user)

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
from app.models.task import Task, TaskAssignee
from app.models.label import TaskLabel
from app.schemas import TaskCreate, TaskUpdate, TaskMoveRequest, TaskResponse, LabelResponse


def _task_to_response(task):
    labels = [LabelResponse(id=tl.label.id, name=tl.label.name, color=tl.label.color)
              for tl in (task.task_labels or []) if tl.label]
    resp = TaskResponse.model_validate(task)
    resp.labels = labels
    resp.comments_count = len(task.comments) if hasattr(task, 'comments') else 0
    resp.attachments_count = len(task.attachments) if hasattr(task, 'attachments') else 0
    raw_links = getattr(task, "linked_brief_ids", None) or []
    resp.linked_brief_ids = [str(x) for x in raw_links]
    if resp.custom_properties is None:
        resp.custom_properties = []
    # Manually build assignees — lihat catatan di tasks._task_to_response.
    links = task.__dict__.get("assignee_links")
    if links:
        from app.schemas import UserResponse
        resp.assignees = [
            UserResponse.model_validate(link.user)
            for link in links
            if getattr(link, "user", None) is not None
        ]
    return resp


async def _sync_task_assignees(db, task, ids):
    """Replace a task's assignees with `ids`. Keeps the legacy single
    assignee_id in sync (= first id) so older single-assignee UIs still work."""
    from sqlalchemy import delete as _sa_delete
    norm, seen = [], set()
    for i in (ids or []):
        s = str(i)
        if s not in seen:
            seen.add(s)
            norm.append(s)
    await db.execute(_sa_delete(TaskAssignee).where(TaskAssignee.task_id == task.id))
    for uid in norm:
        db.add(TaskAssignee(task_id=task.id, user_id=uid))
    task.assignee_id = norm[0] if norm else None


@router.get("/{team_id}/tasks", response_model=List[TaskResponse])
async def list_team_tasks(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all tasks for a team (excludes archived)."""
    await _require_team_access(db, org_id, team_id, current_user)
    from app.models.label import TaskLabel
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee), selectinload(Task.assignee_links).selectinload(TaskAssignee.user)
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
    await _require_team_access(db, org_id, team_id, current_user)
    from app.models.label import TaskLabel
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee), selectinload(Task.assignee_links).selectinload(TaskAssignee.user),
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
    await _require_team_access(db, org_id, team_id, current_user)
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
            selectinload(Task.attachments), selectinload(Task.assignee), selectinload(Task.assignee_links).selectinload(TaskAssignee.user),
        ).where(Task.id == task_id)
    )
    return _task_to_response(res.scalar_one())


@router.post("/{team_id}/tasks/{task_id}/duplicate", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_team_task(
    org_id: str, team_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clone a team task — title gets " (copy)" suffix, copies description,
    priority, status, due_date, labels, assignees. Activity items (subtasks,
    comments, attachments) are NOT carried over."""
    from sqlalchemy import func as safunc
    from app.models.label import TaskLabel
    await _require_team_access(db, org_id, team_id, current_user)
    res = await db.execute(
        select(Task)
        .options(selectinload(Task.task_labels), selectinload(Task.assignee_links))
        .where(Task.id == task_id, Task.team_id == team_id)
    )
    src = res.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    max_pos = (await db.execute(
        select(safunc.max(Task.position)).where(Task.team_id == team_id, Task.status == src.status)
    )).scalar() or 0

    new_task = Task(
        team_id=team_id,
        title=f"{src.title} (copy)",
        description=src.description,
        status=src.status,
        priority=src.priority,
        due_date=src.due_date,
        assignee_id=src.assignee_id,
        created_by=current_user.id,
        position=max_pos + 1,
    )
    db.add(new_task)
    await db.flush()

    for tl in (src.task_labels or []):
        db.add(TaskLabel(task_id=new_task.id, label_id=tl.label_id))
    for al in (src.assignee_links or []):
        db.add(TaskAssignee(task_id=new_task.id, user_id=al.user_id))

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="task_created", entity_type="task", entity_id=new_task.id,
        team_id=team_id, metadata={"title": new_task.title, "duplicated_from": str(src.id)},
    )
    await db.commit()

    res = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks), selectinload(Task.comments),
            selectinload(Task.attachments), selectinload(Task.assignee),
            selectinload(Task.assignee_links).selectinload(TaskAssignee.user),
        ).where(Task.id == new_task.id)
    )
    return _task_to_response(res.scalar_one())


@router.patch("/{team_id}/tasks/{task_id}/briefs", response_model=TaskResponse)
async def set_team_task_briefs(
    org_id: str, team_id: str, task_id: str,
    data: dict,  # {"brief_ids": ["<uuid>", ...]}
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace the list of briefs linked to a team task.

    Validasi: brief yang ditautkan harus milik TIM yang sama dengan task
    (mencegah link silang antar tim)."""
    from app.models.label import TaskLabel
    from app.models.content_brief import ContentBrief
    await _require_team_access(db, org_id, team_id, current_user)

    res = await db.execute(select(Task).where(Task.id == task_id, Task.team_id == team_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    incoming = data.get("brief_ids") or []
    if not isinstance(incoming, list):
        raise HTTPException(status_code=400, detail="brief_ids harus berupa list")

    incoming_set = {str(i) for i in incoming if i}
    current_set = {str(x) for x in (task.linked_brief_ids or [])}
    added = incoming_set - current_set
    removed = current_set - incoming_set

    # Aturan: hanya pembuat brief yang boleh menautkan atau melepas
    # brief-nya ke task. Superuser bypass untuk moderasi.
    touched = added | removed
    if touched and not is_superuser(current_user):
        b_res = await db.execute(
            select(ContentBrief).where(ContentBrief.id.in_(list(touched)))
        )
        for b in b_res.scalars().all():
            if str(b.creator_id) != str(current_user.id):
                raise HTTPException(
                    status_code=403,
                    detail=f"Hanya pembuat brief '{b.title}' yang boleh menautkannya ke task",
                )

    # Validate all incoming IDs belong to this team (prevent cross-team links).
    if incoming_set:
        b_res = await db.execute(
            select(ContentBrief.id).where(
                ContentBrief.team_id == team_id,
                ContentBrief.id.in_(list(incoming_set)),
            )
        )
        valid_ids = {str(row[0]) for row in b_res.all()}
        # Preserve client-provided ordering for valid IDs.
        task.linked_brief_ids = [bid for bid in [str(x) for x in incoming] if bid in valid_ids]
    else:
        task.linked_brief_ids = []

    await db.commit()
    res = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks), selectinload(Task.comments),
            selectinload(Task.attachments), selectinload(Task.assignee),
            selectinload(Task.assignee_links).selectinload(TaskAssignee.user),
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
    await _require_team_access(db, org_id, team_id, current_user)
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
            selectinload(Task.attachments), selectinload(Task.assignee), selectinload(Task.assignee_links).selectinload(TaskAssignee.user),
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
    await _require_team_access(db, org_id, team_id, current_user)

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

    # Multiple assignees (preferred). Fall back to mirroring the single
    # assignee_id into the M2M so the multi-assignee UI shows it too.
    if data.assignee_ids is not None:
        await _sync_task_assignees(db, task, data.assignee_ids)
    elif data.assignee_id is not None:
        db.add(TaskAssignee(task_id=task.id, user_id=data.assignee_id))

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
            selectinload(Task.assignee), selectinload(Task.assignee_links).selectinload(TaskAssignee.user)
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
    await _require_team_access(db, org_id, team_id, current_user)

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
            selectinload(Task.assignee), selectinload(Task.assignee_links).selectinload(TaskAssignee.user)
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
    await _require_team_access(db, org_id, team_id, current_user)

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee), selectinload(Task.assignee_links).selectinload(TaskAssignee.user)
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
    await _require_team_access(db, org_id, team_id, current_user)

    result = await db.execute(select(Task).where(Task.id == task_id, Task.team_id == team_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    update_data = data.model_dump(exclude_unset=True)
    # assignee_ids isn't a Task column — handle it separately via the M2M table.
    assignee_ids = update_data.pop("assignee_ids", None)

    # Status/position + result_url + custom_properties bebas. Field lain
    # (incl. assignees) butuh creator/manager/owner atau edit grant.
    free_only = (
        set(update_data.keys()) <= {"status", "position", "result_url", "custom_properties"}
        and assignee_ids is None
    )
    if not free_only:
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

    if assignee_ids is not None:
        await _sync_task_assignees(db, task, assignee_ids)

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
            selectinload(Task.assignee), selectinload(Task.assignee_links).selectinload(TaskAssignee.user)
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
    await _require_team_access(db, org_id, team_id, current_user)

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
from fastapi import UploadFile, File, Query

@router.post("/{team_id}/chat/messages", response_model=dict)
async def send_team_message(
    org_id: str, team_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message to the team chat."""
    await _require_team_access(db, org_id, team_id, current_user)

    parent_id_raw = data.get("parent_id")
    msg = TeamMessage(
        team_id=team_id,
        user_id=current_user.id,
        content=data.get("content"),
        file_url=data.get("file_url"),
        file_name=data.get("file_name"),
        file_type=data.get("file_type"),
        parent_id=parent_id_raw,
        is_sticker=bool(data.get("is_sticker")),
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
        "is_sticker": msg.is_sticker,
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
        "is_sticker": msg.is_sticker,
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
    await _require_team_access(db, org_id, team_id, current_user)

    result = await db.execute(
        select(TeamMessage).where(TeamMessage.id == message_id, TeamMessage.user_id == current_user.id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan atau Anda tidak berhak mengeditnya")

    # Snapshot the OLD content+timestamp into history before overwriting.
    history = list(msg.edit_history or [])
    history.append({
        "content": msg.content,
        "edited_at": (msg.edited_at or msg.created_at).isoformat() if (msg.edited_at or msg.created_at) else None,
    })
    msg.edit_history = history
    msg.content = data.get("content")
    msg.edited_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)

    # Broadcast update — include edit_history so other clients can show the
    # "view past versions" popover without an extra round-trip.
    from app.sockets.manager import sio
    await sio.emit("message_edited", {
        "id": str(msg.id),
        "content": msg.content,
        "edited_at": msg.edited_at.isoformat(),
        "edit_history": msg.edit_history,
    }, room=f"team_{team_id}")

    return {
        "id": str(msg.id),
        "content": msg.content,
        "edited_at": msg.edited_at.isoformat(),
        "edit_history": msg.edit_history,
    }


@router.delete("/{team_id}/chat/messages/{message_id}")
async def delete_team_message(
    org_id: str, team_id: str, message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat message."""
    await _require_team_access(db, org_id, team_id, current_user)

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
    is_sticker: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to team chat."""
    await _require_team_access(db, org_id, team_id, current_user)

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
        file_type=file.content_type,
        is_sticker=bool(is_sticker),
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
        "is_sticker": msg.is_sticker,
        "created_at": msg.created_at.isoformat(),
        "user": {
            "name": current_user.name,
            "avatar_url": current_user.avatar_url,
            "tagline": current_user.tagline
        }
    }, room=f"team_{team_id}")

    return {"file_url": file_url, "is_sticker": msg.is_sticker}


@router.get("/{team_id}/chat/messages", response_model=List[dict])
async def list_team_messages(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List last 50 messages from team chat."""
    await _require_team_access(db, org_id, team_id, current_user)

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
            "is_sticker": m.is_sticker,
            "created_at": m.created_at.isoformat(),
            "edited_at": m.edited_at.isoformat() if m.edited_at else None,
            "edit_history": m.edit_history or [],
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
    await _require_team_access(db, org_id, team_id, current_user)

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
    await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    member = await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
            "reminder_minutes": e.reminder_minutes,
            "team_id": str(e.team_id) if e.team_id else None,
            "org_id": str(e.org_id) if e.org_id else None,
            "project_id": str(e.project_id) if e.project_id else None,
            "created_by": str(e.created_by),
            "creator": {"id": str(e.creator.id), "name": e.creator.name} if e.creator else None,
            "attendees": [
                {"user_id": str(a.user_id), "user": {"id": str(a.user_id), "name": a.user.name if a.user else "", "avatar_url": a.user.avatar_url if a.user else None}}
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    member = await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    member = await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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
    await _require_team_access(db, org_id, team_id, current_user)
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

    from app.services.notification import notify_user
    notified: set[str] = set()
    snippet = content[:60] + ("..." if len(content) > 60 else "")

    # Notify the announcement creator (skip self)
    if ann.creator_id and str(ann.creator_id) != str(current_user.id):
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
        notified.add(str(ann.creator_id))

    # Notify @mentions
    for uid in (data.get("mention_ids") or []):
        uid_s = str(uid)
        if not uid_s or uid_s == str(current_user.id) or uid_s in notified:
            continue
        await notify_user(
            db,
            user_id=uid_s,
            type="mention",
            content=f"{current_user.name} menyebut kamu di komentar pengumuman: {ann.title}",
            ref_id=str(announcement_id),
            org_id=str(org_id),
            url=f"/org/{org_id}/team/{team_id}/announcements",
        )
        notified.add(uid_s)

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
    member = await _require_team_access(db, org_id, team_id, current_user)
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


# ===================== Team board columns (custom kanban) =====================

class TeamColumnCreate(BaseModel):
    title: str


class TeamColumnUpdate(BaseModel):
    title: Optional[str] = None
    position: Optional[int] = None


class TeamColumnResponse(BaseModel):
    id: _UUID
    slug: str
    title: str
    position: int

    class Config:
        from_attributes = True


def _team_slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    return s or "col"


_DEFAULT_TEAM_COLUMNS = [
    ("todo", "To Do", 0),
    ("in_progress", "Dikerjakan", 1),
    ("pending", "Pending", 2),
    ("done", "Selesai", 3),
]


@router.get("/{team_id}/columns", response_model=List[TeamColumnResponse])
async def list_team_columns(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    result = await db.execute(
        select(TeamBoardColumn).where(TeamBoardColumn.team_id == team_id).order_by(TeamBoardColumn.position.asc())
    )
    cols = result.scalars().all()
    if not cols:
        for slug, title, pos in _DEFAULT_TEAM_COLUMNS:
            db.add(TeamBoardColumn(team_id=team_id, slug=slug, title=title, position=pos))
        await db.commit()
        result = await db.execute(
            select(TeamBoardColumn).where(TeamBoardColumn.team_id == team_id).order_by(TeamBoardColumn.position.asc())
        )
        cols = result.scalars().all()
    return cols


@router.post("/{team_id}/columns", response_model=TeamColumnResponse, status_code=status.HTTP_201_CREATED)
async def create_team_column(
    org_id: str, team_id: str, data: TeamColumnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Judul kolom wajib")
    base_slug = _team_slugify(title)
    suffix, n = "", 0
    while True:
        candidate = f"{base_slug}{suffix}"
        exists = await db.execute(
            select(TeamBoardColumn.id).where(
                TeamBoardColumn.team_id == team_id, TeamBoardColumn.slug == candidate
            )
        )
        if not exists.scalar():
            base_slug = candidate
            break
        n += 1
        suffix = f"_{n}"
    max_pos = await db.execute(
        select(func.coalesce(func.max(TeamBoardColumn.position), -1)).where(TeamBoardColumn.team_id == team_id)
    )
    col = TeamBoardColumn(team_id=team_id, slug=base_slug, title=title, position=(max_pos.scalar() or -1) + 1)
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return col


@router.patch("/{team_id}/columns/{column_id}", response_model=TeamColumnResponse)
async def update_team_column(
    org_id: str, team_id: str, column_id: str, data: TeamColumnUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    result = await db.execute(
        select(TeamBoardColumn).where(TeamBoardColumn.id == column_id, TeamBoardColumn.team_id == team_id)
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Kolom tidak ditemukan")
    if data.title is not None:
        t = data.title.strip()
        if not t:
            raise HTTPException(status_code=400, detail="Judul kolom wajib")
        col.title = t
    if data.position is not None:
        col.position = data.position
    await db.commit()
    await db.refresh(col)
    return col


@router.delete("/{team_id}/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team_column(
    org_id: str, team_id: str, column_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    count_res = await db.execute(
        select(func.count(TeamBoardColumn.id)).where(TeamBoardColumn.team_id == team_id)
    )
    if (count_res.scalar() or 0) <= 1:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus kolom terakhir")
    result = await db.execute(
        select(TeamBoardColumn).where(TeamBoardColumn.id == column_id, TeamBoardColumn.team_id == team_id)
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Kolom tidak ditemukan")
    # Move tasks in this column to the first remaining column so none orphan.
    first_res = await db.execute(
        select(TeamBoardColumn)
        .where(TeamBoardColumn.team_id == team_id, TeamBoardColumn.id != column_id)
        .order_by(TeamBoardColumn.position.asc()).limit(1)
    )
    first = first_res.scalar_one_or_none()
    if first:
        await db.execute(
            Task.__table__.update()
            .where(Task.team_id == team_id, Task.status == col.slug)
            .values(status=first.slug)
        )
    await db.delete(col)
    await db.commit()
    return None
