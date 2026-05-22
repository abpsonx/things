"""Connected social media accounts (brand accounts) and their metric snapshots."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Date, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class SocialAccount(Base):
    __tablename__ = "social_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    platform = Column(String(20), nullable=False)  # "instagram" | "tiktok"
    # Platform-side identity
    external_id = Column(String(255), nullable=True)
    username = Column(String(255), nullable=True)
    display_name = Column(String(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    # OAuth tokens (stored on the brand account, not the connecting user)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    connected_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    metrics = relationship("SocialMetric", back_populates="account", cascade="all, delete-orphan")


class SocialMetric(Base):
    """Daily snapshot of an account's headline numbers, for growth charts."""
    __tablename__ = "social_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(UUID(as_uuid=True), ForeignKey("social_accounts.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    followers = Column(Integer, nullable=True)
    following = Column(Integer, nullable=True)
    posts_count = Column(Integer, nullable=True)
    likes = Column(Integer, nullable=True)
    views = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    account = relationship("SocialAccount", back_populates="metrics")
