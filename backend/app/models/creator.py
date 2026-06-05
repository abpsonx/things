"""Creator Pool — database influencer/creator internal MEDBER.

Pure internal: data masuk manual oleh tim, gak depend ke Meta/IG API
(yang adoption Creator Marketplace di Indonesia masih tipis). Pakai untuk
track pool influencer yang pernah/calon kerja sama: kontak, rate card,
tier follower, kategori, riwayat campaign + budget.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class Creator(Base):
    """Satu creator/influencer di pool workspace."""
    __tablename__ = "creators"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    # Identity
    ig_username = Column(String(64), nullable=False)  # tanpa @, lowercase
    display_name = Column(String(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    # Demographics
    # Tier: nano (<10k) | micro (10k-100k) | mid (100k-500k) | macro (500k-1M) | mega (1M+)
    tier = Column(String(16), nullable=True)
    follower_count = Column(Integer, nullable=True)  # manual input, snapshot
    # Categories: list of string tags ["food", "lifestyle", "beauty", dst]
    categories = Column(JSONB, nullable=True, default=list)
    location = Column(String(255), nullable=True)  # mis. "Jakarta", "Bandung", "WFH"
    # Contact channels — semua optional
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(64), nullable=True)
    contact_wa = Column(String(64), nullable=True)
    # Rate card — JSONB struktur fleksibel mis. {feed: 500000, story: 200000,
    # reels: 1500000, package_3post: 5000000, currency: "IDR"}
    rate_card = Column(JSONB, nullable=True, default=dict)
    notes = Column(Text, nullable=True)  # free-text catatan tim
    # Status workflow: active (siap di-collab) | inactive (lagi gak prioritas)
    # | blacklist (jangan dipakai lagi — mis. drama, gak respon, hasil jelek)
    status = Column(String(16), default="active", nullable=False)

    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Unique per org — gak boleh ada 2 row dengan ig_username yang sama
    # di satu workspace.
    __table_args__ = (
        UniqueConstraint("org_id", "ig_username", name="uq_creator_org_username"),
    )

    creator_user = relationship("User", foreign_keys=[created_by])
    campaigns = relationship("CreatorCampaign", back_populates="creator", cascade="all, delete-orphan", order_by="CreatorCampaign.campaign_date.desc()")


class CreatorCampaign(Base):
    """Riwayat campaign per creator — track collab yg pernah/lagi/akan jalan."""
    __tablename__ = "creator_campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("creators.id", ondelete="CASCADE"), nullable=False)
    # Optional link ke brand label (label brand yg dipake creator)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("design_brands.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    campaign_date = Column(Date, nullable=True)  # tanggal posting / kontrak
    # Deliverables — list of string mis. ["1 feed", "3 story", "1 reels"]
    deliverables = Column(JSONB, nullable=True, default=list)
    budget = Column(Integer, nullable=True)  # in IDR (lower unit), gampang sum
    # Status: planned (rencana) | ongoing (lg jalan) | done (selesai) | cancelled
    status = Column(String(16), default="planned", nullable=False)
    result_notes = Column(Text, nullable=True)  # catatan hasil — engagement, sentimen, dll
    # Link opsional ke brief design / content brief kalau campaignnya
    # punya brief di Things.
    design_brief_id = Column(UUID(as_uuid=True), nullable=True)
    content_brief_id = Column(UUID(as_uuid=True), nullable=True)

    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    creator = relationship("Creator", back_populates="campaigns")
    brand = relationship("DesignBrand")
