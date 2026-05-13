from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.task import Task
from app.models.channel import Message, Channel
from app.schemas import ProjectResponse, TaskResponse

router = APIRouter(prefix="/search", tags=["Search"])

@router.get("")
async def global_search(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Global search across projects, tasks, and messages."""
    
    # 1. Search Projects (Using ILIKE because it's just names usually)
    project_query = (
        select(Project)
        .where(
            or_(
                Project.name.ilike(f"%{q}%"),
                Project.description.ilike(f"%{q}%")
            )
        )
        .limit(5)
    )
    project_result = await db.execute(project_query)
    projects = project_result.scalars().all()

    # 2. Search Tasks (Using Full-Text Search)
    tsquery = func.plainto_tsquery('indonesian', q)
    task_vector = func.to_tsvector('indonesian', func.coalesce(Task.title, '') + ' ' + func.coalesce(Task.description, ''))
    
    task_query = (
        select(Task)
        .options(selectinload(Task.project))
        .where(task_vector.op('@@')(tsquery))
        .limit(10)
    )
    task_result = await db.execute(task_query)
    tasks = task_result.scalars().all()

    # 3. Search Messages (Using Full-Text Search)
    msg_vector = func.to_tsvector('indonesian', func.coalesce(Message.content, ''))
    message_query = (
        select(Message)
        .options(selectinload(Message.channel).selectinload(Channel.project), selectinload(Message.user))
        .where(msg_vector.op('@@')(tsquery))
        .order_by(Message.created_at.desc())
        .limit(10)
    )
    message_result = await db.execute(message_query)
    messages = message_result.scalars().all()

    return {
        "projects": [
            {
                "id": str(p.id),
                "name": p.name,
                "org_id": str(p.org_id)
            } for p in projects
        ],
        "tasks": [
            {
                "id": str(t.id),
                "title": t.title,
                "project_id": str(t.project_id),
                "org_id": str(t.project.org_id) if t.project else None,
                "status": t.status
            } for t in tasks
        ],
        "messages": [
            {
                "id": str(m.id),
                "content": m.content,
                "channel_id": str(m.channel_id),
                "project_id": str(m.channel.project_id) if m.channel else None,
                "org_id": str(m.channel.project.org_id) if m.channel and m.channel.project else None,
                "user": m.user.name,
                "created_at": m.created_at.isoformat()
            } for m in messages
        ]
    }
