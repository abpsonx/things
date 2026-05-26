"""Shareable per-workspace invite codes (one per role).

A Super User / Admin shares a code; whoever registers with it joins that
workspace directly with the code's role (member/manager/owner=Admin).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class OrgInviteCode(Base):
    __tablename__ = "org_invite_codes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # member | manager | owner (=Admin)
    code = Column(String(40), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("org_id", "role", name="uq_org_invite_code_role"),)
