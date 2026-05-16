"""Board column model — dynamic kanban columns per project."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class BoardColumn(Base):
    __tablename__ = "board_columns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    # slug is what Task.status references, so default columns can keep their
    # historical values ("todo", "in_progress", "done") and existing tasks
    # don't need any data migration.
    slug = Column(String(50), nullable=False)
    title = Column(String(100), nullable=False)
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("project_id", "slug", name="uq_board_column_project_slug"),
    )

    project = relationship("Project")
