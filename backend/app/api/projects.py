"""Project endpoints — CRUD and member management."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.organization import OrgMember
from app.models.project import Project, ProjectMember
from app.models.activity_log import ActivityLog
from app.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    ProjectMemberResponse, UserResponse, InviteMemberRequest,
    ActivityLogResponse
)
from app.dependencies import get_current_user
from app.services import log_activity
from app.core.permissions import SUPERUSER_ROLES

router = APIRouter(prefix="/organizations/{org_id}/projects", tags=["Projects"])


async def _check_org_membership(db: AsyncSession, org_id: str, user_id) -> OrgMember:
    """Verify user is a member of the organization.

    Superusers (admin/developer) bypass the check and receive a synthetic
    owner membership so downstream role guards pass.
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


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    org_id: str,
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new project in an organization."""
    await _check_org_membership(db, org_id, current_user.id)

    project = Project(
        org_id=org_id,
        name=data.name,
        description=data.description,
        created_by=current_user.id,
    )
    db.add(project)
    await db.flush()

    # Add creator as project manager
    pm = ProjectMember(project_id=project.id, user_id=current_user.id, role="manager")
    db.add(pm)

    # Create default channel
    from app.models.channel import Channel
    general_channel = Channel(project_id=project.id, name="general")
    db.add(general_channel)

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="project_created", entity_type="project", entity_id=project.id,
        project_id=project.id, metadata={"name": data.name},
    )

    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all projects in an organization that the user has access to."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(Project)
        .where(Project.org_id == org_id)
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [ProjectResponse.model_validate(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    org_id: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get project detail."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == org_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    return ProjectResponse.model_validate(project)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    org_id: str,
    project_id: str,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update project details."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == org_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="project_updated", entity_type="project", entity_id=project.id,
        project_id=project.id, metadata=update_data,
    )

    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    org_id: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hapus proyek — strict: hanya Super User / Developer atau pembuat proyek
    itu sendiri. Manager / Admin / Member workspace TIDAK boleh."""
    from app.core.permissions import is_superuser
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == org_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    is_creator = str(project.created_by) == str(current_user.id)
    if not (is_superuser(current_user) or is_creator):
        raise HTTPException(
            status_code=403,
            detail="Hanya pembuat proyek atau Super User yang bisa menghapus",
        )

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="project_deleted", entity_type="project", entity_id=project.id,
        project_id=project.id, metadata={"name": project.name},
    )

    await db.delete(project)
    await db.commit()



@router.get("/{project_id}/members", response_model=List[ProjectMemberResponse])
async def list_project_members(
    org_id: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List members of a project."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project_id)
    )
    members = result.scalars().all()
    return [
        ProjectMemberResponse(
            id=m.id,
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at,
            user=UserResponse.model_validate(m.user) if m.user else None,
        )
        for m in members
    ]


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
async def add_project_member(
    org_id: str,
    project_id: str,
    data: InviteMemberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a member to a project."""
    await _check_org_membership(db, org_id, current_user.id)

    # Find user
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    # Check if already a project member
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User sudah menjadi member project")

    pm = ProjectMember(project_id=project_id, user_id=user.id, role=data.role)
    db.add(pm)

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="member_added", entity_type="member", entity_id=user.id,
        project_id=project_id, metadata={"email": data.email, "role": data.role},
    )

    # Notify the added member
    from app.services.notification import notify_user
    proj_res = await db.execute(select(Project).where(Project.id == project_id))
    proj_row = proj_res.scalar_one_or_none()
    proj_name = proj_row.name if proj_row else "project"
    await notify_user(
        db,
        user_id=str(user.id),
        type="project_invite",
        title="Diundang ke Project",
        content=f"{current_user.name} menambahkan kamu ke project {proj_name}",
        ref_id=str(project_id),
        org_id=str(org_id),
        url=f"/org/{org_id}/project/{project_id}/chat",
    )

    await db.commit()
    return {"message": f"Berhasil menambahkan {data.email} ke project"}


@router.delete("/{project_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    org_id: str,
    project_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from a project."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.id == member_id,
            ProjectMember.project_id == project_id,
        )
    )
    pm = result.scalar_one_or_none()
    if not pm:
        raise HTTPException(status_code=404, detail="Member tidak ditemukan di project")

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="member_removed", entity_type="member", entity_id=pm.user_id,
        project_id=project_id, metadata={"user_id": str(pm.user_id)},
    )

    await db.delete(pm)
    await db.commit()
    return None


@router.get("/{project_id}/activity", response_model=List[ActivityLogResponse])
async def list_project_activity_logs(
    org_id: str,
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List activity logs for a specific project."""
    await _check_org_membership(db, org_id, current_user.id)

    result = await db.execute(
        select(ActivityLog)
        .options(selectinload(ActivityLog.user))
        .where(ActivityLog.project_id == project_id, ActivityLog.org_id == org_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(100)
    )
    logs = result.scalars().all()
    return [ActivityLogResponse.model_validate(log) for log in logs]

