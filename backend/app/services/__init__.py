"""Activity logging service."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.activity_log import ActivityLog
from uuid import UUID
from typing import Optional


async def log_activity(
    db: AsyncSession,
    org_id: UUID,
    user_id: UUID,
    action: str,
    entity_type: str,
    entity_id: UUID = None,
    project_id: UUID = None,
    metadata: dict = None,
):
    """Log an activity for audit trail."""
    log = ActivityLog(
        org_id=org_id,
        project_id=project_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_=metadata or {},
    )
    db.add(log)
    await db.flush()
    return log
