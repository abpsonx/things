"""Task, SubTask, and Attachment models."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
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


class TaskDependency(Base):
    """Edge in the task-dependency graph. blocker_id must finish before blocked_id can proceed."""
    __tablename__ = "task_dependencies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blocker_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    blocked_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    blocker = relationship("Task", foreign_keys=[blocker_id])
    blocked = relationship("Task", foreign_keys=[blocked_id])


class SubTask(Base):
    __tablename__ = "subtasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    is_done = Column(Boolean, default=False)

    # Relationships
    task = relationship("Task", back_populates="subtasks")
