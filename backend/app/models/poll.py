"""Poll + PollVote models for chat-room polling."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class Poll(Base):
    """A poll lives inside a chat — either a project channel or a team chat.

    Exactly one of channel_id or team_id is set. The poll itself is referenced
    by a regular chat message (messages.poll_id / team_messages.poll_id) so the
    poll renders inline with the rest of the conversation.
    """
    __tablename__ = "polls"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    question = Column(Text, nullable=False)
    # Stored as JSON array of strings: ["Kopiku", "Kopi Kita", "Kita Kamu"]
    options = Column(JSONB, nullable=False, default=list)
    allow_multi = Column(Boolean, default=False, nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    votes = relationship("PollVote", back_populates="poll", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])


class PollVote(Base):
    """One row per (user, option) — supports multi-choice naturally."""
    __tablename__ = "poll_votes"
    __table_args__ = (
        UniqueConstraint("poll_id", "user_id", "option_index", name="uq_poll_vote"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    poll_id = Column(UUID(as_uuid=True), ForeignKey("polls.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    option_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    poll = relationship("Poll", back_populates="votes")
    user = relationship("User", foreign_keys=[user_id])
