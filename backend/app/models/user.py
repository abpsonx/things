"""User model."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    avatar_url = Column(Text, nullable=True)
    is_verified = Column(Boolean, default=False)
    role = Column(String(20), default="staff") # "admin" or "staff"
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Google OAuth
    google_access_token = Column(Text, nullable=True)
    google_refresh_token = Column(Text, nullable=True)

    # Daily digest opt-in (1am UTC ≈ 8am Jakarta)
    daily_digest_enabled = Column(Boolean, default=True)

    # Per-user UI prefs: team bullet colors { team_id: "#hex" } (personal).
    team_colors = Column(JSONB, default=dict)

    # Relationships
    org_memberships = relationship("OrgMember", back_populates="user", cascade="all, delete-orphan")
    project_memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")
    team_memberships = relationship("TeamMember", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
