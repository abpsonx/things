"""Team board column model — dynamic kanban columns per team.

Mirrors BoardColumn (project boards). slug is what a team Task.status
references, so the four defaults ("todo"/"in_progress"/"pending"/"done")
stay compatible with existing team tasks — no data migration needed.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class TeamBoardColumn(Base):
    __tablename__ = "team_board_columns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    slug = Column(String(50), nullable=False)
    title = Column(String(100), nullable=False)
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("team_id", "slug", name="uq_team_board_column_team_slug"),
    )

    team = relationship("Team")
