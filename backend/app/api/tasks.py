"""Task endpoints — CRUD, kanban board operations."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.models.organization import OrgMember
from app.models.project import Project
from app.models.task import Task, SubTask
from app.models.label import Label, TaskLabel
from app.schemas import (
    TaskCreate, TaskUpdate, TaskMoveRequest, TaskResponse, 
    LabelResponse, SubTaskCreate, SubTaskUpdate, SubTaskResponse
)
from app.dependencies import get_current_user
from app.services import log_activity

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["Tasks"])


async def _get_project(db, project_id):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    return project


def _task_to_response(task):
    labels = [LabelResponse(id=tl.label.id, name=tl.label.name, color=tl.label.color)
              for tl in (task.task_labels or []) if tl.label]
    resp = TaskResponse.model_validate(task)
    resp.labels = labels
    resp.comments_count = len(task.comments) if hasattr(task, 'comments') else 0
    resp.attachments_count = len(task.attachments) if hasattr(task, 'attachments') else 0
    return resp


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    project_id: str, data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project(db, project_id)
    # Auto position
    result = await db.execute(
        select(func.coalesce(func.max(Task.position), 0))
        .where(Task.project_id == project_id, Task.status == data.status)
    )
    max_pos = result.scalar()

    task = Task(
        project_id=project_id, title=data.title, description=data.description,
        status=data.status, priority=data.priority, assignee_id=data.assignee_id,
        created_by=current_user.id, due_date=data.due_date, position=max_pos + 1,
    )
    db.add(task)
    await db.flush()

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action="task_created", entity_type="task", entity_id=task.id,
        project_id=project_id, metadata={"title": data.title, "status": data.status},
    )
    await db.commit()

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee),
        )
        .where(Task.id == task.id)
    )
    task = result.scalar_one()

    # Best-effort: push to assignee's Google Calendar with reminders
    try:
        from app.services.google_calendar import push_task_event
        await push_task_event(task, db)
    except Exception as _gcal_e:
        print(f"[gcal] push_task_event on create failed: {_gcal_e}")

    resp = _task_to_response(task)

    # Broadcast creation
    from app.sockets.manager import sio
    await sio.emit("task_created", {"id": str(task.id)}, room=f"project_{project_id}")

    return resp


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    project_id: str, status_filter: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (select(Task)
             .options(
                 selectinload(Task.task_labels).selectinload(TaskLabel.label),
                 selectinload(Task.subtasks),
                 selectinload(Task.comments),
                 selectinload(Task.attachments)
             )
             .where(Task.project_id == project_id)
             .order_by(Task.position))
    if status_filter:
        query = query.where(Task.status == status_filter)
    result = await db.execute(query)
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    project_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments)
        )
        .where(Task.id == task_id, Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")
    return _task_to_response(task)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    project_id: str, task_id: str, data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project(db, project_id)
    result = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    update_data = data.model_dump(exclude_unset=True)
    old_status = task.status
    
    for key, value in update_data.items():
        setattr(task, key, value)

    action = "task_moved" if "status" in update_data and update_data["status"] != old_status else "task_updated"
    meta = update_data.copy()
    if action == "task_moved":
        meta["old_status"] = old_status

    import uuid as _uuid
    for k, v in meta.items():
        if hasattr(v, "isoformat"):
            meta[k] = v.isoformat()
        elif isinstance(v, _uuid.UUID):
            meta[k] = str(v)

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action=action, entity_type="task", entity_id=task.id,
        project_id=project_id, metadata=meta,
    )

    if "assignee_id" in update_data and update_data["assignee_id"] and str(update_data["assignee_id"]) != str(current_user.id):
        from app.services.notification import notify_user
        await notify_user(
            db, 
            user_id=str(update_data["assignee_id"]),
            type="task_assigned",
            content=f"{current_user.name} memberikan kamu tugas: {task.title}",
            ref_id=str(task.id),
            org_id=str(project.org_id)
        )

    await db.commit()

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee),
        )
        .where(Task.id == task_id)
    )
    task = result.scalar_one()

    # Mirror change to Google Calendar (best-effort)
    try:
        from app.services.google_calendar import push_task_event
        await push_task_event(task, db)
    except Exception as _gcal_e:
        print(f"[gcal] push_task_event on update failed: {_gcal_e}")

    return _task_to_response(task)


@router.patch("/{task_id}/move", response_model=TaskResponse)
async def move_task(
    project_id: str, task_id: str, data: TaskMoveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project(db, project_id)
    result = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    old_status = task.status
    task.status = data.status
    task.position = data.position

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action="task_moved", entity_type="task", entity_id=task.id,
        project_id=project_id,
        metadata={"old_status": old_status, "new_status": data.status, "position": data.position},
    )
    await db.commit()

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee),
        )
        .where(Task.id == task_id)
    )
    task = result.scalar_one()

    # Status flip done ↔ active needs to sync the Google event too
    try:
        from app.services.google_calendar import push_task_event
        await push_task_event(task, db)
    except Exception as _gcal_e:
        print(f"[gcal] push_task_event on move failed: {_gcal_e}")

    resp = _task_to_response(task)

    from app.sockets.manager import sio
    await sio.emit("task_moved", {
        "id": task_id,
        "status": data.status,
        "position": data.position
    }, room=f"project_{project_id}")
    
    return resp


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    project_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project(db, project_id)
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.id == task_id, Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    # Best-effort: remove the matching Google Calendar event before
    # tearing down the row so we don't leave orphaned events.
    try:
        from app.services.google_calendar import delete_task_event
        await delete_task_event(task, db)
    except Exception as _gcal_e:
        print(f"[gcal] delete_task_event failed: {_gcal_e}")

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action="task_deleted", entity_type="task", entity_id=task.id,
        project_id=project_id, metadata={"title": task.title},
    )

    from app.sockets.manager import sio
    await sio.emit("task_deleted", {"id": task_id}, room=f"project_{project_id}")

    await db.delete(task)
    await db.commit()
    return None


# ============ SubTask Endpoints ============

@router.post("/{task_id}/subtasks", response_model=SubTaskResponse)
async def create_subtask(
    project_id: str, task_id: str, data: SubTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project(db, project_id)
    subtask = SubTask(task_id=task_id, title=data.title)
    db.add(subtask)
    await db.commit()
    await db.refresh(subtask)
    return subtask


@router.put("/{task_id}/subtasks/{subtask_id}", response_model=SubTaskResponse)
async def update_subtask(
    project_id: str, task_id: str, subtask_id: str, data: SubTaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SubTask).where(SubTask.id == subtask_id, SubTask.task_id == task_id))
    subtask = result.scalar_one_or_none()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask tidak ditemukan")

    if data.title is not None: subtask.title = data.title
    if data.is_done is not None: subtask.is_done = data.is_done

    await db.commit()
    await db.refresh(subtask)
    return subtask


@router.delete("/{task_id}/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    project_id: str, task_id: str, subtask_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SubTask).where(SubTask.id == subtask_id, SubTask.task_id == task_id))
    subtask = result.scalar_one_or_none()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask tidak ditemukan")

    await db.delete(subtask)
    await db.commit()
    return None
