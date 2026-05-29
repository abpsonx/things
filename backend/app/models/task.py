"""Task, SubTask, and Attachment models."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Date, Integer, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy import Boolean
from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="todo", nullable=False)
    priority = Column(String(10), default="medium", nullable=False)
    assignee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True)
    position = Column(Integer, default=0)
    # Google Calendar event id (in the assignee's primary calendar). Set
    # after we successfully push the task to Google so we can update or
    # delete the same event later.
    google_event_id = Column(String(255), nullable=True)
    # Recurrence rule. One of: "daily", "weekly", "monthly", or NULL.
    # When the task is marked done, a fresh copy is cloned with the due
    # date shifted by the interval.
    recurrence = Column(String(16), nullable=True)
    # Soft delete timestamp. NULL = active, otherwise hidden from boards.
    archived_at = Column(DateTime(timezone=True), nullable=True)
    # Date (UTC) of the last deadline reminder sent, so we notify at most
    # once per day per task instead of every scheduler tick.
    last_reminded_on = Column(Date, nullable=True)
    # List of ContentBrief IDs (as strings) yang ditautkan ke task ini, supaya
    # task di board bisa ambil "link hasil jadi" (final_url) dari brief.
    linked_brief_ids = Column(JSONB, nullable=True, default=list)
    # URL hasil pengerjaan (deliverable): post yang sudah live, deploy preview,
    # Drive folder, dst. Tetap bebas — task gak harus punya brief untuk mengisi.
    result_url = Column(Text, nullable=True)
    # Ad-hoc properties (Notion-style) — list of {name, value}. Order dijaga.
    custom_properties = Column(JSONB, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("status IN ('todo', 'in_progress', 'pending', 'done')", name="ck_task_status"),
        CheckConstraint("priority IN ('low', 'medium', 'high')", name="ck_task_priority"),
    )

    # Relationships
    project = relationship("Project", back_populates="tasks")
    team = relationship("Team", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assignee_id])
    creator = relationship("User", foreign_keys=[created_by])
    subtasks = relationship("SubTask", back_populates="task", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="task", cascade="all, delete-orphan")
    task_labels = relationship("TaskLabel", back_populates="task", cascade="all, delete-orphan")
    # Multiple assignees (in addition to the legacy single assignee_id, which
    # we keep as the "primary" for backward-compatible UIs).
    assignee_links = relationship("TaskAssignee", back_populates="task", cascade="all, delete-orphan")

    @property
    def assignees(self):
        """List of assigned Users. Reads only already-loaded data so it never
        triggers a lazy load (returns [] when assignee_links wasn't eager-loaded,
        e.g. on the project board which still uses the single assignee)."""
        links = self.__dict__.get("assignee_links")
        if not links:
            return []
        out = []
        for link in links:
            u = link.__dict__.get("user")
            if u is not None:
                out.append(u)
        return out

    # Dependencies — a task "blocks" others and is "blocked_by" others.
    blocks_relations = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.blocker_id",
        cascade="all, delete-orphan",
    )
    blocked_by_relations = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.blocked_id",
        cascade="all, delete-orphan",
    )


class TaskLink(Base):
    """URL attached to a task (separate from file Attachments)."""
    __tablename__ = "task_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    url = Column(String(2048), nullable=False)
    title = Column(String(255), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task = relationship("Task")


class TaskDependency(Base):
    """Edge in the task-dependency graph. blocker_id must finish before blocked_id can proceed."""
    __tablename__ = "task_dependencies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blocker_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    blocked_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    blocker = relationship("Task", foreign_keys=[blocker_id])
    blocked = relationship("Task", foreign_keys=[blocked_id])


class TaskAssignee(Base):
    """Many-to-many: a task can have several assignees."""
    __tablename__ = "task_assignees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_assignee"),
    )

    task = relationship("Task", back_populates="assignee_links")
    user = relationship("User")


class SubTask(Base):
    __tablename__ = "subtasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    is_done = Column(Boolean, default=False)

    # Relationships
    task = relationship("Task", back_populates="subtasks")
