"""Connected social media accounts (brand accounts) and their metric snapshots."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Date, Integer, ForeignKey, UniqueConstraint
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
    fetched_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("account_id", "external_id", name="uq_social_post_account_external"),)

    account = relationship("SocialAccount", back_populates="posts")
