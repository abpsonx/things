"""Connected social media accounts (brand accounts) and their metric snapshots."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Date, Integer, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
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
    scopes = Column(Text, nullable=True)  # permissions granted at connect time
    connected_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Insights snapshot — Graph API audience demographics + profile activity.
    # Shape: {profile: {profile_views, website_clicks, ...}, demographics:
    # {gender_age: {...}, city: {...}, country: {...}, age: {...}},
    # fetched_at: iso}. Update tiap kali _ig_snapshot jalan.
    insights = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    metrics = relationship("SocialMetric", back_populates="account", cascade="all, delete-orphan")
    posts = relationship("SocialPost", back_populates="account", cascade="all, delete-orphan")


class SocialMetric(Base):
    """Daily snapshot of an account's headline numbers, for growth charts."""
    __tablename__ = "social_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(UUID(as_uuid=True), ForeignKey("social_accounts.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    followers = Column(Integer, nullable=True)
    following = Column(Integer, nullable=True)
    posts_count = Column(Integer, nullable=True)
    # Engagement totals (summed across the account's posts on snapshot day).
    likes = Column(Integer, nullable=True)       # total likes
    comments = Column(Integer, nullable=True)    # total comments
    shares = Column(Integer, nullable=True)      # needs insights scope (else null)
    saves = Column(Integer, nullable=True)       # needs insights scope (else null)
    views = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    account = relationship("SocialAccount", back_populates="metrics")


class SocialPost(Base):
    """A published post pulled from the platform, with engagement counts.

    Powers the posting calendar and per-post engagement view. Synced from
    the Instagram media edge; refreshed so counts stay reasonably current.
    """
    __tablename__ = "social_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(UUID(as_uuid=True), ForeignKey("social_accounts.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String(255), nullable=False)  # platform media id
    media_type = Column(String(30), nullable=True)  # IMAGE | VIDEO | CAROUSEL_ALBUM
    caption = Column(Text, nullable=True)
    permalink = Column(Text, nullable=True)
    media_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    posted_at = Column(DateTime(timezone=True), nullable=True)  # when it was published
    like_count = Column(Integer, nullable=True)
    comments_count = Column(Integer, nullable=True)
    # Media insights (need the insights scope; null until granted/available).
    reach = Column(Integer, nullable=True)
    saved = Column(Integer, nullable=True)
    shares = Column(Integer, nullable=True)
    views = Column(Integer, nullable=True)
    # Deep insights — kapasitas tergantung media_type & scope token.
    total_interactions = Column(Integer, nullable=True)
    profile_visits = Column(Integer, nullable=True)
    profile_activity = Column(Integer, nullable=True)  # CTA taps (website/email/dll)
    follows = Column(Integer, nullable=True)
    navigation = Column(Integer, nullable=True)  # Reels: swipe-away / dismiss
    avg_watch_time_ms = Column(Integer, nullable=True)  # Reels only (ig_reels_avg_watch_time)
    total_watch_time_ms = Column(Integer, nullable=True)  # Reels: total view time
    fetched_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("account_id", "external_id", name="uq_social_post_account_external"),)

    account = relationship("SocialAccount", back_populates="posts")


class SocialScheduledPost(Base):
    """Draft posting yang dijadwalkan untuk publish ke IG/TikTok.

    Worker scheduler tick tiap 5 menit ngecek pending row yang
    scheduled_at <= now, lalu publish lewat Graph API.
    Status lifecycle: pending → publishing → posted (or failed).
    """
    __tablename__ = "social_scheduled_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(UUID(as_uuid=True), ForeignKey("social_accounts.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Reference asal kalau di-schedule dari brief design (untuk traceability).
    design_brief_id = Column(UUID(as_uuid=True), nullable=True)

    caption = Column(Text, nullable=True)
    # URL gambar yang publik-accessible — IG akan fetch dari sini.
    # Untuk Things: pakai /api/uploads/... dari upload existing.
    # Untuk CAROUSEL ini cuma cover/preview pertama, full list di carousel_urls.
    media_url = Column(Text, nullable=False)
    media_type = Column(String(20), nullable=True, default="IMAGE")  # IMAGE | VIDEO | REELS | STORIES | CAROUSEL
    # CAROUSEL: list URL (image atau video) — sampai 10 item.
    # Format: [{"url": "...", "is_video": false}, ...]
    carousel_urls = Column(JSONB, nullable=True)
    # REELS only: list IG username (max 3) yang diundang sebagai collaborator.
    collaborators = Column(JSONB, nullable=True)
    # REELS only: kalau True (default) Reels akan crosspost ke Feed juga.
    share_to_feed = Column(Boolean, nullable=False, default=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=False)

    status = Column(String(20), nullable=False, default="pending")  # pending|publishing|posted|failed|cancelled
    # IG creation container id (intermediate) lalu media id (after publish).
    ig_creation_id = Column(String(255), nullable=True)
    ig_media_id = Column(String(255), nullable=True)
    ig_permalink = Column(Text, nullable=True)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    last_attempt_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    account = relationship("SocialAccount")


class SocialStory(Base):
    """IG Story snapshot + insights.

    Stories expire setelah 24 jam, jadi kita sync agresif (tiap snapshot tick)
    dan simpan permanen di sini supaya analitiknya survive walaupun story
    asli udah hilang dari IG. Insights diambil dari edge /{story-id}/insights
    dengan metric: impressions, reach, exits, taps_forward, taps_back,
    replies, profile_visits, follows. profile_activity & navigation untuk
    Reels — story pakai set lama.
    """
    __tablename__ = "social_stories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(UUID(as_uuid=True), ForeignKey("social_accounts.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String(255), nullable=False)  # IG story media id
    media_type = Column(String(30), nullable=True)  # IMAGE | VIDEO
    media_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    permalink = Column(Text, nullable=True)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # Insights (null kalau scope insufficient atau story baru/expired).
    impressions = Column(Integer, nullable=True)
    reach = Column(Integer, nullable=True)
    exits = Column(Integer, nullable=True)
    taps_forward = Column(Integer, nullable=True)
    taps_back = Column(Integer, nullable=True)
    replies = Column(Integer, nullable=True)
    profile_visits = Column(Integer, nullable=True)
    follows = Column(Integer, nullable=True)
    fetched_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("account_id", "external_id", name="uq_social_story_account_external"),)

    account = relationship("SocialAccount")
