"""Event and EventAttendee models for calendar."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Exactly one of project_id / team_id is set.
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=True)
    # "public" (semua anggota) | "private" (hanya peserta + pembuat)
    visibility = Column(String(10), default="public", nullable=False)
    # "meeting" | "event" | "sale" | "promo" | "other"
    category = Column(String(20), default="meeting", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    google_event_id = Column(String(255), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="events")
    team = relationship("Team")
    creator = relationship("User", foreign_keys=[created_by])
    attendees = relationship("EventAttendee", back_populates="event", cascade="all, delete-orphan")


class EventAttendee(Base):
    __tablename__ = "event_attendees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="invited", nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('invited', 'accepted', 'declined')", name="ck_attendee_status"),
        UniqueConstraint("event_id", "user_id", name="uq_event_attendee"),
    )

    # Relationships
    event = relationship("Event", back_populates="attendees")
    user = relationship("User")
