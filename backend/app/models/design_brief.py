"""Design brief — sibling fitur dari ContentBrief tapi untuk asset DESAIN
(poster, feed IG, banner) ketimbang script video.

Struktur per brief: metadata (judul, brand, caption, hashtag, tanggal posting,
status), 1 final_image_url saat designer upload artwork jadi, plus annotation
ber-pin di atas gambar untuk review/revisi (mirip Figma comments)."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Date, ForeignKey, Boolean, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class DesignBrief(Base):
    __tablename__ = "design_briefs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title = Column(String(255), nullable=False)
    brand = Column(String(255), nullable=True)
    visual_text = Column(Text, nullable=True)             # teks pendek yang muncul di artwork
    caption = Column(Text, nullable=True)                 # caption posting (long form)
    publish_date = Column(Date, nullable=True)            # rencana tanggal publish
    hashtag = Column(Text, nullable=True)                 # daftar #tag, free text
    reference_url = Column(Text, nullable=True)           # mood/competitor link
    final_image_url = Column(Text, nullable=True)         # artwork hasil jadi (uploaded)
    # Properti tambahan ad-hoc — list of {name, value}. Dipertahankan urutan
    # supaya UI bisa render sesuai input user (Notion-style).
    custom_properties = Column(JSONB, nullable=True, default=list)

    # 4-step status: draft → onprogress → review → published
    status = Column(String(20), default="draft", nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    team = relationship("Team")
    creator = relationship("User")
    annotations = relationship(
        "DesignBriefAnnotation",
        back_populates="brief",
        cascade="all, delete-orphan",
        order_by="DesignBriefAnnotation.created_at",
    )


class DesignBriefAnnotation(Base):
    """Pin annotation di final_image — koordinat dalam % (0-100) relatif
    ke gambar supaya scale-independent. Konten = thread komentar review."""
    __tablename__ = "design_brief_annotations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brief_id = Column(UUID(as_uuid=True), ForeignKey("design_briefs.id", ondelete="CASCADE"), nullable=False)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Posisi pin dalam persentase (0-100). Numeric biar tidak hilang presisi
    # ketika browser pakai sub-pixel coordinate. w_pct/h_pct opsional: kalau
    # null → annotation berupa pin titik, kalau ada → rectangle (drag-to-box).
    x_pct = Column(Numeric(5, 2), nullable=False)
    y_pct = Column(Numeric(5, 2), nullable=False)
    w_pct = Column(Numeric(5, 2), nullable=True)
    h_pct = Column(Numeric(5, 2), nullable=True)
    content = Column(Text, nullable=False)
    resolved = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    brief = relationship("DesignBrief", back_populates="annotations")
    creator = relationship("User")
