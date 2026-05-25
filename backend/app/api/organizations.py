"""Organization (Workspace) endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime, timezone
from app.core.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.activity_log import ActivityLog
from app.schemas import OrgCreate, OrgResponse, OrgDetailResponse, OrgMemberResponse, UserResponse, InviteMemberRequest, ActivityLogResponse
from app.dependencies import get_current_user
from app.services import log_activity
from app.core.permissions import is_superuser

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrgCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new organization (workspace)."""
    org = Organization(name=data.name, owner_id=current_user.id)
    db.add(org)
    await db.flush()

    # Add creator as owner member
    member = OrgMember(org_id=org.id, user_id=current_user.id, role="owner")
    db.add(member)

    # Auto-add every developer as an owner of this org
    dev_result = await db.execute(
        select(User.id).where(User.role == "developer", User.id != current_user.id)
    )
    for dev_id in dev_result.scalars().all():
        db.add(OrgMember(org_id=org.id, user_id=dev_id, role="owner"))

    await log_activity(
        db, org_id=org.id, user_id=current_user.id,
        action="org_created", entity_type="organization", entity_id=org.id,
        metadata={"name": data.name},
    )

    await db.commit()
    await db.refresh(org)
    return OrgResponse.model_validate(org)


async def _load_org_or_404(db: AsyncSession, org_id: str) -> Organization:
    res = await db.execute(select(Organization).where(Organization.id == org_id))
    org = res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Workspace tidak ditemukan")
    return org


async def _is_org_owner(db: AsyncSession, org: Organization, user: User) -> bool:
    if is_superuser(user) or str(org.owner_id) == str(user.id):
        return True
    res = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org.id, OrgMember.user_id == user.id, OrgMember.role == "owner"
        )
    )
    return res.scalar_one_or_none() is not None


@router.patch("/{org_id}", response_model=OrgResponse)
async def update_organization(
    org_id: str,
    data: OrgCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename a workspace (owner or developer only)."""
    org = await _load_org_or_404(db, org_id)
    if not await _is_org_owner(db, org, current_user):
        raise HTTPException(status_code=403, detail="Hanya owner workspace yang bisa mengubah")
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama workspace tidak boleh kosong")
    org.name = name
    await log_activity(
        db, org_id=org.id, user_id=current_user.id,
        action="org_updated", entity_type="organization", entity_id=org.id,
        metadata={"name": name},
    )
    await db.commit()
    await db.refresh(org)
    return OrgResponse.model_validate(org)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a workspace and everything in it — only the creator (or a developer)."""
    org = await _load_org_or_404(db, org_id)
    if str(org.owner_id) != str(current_user.id) and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat workspace yang bisa menghapusnya")
    # Raw delete so Postgres ON DELETE CASCADE clears all child rows
    # (members, projects, tasks, channels, social accounts, …) in one go.
    await db.execute(text("DELETE FROM organizations WHERE id = :id"), {"id": str(org_id)})
    await db.commit()
    return None


@router.get("", response_model=List[OrgResponse])
async def list_organizations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all organizations the current user belongs to.

    Developers see every organization in the system.
    """
    if is_superuser(current_user):
        result = await db.execute(
            select(Organization).order_by(Organization.created_at.desc())
        )
    else:
        result = await db.execute(
            select(Organization)
            .join(OrgMember, OrgMember.org_id == Organization.id)
            .where(OrgMember.user_id == current_user.id)
            .order_by(Organization.created_at.desc())
        )
    orgs = result.scalars().all()
    return [OrgResponse.model_validate(o) for o in orgs]


@router.get("/{org_id}", response_model=OrgDetailResponse)
async def get_organization(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get organization detail with members."""
    result = await db.execute(
        select(Organization)
        .options(selectinload(Organization.members).selectinload(OrgMember.user))
        .where(Organization.id == org_id)
    )
    org = result.scalar_one_or_none()

    if not org:
        raise HTTPException(status_code=404, detail="Organization tidak ditemukan")

    # Check membership (developers bypass — they have global access)
    is_member = any(m.user_id == current_user.id for m in org.members)
    if not is_member and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Anda bukan member organization ini")

    return OrgDetailResponse(
        id=org.id,
        name=org.name,
        owner_id=org.owner_id,
        created_at=org.created_at,
        members=[
            OrgMemberResponse(
                id=m.id,
                user_id=m.user_id,
                role=m.role,
                joined_at=m.joined_at,
                user=UserResponse.model_validate(m.user) if m.user else None,
            )
            for m in org.members
        ],
    )


@router.post("/{org_id}/invite", status_code=status.HTTP_201_CREATED)
async def invite_member(
    org_id: str,
    data: InviteMemberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Invite a user to the organization (by existing user or pending invite)."""
    from app.models.invitation import Invitation

    # Check if current user is owner/manager (developers bypass)
    if not is_superuser(current_user):
        result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.user_id == current_user.id,
                OrgMember.role.in_(["owner", "manager"]),
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Hanya owner/manager yang bisa invite member")

    # Find user by email
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if user:
        # User exists, add directly to OrgMember if not already there
        result = await db.execute(
            select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user.id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="User sudah menjadi member")

        member = OrgMember(org_id=org_id, user_id=user.id, role=data.role)
        db.add(member)

        # Notify the invited user
        from app.services.notification import notify_user
        from app.models.organization import Organization as Org
        org_res = await db.execute(select(Org).where(Org.id == org_id))
        org_row = org_res.scalar_one_or_none()
        org_name = org_row.name if org_row else "workspace"
        await notify_user(
            db,
            user_id=str(user.id),
            type="org_invite",
            title="Undangan Workspace",
            content=f"{current_user.name} mengundang kamu ke {org_name} sebagai {data.role}",
            ref_id=str(org_id),
            org_id=str(org_id),
            url=f"/org/{org_id}",
        )
    else:
        # Check if invitation already exists (we'll just update it or create new)
        inv_result = await db.execute(
            select(Invitation).where(Invitation.org_id == org_id, Invitation.email == data.email)
        )
        existing_inv = inv_result.scalar_one_or_none()
        
        if existing_inv:
            # Update existing invitation timestamp
            existing_inv.created_at = datetime.now(timezone.utc)
            existing_inv.role = data.role
        else:
            # Create new invitation
            invitation = Invitation(org_id=org_id, email=data.email, role=data.role, invited_by=current_user.id)
            db.add(invitation)
        
        # Send Email
        from app.services.email import send_invitation_email
        from app.models.organization import Organization
        from app.models.system_setting import SystemSetting
        
        org_res = await db.execute(select(Organization).where(Organization.id == org_id))
        org = org_res.scalar_one()
        
        # Get registration code for staff
        setting_res = await db.execute(
            select(SystemSetting).where(SystemSetting.key == "registration_code_staff")
        )
        setting = setting_res.scalar_one_or_none()
        reg_code = setting.value if setting else "THINGS-STAFF"
        
        await send_invitation_email(data.email, org.name, current_user.name, reg_code)

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="member_invited", entity_type="member", entity_id=user.id if user else None,
        metadata={"email": data.email, "role": data.role, "is_pending": not bool(user)},
    )

    await db.commit()
    return {"message": f"Berhasil mengundang {data.email}", "is_pending": not bool(user)}


@router.get("/{org_id}/activity")
async def list_activity_logs(
    org_id: str,
    limit: int = 30,
    offset: int = 0,
    start_date: str | None = None,
    end_date: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated activity logs, optionally filtered by date range (YYYY-MM-DD)."""
    from datetime import datetime, timedelta
    from sqlalchemy import func as safunc

    conds = [ActivityLog.org_id == org_id]
    if start_date:
        try:
            conds.append(ActivityLog.created_at >= datetime.fromisoformat(start_date))
        except ValueError:
            pass
    if end_date:
        try:
            conds.append(ActivityLog.created_at < datetime.fromisoformat(end_date) + timedelta(days=1))
        except ValueError:
            pass

    total = (await db.execute(
        select(safunc.count()).select_from(ActivityLog).where(*conds)
    )).scalar() or 0

    result = await db.execute(
        select(ActivityLog)
        .options(selectinload(ActivityLog.user))
        .where(*conds)
        .order_by(ActivityLog.created_at.desc())
        .limit(min(max(limit, 1), 100))
        .offset(max(offset, 0))
    )
    logs = result.scalars().all()
    return {
        "items": [ActivityLogResponse.model_validate(log) for log in logs],
        "total": total,
    }


@router.get("/{org_id}/activity/export")
async def export_activity_csv(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export activity log as CSV. Owner/manager only."""
    from fastapi.responses import StreamingResponse
    import csv, io, json

    if not is_superuser(current_user):
        m = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.user_id == current_user.id,
                OrgMember.role.in_(["owner", "manager"]),
            )
        )
        if not m.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Hanya owner/manager yang bisa export")

    result = await db.execute(
        select(ActivityLog)
        .options(selectinload(ActivityLog.user))
        .where(ActivityLog.org_id == org_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(10000)
    )
    logs = result.scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "timestamp", "user", "user_email", "action",
        "entity_type", "entity_id", "project_id", "team_id", "metadata",
    ])
    for log in logs:
        writer.writerow([
            log.created_at.isoformat() if log.created_at else "",
            log.user.name if log.user else "",
            log.user.email if log.user else "",
            log.action or "",
            log.entity_type or "",
            str(log.entity_id) if log.entity_id else "",
            str(log.project_id) if log.project_id else "",
            str(log.team_id) if log.team_id else "",
            json.dumps(log.metadata_) if log.metadata_ else "",
        ])

    buf.seek(0)
    filename = f"activity-{org_id}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.patch("/{org_id}/members/{member_id}")
async def update_member_role(
    org_id: str,
    member_id: str,
    data: dict, # {"role": "manager"}
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a member's role (owner/manager only)."""
    # Check permissions (developers bypass)
    dev_bypass = is_superuser(current_user)
    admin = None
    if not dev_bypass:
        result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.user_id == current_user.id,
                OrgMember.role.in_(["owner", "manager"]),
            )
        )
        admin = result.scalar_one_or_none()
        if not admin:
            raise HTTPException(status_code=403, detail="Hanya owner/manager yang bisa edit role")

    # Get target member
    result = await db.execute(select(OrgMember).where(OrgMember.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member tidak ditemukan")

    if member.role == "owner" and not dev_bypass and admin.role != "owner":
        raise HTTPException(status_code=403, detail="Hanya owner yang bisa edit owner lain")

    # The workspace creator's role can't be changed (except by themselves/developer).
    org = await _load_org_or_404(db, org_id)
    if str(member.user_id) == str(org.owner_id) and str(current_user.id) != str(org.owner_id) and not dev_bypass:
        raise HTTPException(status_code=403, detail="Role pembuat workspace tidak bisa diubah")

    member.role = data.get("role", member.role)
    await db.commit()
    return {"message": "Role berhasil diperbarui", "role": member.role}


@router.delete("/{org_id}/members/{member_id}")
async def remove_member(
    org_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from organization (owner/manager only)."""
    # Check permissions (developers bypass)
    dev_bypass = is_superuser(current_user)
    admin = None
    if not dev_bypass:
        result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.user_id == current_user.id,
                OrgMember.role.in_(["owner", "manager"]),
            )
        )
        admin = result.scalar_one_or_none()
        if not admin:
            raise HTTPException(status_code=403, detail="Hanya owner/manager yang bisa hapus member")

    # Get target member
    result = await db.execute(select(OrgMember).where(OrgMember.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member tidak ditemukan")

    if member.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Anda tidak bisa menghapus diri sendiri dari sini")

    if member.role == "owner" and not dev_bypass and admin.role != "owner":
        raise HTTPException(status_code=403, detail="Hanya owner yang bisa hapus owner lain")

    # The workspace creator can't be removed (except by a developer).
    org = await _load_org_or_404(db, org_id)
    if str(member.user_id) == str(org.owner_id) and not dev_bypass:
        raise HTTPException(status_code=403, detail="Pembuat workspace tidak bisa dikeluarkan")

    await db.delete(member)
    await db.commit()
    return {"message": "Member berhasil dihapus"}


def _public_url(path: str) -> str:
    """Normalize a stored file path into a browser-resolvable URL.

    Task attachments save the bare on-disk path ("uploads/foo.pptx") while
    chat / DM uploads already include the api prefix ("/api/uploads/..."),
    so blindly prepending BACKEND_URL produced double-/api links and 404s.
    """
    if not path:
        return path
    if path.startswith(("http://", "https://")):
        return path
    if path.startswith("/"):
        # already an absolute site path (e.g. /api/uploads/foo.pptx)
        return path
    return f"/api/{path.lstrip('/')}"


def _disk_size(path: str) -> int | None:
    """Best-effort file size lookup for paths stored as relative (e.g. uploads/...).

    Handles every storage style we've used historically:
      - "uploads/foo.pptx"          (task attachments)
      - "/api/uploads/foo.pptx"     (team chat uploads — written by team upload)
      - "/uploads/foo.pptx"         (older code paths)
      - absolute "http(s)://…"      (skipped — not on local disk)
    """
    import os
    if not path or path.startswith("http"):
        return None
    # Strip API / leading slash prefixes so we hit /app/uploads/...
    normalized = path
    for prefix in ("/api/", "api/"):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
            break
    normalized = normalized.lstrip("/")
    candidates = [
        normalized,
        f"/app/{normalized}",
        os.path.join(os.getcwd(), normalized),
        path,                       # original, just in case
        f"/app/{path.lstrip('/')}", # absolute mount
    ]
    seen: set[str] = set()
    for p in candidates:
        if p in seen:
            continue
        seen.add(p)
        try:
            if os.path.isfile(p):
                return os.path.getsize(p)
        except Exception:
            continue
    return None


@router.get("/{org_id}/files")
async def list_organization_files(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List attachments in an org that the current user is allowed to see.

    Access is scoped to membership: Task/Chat files only from projects/teams
    the user belongs to; DM files only from conversations they're part of.
    Developers (superusers) see everything.
    """
    from app.models.attachment import Attachment
    from app.models.task import Task
    from app.models.project import Project, ProjectMember
    from app.models.team import Team, TeamMember
    from app.models.channel import Message, Channel
    from app.models.dm import DMMessage, DMChannel

    # Must be a member of this workspace.
    mem = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
    )
    superuser = is_superuser(current_user)
    if not mem.scalar_one_or_none() and not superuser:
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")

    # Projects & teams in this org the user belongs to (superuser → all).
    proj_ids: set[str] = set()
    team_ids: set[str] = set()
    if not superuser:
        pr = await db.execute(
            select(ProjectMember.project_id)
            .join(Project, Project.id == ProjectMember.project_id)
            .where(ProjectMember.user_id == current_user.id, Project.org_id == org_id)
        )
        proj_ids = {str(x) for x in pr.scalars().all()}
        tr = await db.execute(
            select(TeamMember.team_id)
            .join(Team, Team.id == TeamMember.team_id)
            .where(TeamMember.user_id == current_user.id, Team.org_id == org_id)
        )
        team_ids = {str(x) for x in tr.scalars().all()}

    def can_see_project(p) -> bool:
        return superuser or (p is not None and str(p.id) in proj_ids)

    def can_see_team(t) -> bool:
        return superuser or (t is not None and str(t.id) in team_ids)

    all_files = []

    # 1. Task attachments — only tasks in projects/teams the user is in.
    result_task = await db.execute(
        select(Attachment)
        .options(
            selectinload(Attachment.uploader),
            selectinload(Attachment.task).selectinload(Task.project),
            selectinload(Attachment.task).selectinload(Task.team),
        )
    )
    for a in result_task.scalars().all():
        if not a.task:
            continue
        proj = a.task.project
        team = a.task.team
        in_org = (proj and str(proj.org_id) == str(org_id)) or (team and str(team.org_id) == str(org_id))
        if not in_org:
            continue
        if not (can_see_project(proj) or can_see_team(team)):
            continue
        size = a.file_size if a.file_size else _disk_size(a.file_path)
        all_files.append({
            "id": str(a.id),
            "source": "Task",
            "file_name": a.file_name,
            "file_path": _public_url(a.file_path),
            "file_size": size,
            "created_at": a.created_at,
            "uploader": {"id": str(a.uploader.id), "name": a.uploader.name, "avatar_url": a.uploader.avatar_url},
            "context": {"type": "Task", "name": a.task.title, "parent": proj.name if proj else (team.name if team else "")}
        })

    # 2. Channel chat attachments — only project channels the user is in.
    result_msg = await db.execute(
        select(Message)
        .options(selectinload(Message.user), selectinload(Message.channel).selectinload(Channel.project))
        .where(Message.attachment_url != None)
    )
    for m in result_msg.scalars().all():
        if not (m.channel and m.channel.project and str(m.channel.project.org_id) == str(org_id)):
            continue
        if not can_see_project(m.channel.project):
            continue
        all_files.append({
            "id": str(m.id),
            "source": "Chat",
            "file_name": m.attachment_name or "Unnamed File",
            "file_path": _public_url(m.attachment_url),
            "file_size": _disk_size(m.attachment_url),
            "created_at": m.created_at,
            "uploader": {"id": str(m.user.id), "name": m.user.name, "avatar_url": m.user.avatar_url},
            "context": {"type": "Chat", "name": m.channel.name, "parent": m.channel.project.name}
        })

    # 3. DM attachments — only conversations the user is part of.
    result_dm = await db.execute(
        select(DMMessage)
        .options(selectinload(DMMessage.user), selectinload(DMMessage.dm_channel))
        .where(DMMessage.attachment_url != None)
    )
    me = str(current_user.id)
    for dm in result_dm.scalars().all():
        ch = dm.dm_channel
        if not (ch and str(ch.org_id) == str(org_id)):
            continue
        if not (superuser or me == str(ch.user1_id) or me == str(ch.user2_id)):
            continue
        all_files.append({
            "id": str(dm.id),
            "source": "DM",
            "file_name": dm.attachment_name or "Unnamed File",
            "file_path": _public_url(dm.attachment_url),
            "file_size": _disk_size(dm.attachment_url),
            "created_at": dm.created_at,
            "uploader": {"id": str(dm.user.id), "name": dm.user.name, "avatar_url": dm.user.avatar_url},
            "context": {"type": "DM", "name": "Private Chat", "parent": "DM"}
        })

    all_files.sort(key=lambda x: x["created_at"], reverse=True)
    return all_files
