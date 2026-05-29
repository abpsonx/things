"""Content brief endpoints — structured replacement for the spreadsheet
ad-scripting workflow. Each brief belongs to a TEAM (creative crew works
at the team level) and holds many storyboard scenes."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func as safunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.team import Team
from app.models.organization import OrgMember
from app.models.content_brief import ContentBrief, BriefScene
from app.schemas import (
    ContentBriefCreate,
    ContentBriefUpdate,
    ContentBriefResponse,
    ContentBriefListItem,
    BriefSceneCreate,
    BriefSceneUpdate,
    BriefSceneResponse,
    SceneReorderRequest,
)
from app.services import log_activity
from app.core.permissions import is_superuser

router = APIRouter(prefix="/organizations/{org_id}/teams/{team_id}/briefs", tags=["Content Briefs"])

VALID_STATUSES = {"draft", "review", "approved", "published"}


async def _require_team_access(db: AsyncSession, org_id: str, team_id: str, user: User) -> Team:
    """Mirror teams.py gate: workspace Admin (owner) + SU/Dev see every team;
    Manager + Member must be a TeamMember of THIS team. Returns the team row."""
    # Load team row first (so we can also detect 404).
    team_res = await db.execute(
        select(Team).where(Team.id == team_id, Team.org_id == org_id)
    )
    team = team_res.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team tidak ditemukan")

    if is_superuser(user):
        return team

    om_res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user.id)
    )
    om = om_res.scalar_one_or_none()
    if not om:
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")
    if om.role == "owner":
        return team

    from app.models.team import TeamMember
    tm_res = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
    )
    if not tm_res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Kamu bukan anggota tim ini")
    return team


async def _get_brief(db: AsyncSession, team_id: str, brief_id: str) -> ContentBrief:
    res = await db.execute(
        select(ContentBrief)
        .options(
            selectinload(ContentBrief.creator),
            selectinload(ContentBrief.scenes),
        )
        .where(ContentBrief.id == brief_id, ContentBrief.team_id == team_id)
    )
    brief = res.scalar_one_or_none()
    if not brief:
        raise HTTPException(status_code=404, detail="Brief tidak ditemukan")
    return brief


# ---------- Briefs ----------

@router.get("", response_model=List[ContentBriefListItem])
async def list_briefs(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)

    counts_q = await db.execute(
        select(BriefScene.brief_id, safunc.count(BriefScene.id))
        .join(ContentBrief, BriefScene.brief_id == ContentBrief.id)
        .where(ContentBrief.team_id == team_id)
        .group_by(BriefScene.brief_id)
    )
    counts = {str(bid): n for bid, n in counts_q.all()}

    res = await db.execute(
        select(ContentBrief)
        .options(selectinload(ContentBrief.creator))
        .where(ContentBrief.team_id == team_id)
        .order_by(ContentBrief.updated_at.desc())
    )
    out = []
    for b in res.scalars().all():
        item = ContentBriefListItem.model_validate(b)
        item.scene_count = counts.get(str(b.id), 0)
        out.append(item)
    return out


@router.post("", response_model=ContentBriefResponse, status_code=status.HTTP_201_CREATED)
async def create_brief(
    org_id: str, team_id: str,
    data: ContentBriefCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status harus salah satu: {sorted(VALID_STATUSES)}")

    brief = ContentBrief(
        org_id=org_id,
        team_id=team_id,
        creator_id=current_user.id,
        title=data.title,
        location=data.location,
        shoot_date=data.shoot_date,
        shoot_time=data.shoot_time,
        video_duration=data.video_duration,
        video_format=data.video_format,
        platforms=data.platforms or [],
        tone=data.tone,
        status=data.status,
    )
    db.add(brief)
    await db.flush()

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="brief_created", entity_type="content_brief", entity_id=brief.id,
        team_id=team_id, metadata={"title": brief.title},
    )
    await db.commit()
    return await _get_brief(db, team_id, str(brief.id))


@router.get("/{brief_id}", response_model=ContentBriefResponse)
async def get_brief(
    org_id: str, team_id: str, brief_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    return await _get_brief(db, team_id, brief_id)


@router.patch("/{brief_id}", response_model=ContentBriefResponse)
async def update_brief(
    org_id: str, team_id: str, brief_id: str,
    data: ContentBriefUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    brief = await _get_brief(db, team_id, brief_id)

    payload = data.model_dump(exclude_unset=True)
    if "status" in payload and payload["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status harus salah satu: {sorted(VALID_STATUSES)}")
    for key, value in payload.items():
        setattr(brief, key, value)

    await db.commit()
    return await _get_brief(db, team_id, brief_id)


@router.delete("/{brief_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brief(
    org_id: str, team_id: str, brief_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    brief = await _get_brief(db, team_id, brief_id)
    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="brief_deleted", entity_type="content_brief", entity_id=brief.id,
        team_id=team_id, metadata={"title": brief.title},
    )
    await db.delete(brief)
    await db.commit()
    return None


# ---------- Scenes ----------

@router.post("/{brief_id}/scenes", response_model=BriefSceneResponse, status_code=status.HTTP_201_CREATED)
async def add_scene(
    org_id: str, team_id: str, brief_id: str,
    data: BriefSceneCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    await _get_brief(db, team_id, brief_id)

    max_pos = (await db.execute(
        select(safunc.max(BriefScene.position)).where(BriefScene.brief_id == brief_id)
    )).scalar() or 0

    scene = BriefScene(
        brief_id=brief_id,
        position=max_pos + 1,
        scene_type=data.scene_type,
        time_range=data.time_range,
        location=data.location,
        shoot_time=data.shoot_time,
        script_vo=data.script_vo,
        footage=data.footage,
        talent=data.talent,
        duration=data.duration,
    )
    db.add(scene)
    await db.commit()
    await db.refresh(scene)
    return scene


@router.patch("/{brief_id}/scenes/{scene_id}", response_model=BriefSceneResponse)
async def update_scene(
    org_id: str, team_id: str, brief_id: str, scene_id: str,
    data: BriefSceneUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    res = await db.execute(
        select(BriefScene).where(BriefScene.id == scene_id, BriefScene.brief_id == brief_id)
    )
    scene = res.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene tidak ditemukan")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(scene, key, value)
    await db.commit()
    await db.refresh(scene)
    return scene


@router.delete("/{brief_id}/scenes/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scene(
    org_id: str, team_id: str, brief_id: str, scene_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    res = await db.execute(
        select(BriefScene).where(BriefScene.id == scene_id, BriefScene.brief_id == brief_id)
    )
    scene = res.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene tidak ditemukan")
    await db.delete(scene)
    await db.commit()
    return None


@router.post("/{brief_id}/scenes/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_scenes(
    org_id: str, team_id: str, brief_id: str,
    data: SceneReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    await _get_brief(db, team_id, brief_id)

    res = await db.execute(select(BriefScene).where(BriefScene.brief_id == brief_id))
    scenes = {str(s.id): s for s in res.scalars().all()}
    for idx, sid in enumerate(data.scene_ids, start=1):
        s = scenes.get(str(sid))
        if s:
            s.position = idx
    await db.commit()
    return None
