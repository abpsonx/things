"""Comment endpoints for tasks."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.task import Task
from app.models.comment import Comment
from app.schemas import CommentCreate, CommentResponse, UserResponse
from app.dependencies import get_current_user
from app.services import log_activity

router = APIRouter(prefix="/tasks/{task_id}/comments", tags=["Comments"])


@router.post("", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    task_id: str, data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    # Determine org_id and context
    org_id = None
    project_id = None
    team_id = None

    if task.project_id:
        result = await db.execute(select(Project).where(Project.id == task.project_id))
        project = result.scalar_one()
        org_id = project.org_id
        project_id = project.id
    elif task.team_id:
        from app.models.team import Team
        result = await db.execute(select(Team).where(Team.id == task.team_id))
        team = result.scalar_one()
        org_id = team.org_id
        team_id = team.id
    else:
        raise HTTPException(status_code=400, detail="Task tidak memiliki konteks Proyek atau Tim")

    comment = Comment(task_id=task_id, user_id=current_user.id, content=data.content)
    db.add(comment)

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="comment_added", entity_type="comment", entity_id=comment.id,
        project_id=project_id, team_id=team_id, metadata={"task_title": task.title},
    )

    from app.services.notification import notify_user
    notified: set[str] = set()

    # Notify task assignee if someone else comments
    if task.assignee_id and str(task.assignee_id) != str(current_user.id):
        await notify_user(
            db,
            user_id=str(task.assignee_id),
            type="comment_added",
            content=f"{current_user.name} mengomentari tugas kamu: {task.title}",
            ref_id=str(task.id),
            org_id=str(org_id)
        )
        notified.add(str(task.assignee_id))

    # Notify @mentions (skip diri sendiri dan duplikat dengan assignee notify).
    for uid in (data.mention_ids or []):
        uid_s = str(uid)
        if not uid_s or uid_s == str(current_user.id) or uid_s in notified:
            continue
        await notify_user(
            db,
            user_id=uid_s,
            type="mention",
            content=f"{current_user.name} menyebut kamu di komentar: {task.title}",
            ref_id=str(task.id),
            org_id=str(org_id),
        )
        notified.add(uid_s)

    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=comment.id, task_id=comment.task_id, user_id=comment.user_id,
        content=comment.content, created_at=comment.created_at,
        user=UserResponse.model_validate(current_user),
    )


@router.get("", response_model=List[CommentResponse])
async def list_comments(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.api.reactions import fetch_reactions_for

    result = await db.execute(
        select(Comment).options(selectinload(Comment.user))
        .where(Comment.task_id == task_id)
        .order_by(Comment.created_at.asc())
    )
    comments = result.scalars().all()
    reactions_map = await fetch_reactions_for(
        db, "comment", [c.id for c in comments], current_user.id,
    )
    return [
        CommentResponse(
            id=c.id, task_id=c.task_id, user_id=c.user_id,
            content=c.content, created_at=c.created_at,
            user=UserResponse.model_validate(c.user) if c.user else None,
            reactions=reactions_map.get(str(c.id), []),
        )
        for c in comments
    ]
