"""Content ad brief — replaces the spreadsheet workflow for scripting video
ads. Lives at the TEAM level (creative crew works there, not project level).
One ContentBrief = one ad/video (with metadata header). Many BriefScene
rows belong to it (the storyboard table)."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Date, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class ContentBrief(Base):
    __tablename__ = "content_briefs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # org_id stored for activity log scoping; team_id is the real parent.
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)
    shoot_date = Column(Date, nullable=True)
    shoot_time = Column(String(64), nullable=True)        # free text, e.g. "06.00 - 15.00 WIB"
    video_duration = Column(String(64), nullable=True)     # free text, e.g. "30-60 detik"
    video_format = Column(String(32), nullable=True)       # e.g. "9:16", "16:9", "1:1", "4:5"
    platforms = Column(JSONB, nullable=True, default=list) # list[str] — IG/TikTok/etc
    tone = Column(String(255), nullable=True)

    # 4-step status: draft → review → approved → published
    status = Column(String(20), default="draft", nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    team = relationship("Team")
    creator = relationship("User")
    scenes = relationship(
        "BriefScene",
        back_populates="brief",
        cascade="all, delete-orphan",
        order_by="BriefScene.position",
    )


class BriefScene(Base):
    __tablename__ = "brief_scenes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brief_id = Column(UUID(as_uuid=True), ForeignKey("content_briefs.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, default=0, nullable=False)

    # Free-text — frontend offers preset chips (HOOK/PROBLEM/SOLUSI/CTA/OUTRO/B-ROLL/TESTIMONI)
    # but accepts any custom label.
    scene_type = Column(String(64), nullable=True)
    time_range = Column(String(64), nullable=True)         # e.g. "0-3", "dtk 8-18"
    location = Column(String(255), nullable=True)
    shoot_time = Column(String(64), nullable=True)         # e.g. "06.30"
    script_vo = Column(Text, nullable=True)                # rich text / multi-line
    footage = Column(Text, nullable=True)                  # camera direction
    talent = Column(String(255), nullable=True)
    duration = Column(String(32), nullable=True)           # free text, e.g. "3 dtk"

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    brief = relationship("ContentBrief", back_populates="scenes")
