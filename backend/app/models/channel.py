"""Channel and Message models for project chat."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class Channel(Base):
    __tablename__ = "channels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="channels")
    messages = relationship("Message", back_populates="channel", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("messages.id"), nullable=True) # For Reply
    is_edited = Column(Boolean, default=False)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    is_read = Column(Boolean, default=False)
    read_by = Column(JSONB, default=list) # List of dicts: [{"id", "name", "read_at"}]
    attachment_url = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)
    is_pinned = Column(Boolean, default=False)
    is_starred = Column(Boolean, default=False)
    poll_id = Column(UUID(as_uuid=True), ForeignKey("polls.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    channel = relationship("Channel", back_populates="messages")
    user = relationship("User")
    poll = relationship("Poll", foreign_keys=[poll_id])
    replies = relationship("Message", backref="parent", remote_side=[id])
