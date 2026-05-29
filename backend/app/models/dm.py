"""Direct Message models."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class DMChannel(Base):
    __tablename__ = "dm_channels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user1_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user2_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    user1 = relationship("User", foreign_keys=[user1_id])
    user2 = relationship("User", foreign_keys=[user2_id])
    messages = relationship("DMMessage", back_populates="dm_channel", cascade="all, delete-orphan")


class DMMessage(Base):
    __tablename__ = "dm_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dm_channel_id = Column(UUID(as_uuid=True), ForeignKey("dm_channels.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    is_delivered = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    reactions = Column(JSONB, default=dict)  # {"user_id": "👍", "user2_id": "❤️"}
    attachment_url = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)
    is_sticker = Column(Boolean, default=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("dm_messages.id", ondelete="SET NULL"), nullable=True)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    edit_history = Column(JSONB, nullable=True, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    dm_channel = relationship("DMChannel", back_populates="messages")
    user = relationship("User")