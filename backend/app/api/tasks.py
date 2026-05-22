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
from app.models.task import Task, SubTask, TaskDependency
from app.models.label import Label, TaskLabel
from app.schemas import (
    TaskCreate, TaskUpdate, TaskMoveRequest, TaskResponse, 
    LabelResponse, SubTaskCreate, SubTaskUpdate, SubTaskResponse
)
from app.dependencies import get_current_user
from app.services import log_activity

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["Tasks"])


def _shift_due_date(due, recurrence):
    """Shift a datetime by one recurrence interval. Returns None if no rule or no due."""
    if not due or not recurrence:
        return None
    from datetime import timedelta
    if recurrence == "daily":
        return due + timedelta(days=1)
    if recurrence == "weekly":
        return due + timedelta(weeks=1)
    if recurrence == "monthly":
        # Naive month shift — clamp to last day of the next month if needed
        month = due.month + 1
        year = due.year + (1 if month > 12 else 0)
        month = ((month - 1) % 12) + 1
        # Try same day; fall back if invalid
        import calendar
        day = min(due.day, calendar.monthrange(year, month)[1])
        return due.replace(year=year, month=month, day=day)
    return None


async def _maybe_clone_recurring(db, task, project_id, current_user_id):
    """If task is recurring, create a fresh copy with shifted due date. Best-effort."""
    if not task.recurrence:
        return
    next_due = _shift_due_date(task.due_date, task.recurrence)
    result = await db.execute(
        select(func.coalesce(func.max(Task.position), 0))
        .where(Task.project_id == project_id, Task.status == "todo")
    )
    max_pos = result.scalar() or 0
    clone = Task(
        project_id=task.project_id,
        team_id=task.team_id,
        title=task.title,
        description=task.description,
        status="todo",
        priority=task.priority,
        assignee_id=task.assignee_id,
        created_by=current_user_id,
        due_date=next_due,
        position=max_pos + 1,
        recurrence=task.recurrence,
    )
    db.add(clone)
    await db.flush()


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


def _dep_brief(t):
    if not t:
        return None
    return {"id": str(t.id), "title": t.title, "status": t.status}


@router.get("/{task_id}/dependencies")
async def list_dependencies(
    project_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List blocks + blocked_by tasks for the given task."""
    blocks_res = await db.execute(
        select(TaskDependency)
        .options(selectinload(TaskDependency.blocked))
        .where(TaskDependency.blocker_id == task_id)
    )
    blocked_by_res = await db.execute(
        select(TaskDependency)
        .options(selectinload(TaskDependency.blocker))
        .where(TaskDependency.blocked_id == task_id)
    )
    return {
        "blocks": [_dep_brief(d.blocked) for d in blocks_res.scalars().all() if d.blocked],
        "blocked_by": [_dep_brief(d.blocker) for d in blocked_by_res.scalars().all() if d.blocker],
    }


@router.post("/{task_id}/dependencies")
async def add_dependency(
    project_id: str, task_id: str, data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a dependency. Body: { other_id: "<uuid>", type: "blocks" | "blocked_by" }."""
    other_id = data.get("other_id")
    dep_type = data.get("type", "blocks")
    if not other_id:
        raise HTTPException(status_code=400, detail="other_id wajib")
    if str(other_id) == str(task_id):
        raise HTTPException(status_code=400, detail="Task tidak bisa bergantung pada dirinya sendiri")

    # Verify both tasks exist and live in the same project
    res = await db.execute(
        select(Task).where(Task.id.in_([task_id, other_id]), Task.project_id == project_id)
    )
    tasks = {str(t.id): t for t in res.scalars().all()}
    if str(task_id) not in tasks or str(other_id) not in tasks:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan di project ini")

    if dep_type == "blocks":
        blocker_id, blocked_id = task_id, other_id
    elif dep_type == "blocked_by":
        blocker_id, blocked_id = other_id, task_id
    else:
        raise HTTPException(status_code=400, detail="type harus 'blocks' atau 'blocked_by'")

    # Reject if edge already exists
    existing = await db.execute(
        select(TaskDependency).where(
            TaskDependency.blocker_id == blocker_id,
            TaskDependency.blocked_id == blocked_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Dependency sudah ada")

    dep = TaskDependency(blocker_id=blocker_id, blocked_id=blocked_id)
    db.add(dep)
    await db.commit()
    return {"id": str(dep.id)}


@router.delete("/{task_id}/dependencies/{other_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_dependency(
    project_id: str, task_id: str, other_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a dependency edge in either direction."""
    res = await db.execute(
        select(TaskDependency).where(
            ((TaskDependency.blocker_id == task_id) & (TaskDependency.blocked_id == other_id))
            | ((TaskDependency.blocker_id == other_id) & (TaskDependency.blocked_id == task_id))
        )
    )
    deps = res.scalars().all()
    if not deps:
        raise HTTPException(status_code=404, detail="Dependency tidak ditemukan")
    for d in deps:
        await db.delete(d)
    await db.commit()
    return None


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
    project_id: str, status_filter: str = None, include_archived: bool = False,
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
    if not include_archived:
        query = query.where(Task.archived_at.is_(None))
    result = await db.execute(query)
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


@router.get("/archived", response_model=List[TaskResponse])
async def list_archived_tasks(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archived tasks only — used by the "Arsip" view on the board."""
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee),
        )
        .where(Task.project_id == project_id, Task.archived_at.isnot(None))
        .order_by(Task.archived_at.desc())
    )
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


@router.post("/{task_id}/archive", response_model=TaskResponse)
async def archive_task(
    project_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a task. Hidden from the active board until restored."""
    from datetime import datetime, timezone
    project = await _get_project(db, project_id)
    result = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    task.archived_at = datetime.now(timezone.utc)

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action="task_archived", entity_type="task", entity_id=task.id,
        project_id=project_id, metadata={"title": task.title},
    )
    await db.commit()

    from app.sockets.manager import sio
    await sio.emit("task_deleted", {"id": task_id}, room=f"project_{project_id}")

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee),
        ).where(Task.id == task_id)
    )
    return _task_to_response(result.scalar_one())


@router.post("/{task_id}/restore", response_model=TaskResponse)
async def restore_task(
    project_id: str, task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore a previously archived task."""
    project = await _get_project(db, project_id)
    result = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    task.archived_at = None

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action="task_restored", entity_type="task", entity_id=task.id,
        project_id=project_id, metadata={"title": task.title},
    )
    await db.commit()

    from app.sockets.manager import sio
    await sio.emit("task_created", {"id": task_id}, room=f"project_{project_id}")

    result = await db.execute(
        select(Task).options(
            selectinload(Task.task_labels).selectinload(TaskLabel.label),
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.attachments),
            selectinload(Task.assignee),
        ).where(Task.id == task_id)
    )
    return _task_to_response(result.scalar_one())


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

    # Edit permission: status/position changes are free for everyone; any other
    # field change requires being the creator, a manager/owner, or having an
    # approved edit grant.
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

    # Clone recurring task when transitioning to "done"
    if old_status != "done" and task.status == "done" and task.recurrence:
        await _maybe_clone_recurring(db, task, project_id, current_user.id)

    action = "task_moved" if "status" in update_data and update_data["status"] != old_status else "task_updated"

    from app.services.task_activity import build_task_change_summary
    summary = await build_task_change_summary(db, old_values, update_data)

    if summary:
        await log_activity(
            db, org_id=project.org_id, user_id=current_user.id,
            action=action, entity_type="task", entity_id=task.id,
            project_id=project_id, metadata={"summary": summary},
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

    # Clone recurring task when transitioning to "done"
    if old_status != "done" and task.status == "done" and task.recurrence:
        await _maybe_clone_recurring(db, task, project_id, current_user.id)

    if old_status != data.status:
        from app.services.task_activity import status_label
        await log_activity(
            db, org_id=project.org_id, user_id=current_user.id,
            action="task_moved", entity_type="task", entity_id=task.id,
            project_id=project_id,
            metadata={"summary": [f"Status: {status_label(old_status)} → {status_label(data.status)}"]},
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


# ============ Bulk Operations ============

@router.post("/bulk/update")
async def bulk_update_tasks(
    project_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk update tasks. Body: { task_ids: [], status?, assignee_id?, priority? }."""
    project = await _get_project(db, project_id)
    task_ids = data.get("task_ids") or []
    if not task_ids:
        raise HTTPException(status_code=400, detail="task_ids kosong")

    result = await db.execute(
        select(Task).where(Task.id.in_(task_ids), Task.project_id == project_id)
    )
    tasks = result.scalars().all()

    updates = {k: v for k, v in data.items() if k in ("status", "assignee_id", "priority") and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Tidak ada field yang diupdate")

    for t in tasks:
        for k, v in updates.items():
            setattr(t, k, v)

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action="task_bulk_updated", entity_type="task", entity_id=None,
        project_id=project_id,
        metadata={"count": len(tasks), "updates": {k: str(v) for k, v in updates.items()}},
    )
    await db.commit()

    from app.sockets.manager import sio
    for t in tasks:
        await sio.emit("task_updated", {"id": str(t.id)}, room=f"project_{project_id}")

    return {"updated": len(tasks)}


@router.post("/bulk/delete")
async def bulk_delete_tasks(
    project_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk delete tasks. Body: { task_ids: [] }."""
    project = await _get_project(db, project_id)
    task_ids = data.get("task_ids") or []
    if not task_ids:
        raise HTTPException(status_code=400, detail="task_ids kosong")

    result = await db.execute(
        select(Task).where(Task.id.in_(task_ids), Task.project_id == project_id)
    )
    tasks = result.scalars().all()

    await log_activity(
        db, org_id=project.org_id, user_id=current_user.id,
        action="task_bulk_deleted", entity_type="task", entity_id=None,
        project_id=project_id, metadata={"count": len(tasks)},
    )

    from app.sockets.manager import sio
    for t in tasks:
        await sio.emit("task_deleted", {"id": str(t.id)}, room=f"project_{project_id}")
        await db.delete(t)
    await db.commit()
    return {"deleted": len(tasks)}


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
