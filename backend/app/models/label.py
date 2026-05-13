"""Label and TaskLabel models."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Label(Base):
    __tablename__ = "labels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(50), nullable=False)
    color = Column(String(7), nullable=False, default="#6b7280")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        # Unique name per organization (global labels) or per project
        UniqueConstraint("org_id", "name", name="uq_label_org_name"),
    )

    # Relationships
    organization = relationship("Organization", back_populates="labels")
    project = relationship("Project", back_populates="labels")
    task_labels = relationship("TaskLabel", back_populates="label", cascade="all, delete-orphan")


class TaskLabel(Base):
    __tablename__ = "task_labels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    label_id = Column(UUID(as_uuid=True), ForeignKey("labels.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (
        UniqueConstraint("task_id", "label_id", name="uq_task_label"),
    )

    # Relationships
    task = relationship("Task", back_populates="task_labels")
    label = relationship("Label", back_populates="task_labels")
