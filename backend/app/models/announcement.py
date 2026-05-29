from sqlalchemy import Column, String, Text, ForeignKey, DateTime, UniqueConstraint, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime, timezone
import uuid

class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Exactly one of project_id / team_id / org_id is set. org_id => a
    # workspace-wide "all staff" announcement.
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    # Optional deadline — after this the announcement is considered expired.
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # Secret announcements hide their recipient list from non-creators and
    # strip the content preview from push notifications.
    is_secret = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="announcements")
    team = relationship("Team")
    creator = relationship("User")
    recipients = relationship("AnnouncementRecipient", back_populates="announcement", cascade="all, delete-orphan")
    comments = relationship("AnnouncementComment", back_populates="announcement", cascade="all, delete-orphan")


class AnnouncementRecipient(Base):
    """Targeted recipients. If an announcement has zero rows here, it's for everyone."""
    __tablename__ = "announcement_recipients"
    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_announcement_recipient"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    announcement_id = Column(UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    announcement = relationship("Announcement", back_populates="recipients")
    user = relationship("User")


class AnnouncementComment(Base):
    __tablename__ = "announcement_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    announcement_id = Column(UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    announcement = relationship("Announcement", back_populates="comments")
    user = relationship("User")


class AnnouncementRead(Base):
    """Read receipt — one row per (announcement, user). Idempotent insert
    via unique constraint sehingga klien bisa POST-spam tanpa dobel-counted."""
    __tablename__ = "announcement_reads"
    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_announcement_read"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    announcement_id = Column(UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    read_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    announcement = relationship("Announcement")
    user = relationship("User")
