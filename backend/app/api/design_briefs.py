"""Design brief endpoints — sibling Content Brief. Per-tim, dengan
upload final_image + pin annotation di atas image untuk review."""
import os
import uuid
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import select, func as safunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.permissions import is_superuser
from app.dependencies import get_current_user
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.organization import OrgMember
from app.models.design_brief import DesignBrief, DesignBriefAnnotation, DesignBriefImage, DesignBrand
from app.schemas import (
    DesignBriefCreate,
    DesignBriefUpdate,
    DesignBriefResponse,
    DesignBriefListItem,
    DesignBriefAnnotationCreate,
    DesignBriefAnnotationUpdate,
    DesignBriefAnnotationResponse,
    DesignBriefImageResponse,
    DesignBriefImageReorder,
    DesignBrandCreate,
    DesignBrandUpdate,
    DesignBrandResponse,
)
from app.services import log_activity

router = APIRouter(prefix="/organizations/{org_id}/teams/{team_id}/design-briefs", tags=["Design Briefs"])

VALID_STATUSES = {"draft", "onprogress", "review", "published"}


async def _require_team_access(db: AsyncSession, org_id: str, team_id: str, user: User) -> Team:
    res = await db.execute(select(Team).where(Team.id == team_id, Team.org_id == org_id))
    team = res.scalar_one_or_none()
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
    tm_res = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
    )
    if not tm_res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Kamu bukan anggota tim ini")
    return team


async def _get_brief(db: AsyncSession, team_id: str, brief_id: str) -> DesignBrief:
    res = await db.execute(
        select(DesignBrief)
        .options(
            selectinload(DesignBrief.creator),
            selectinload(DesignBrief.brand_label),
            selectinload(DesignBrief.annotations).selectinload(DesignBriefAnnotation.creator),
            selectinload(DesignBrief.images)
            .selectinload(DesignBriefImage.annotations)
            .selectinload(DesignBriefAnnotation.creator),
        )
        .where(DesignBrief.id == brief_id, DesignBrief.team_id == team_id)
    )
    brief = res.scalar_one_or_none()
    if not brief:
        raise HTTPException(status_code=404, detail="Brief tidak ditemukan")
    return brief


# ---------- Brand labels ----------

@router.get("/_brands", response_model=List[DesignBrandResponse])
async def list_brands(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List brand labels untuk foldering brief."""
    await _require_team_access(db, org_id, team_id, current_user)
    res = await db.execute(
        select(DesignBrand).where(DesignBrand.team_id == team_id).order_by(DesignBrand.name)
    )
    return list(res.scalars().all())


@router.post("/_brands", response_model=DesignBrandResponse, status_code=status.HTTP_201_CREATED)
async def create_brand(
    org_id: str, team_id: str,
    data: DesignBrandCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama brand wajib")
    # Cek duplikat case-insensitive per team.
    dup = await db.execute(
        select(DesignBrand).where(
            DesignBrand.team_id == team_id,
            safunc.lower(DesignBrand.name) == name.lower(),
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Brand dengan nama itu sudah ada")
    brand = DesignBrand(team_id=team_id, name=name, color=data.color)
    db.add(brand)
    await db.commit()
    return brand


@router.patch("/_brands/{brand_id}", response_model=DesignBrandResponse)
async def update_brand(
    org_id: str, team_id: str, brand_id: str,
    data: DesignBrandUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    res = await db.execute(
        select(DesignBrand).where(DesignBrand.id == brand_id, DesignBrand.team_id == team_id)
    )
    brand = res.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand tidak ditemukan")
    payload = data.model_dump(exclude_unset=True)
    if "name" in payload:
        new_name = (payload["name"] or "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Nama brand wajib")
        if new_name.lower() != brand.name.lower():
            dup = await db.execute(
                select(DesignBrand).where(
                    DesignBrand.team_id == team_id,
                    safunc.lower(DesignBrand.name) == new_name.lower(),
                )
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Brand dengan nama itu sudah ada")
        brand.name = new_name
    if "color" in payload:
        brand.color = payload["color"]
    await db.commit()
    return brand


@router.delete("/_brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brand(
    org_id: str, team_id: str, brand_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hapus brand. Brief yang ditautkan otomatis brand_id=NULL (ON DELETE SET NULL)."""
    await _require_team_access(db, org_id, team_id, current_user)
    res = await db.execute(
        select(DesignBrand).where(DesignBrand.id == brand_id, DesignBrand.team_id == team_id)
    )
    brand = res.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand tidak ditemukan")
    await db.delete(brand)
    await db.commit()
    return None


# ---------- Briefs ----------

@router.get("", response_model=List[DesignBriefListItem])
async def list_design_briefs(
    org_id: str, team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)

    # Bulk counts: total + open (not resolved).
    total_q = await db.execute(
        select(DesignBriefAnnotation.brief_id, safunc.count(DesignBriefAnnotation.id))
        .join(DesignBrief, DesignBriefAnnotation.brief_id == DesignBrief.id)
        .where(DesignBrief.team_id == team_id)
        .group_by(DesignBriefAnnotation.brief_id)
    )
    total_counts = {str(bid): int(n) for bid, n in total_q.all()}
    open_q = await db.execute(
        select(DesignBriefAnnotation.brief_id, safunc.count(DesignBriefAnnotation.id))
        .join(DesignBrief, DesignBriefAnnotation.brief_id == DesignBrief.id)
        .where(DesignBrief.team_id == team_id, DesignBriefAnnotation.resolved == False)
        .group_by(DesignBriefAnnotation.brief_id)
    )
    open_counts = {str(bid): int(n) for bid, n in open_q.all()}

    res = await db.execute(
        select(DesignBrief)
        .options(
            selectinload(DesignBrief.creator),
            selectinload(DesignBrief.brand_label),
        )
        .where(DesignBrief.team_id == team_id)
        .order_by(DesignBrief.updated_at.desc())
    )
    out = []
    for b in res.scalars().all():
        item = DesignBriefListItem.model_validate(b)
        item.annotation_count = total_counts.get(str(b.id), 0)
        item.open_annotation_count = open_counts.get(str(b.id), 0)
        out.append(item)
    return out


@router.post("", response_model=DesignBriefResponse, status_code=status.HTTP_201_CREATED)
async def create_design_brief(
    org_id: str, team_id: str,
    data: DesignBriefCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status harus salah satu: {sorted(VALID_STATUSES)}")

    brief = DesignBrief(
        org_id=org_id,
        team_id=team_id,
        creator_id=current_user.id,
        title=data.title,
        brand=data.brand,
        brand_id=data.brand_id,
        visual_text=data.visual_text,
        headline=data.headline,
        sub_headline=data.sub_headline,
        body_text=data.body_text,
        caption=data.caption,
        publish_date=data.publish_date,
        hashtag=data.hashtag,
        reference_url=data.reference_url,
        final_image_url=data.final_image_url,
        status=data.status,
    )
    db.add(brief)
    await db.flush()

    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="design_brief_created", entity_type="design_brief", entity_id=brief.id,
        team_id=team_id, metadata={"title": brief.title},
    )
    await db.commit()
    return await _get_brief(db, team_id, str(brief.id))


@router.get("/{brief_id}", response_model=DesignBriefResponse)
async def get_design_brief(
    org_id: str, team_id: str, brief_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    return await _get_brief(db, team_id, brief_id)


@router.patch("/{brief_id}", response_model=DesignBriefResponse)
async def update_design_brief(
    org_id: str, team_id: str, brief_id: str,
    data: DesignBriefUpdate,
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
async def delete_design_brief(
    org_id: str, team_id: str, brief_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    brief = await _get_brief(db, team_id, brief_id)
    await log_activity(
        db, org_id=org_id, user_id=current_user.id,
        action="design_brief_deleted", entity_type="design_brief", entity_id=brief.id,
        team_id=team_id, metadata={"title": brief.title},
    )
    await db.delete(brief)
    await db.commit()
    return None


# ---------- Image upload (multi — carousel) ----------

def _save_image_file(file: UploadFile, team_id: str) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower() or ".png"
    upload_dir = f"uploads/design-briefs/{team_id}"
    os.makedirs(upload_dir, exist_ok=True)
    fname = f"{uuid.uuid4()}{ext}"
    fpath = f"{upload_dir}/{fname}"
    with open(fpath, "wb") as out:
        shutil.copyfileobj(file.file, out)
    return f"/api/{fpath}"


@router.post("/{brief_id}/images", response_model=DesignBriefImageResponse, status_code=status.HTTP_201_CREATED)
async def add_design_image(
    org_id: str, team_id: str, brief_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tambah gambar baru ke carousel brief. Position = next index (urut akhir)."""
    await _require_team_access(db, org_id, team_id, current_user)
    brief = await _get_brief(db, team_id, brief_id)

    url = _save_image_file(file, team_id)

    next_pos_q = await db.execute(
        select(safunc.coalesce(safunc.max(DesignBriefImage.position), -1) + 1)
        .where(DesignBriefImage.brief_id == brief_id)
    )
    next_pos = int(next_pos_q.scalar_one())

    img = DesignBriefImage(brief_id=brief_id, image_url=url, position=next_pos)
    db.add(img)
    # Sekalian jaga final_image_url biar list/thumbnail brief lama tetap punya preview.
    if not brief.final_image_url:
        brief.final_image_url = url
    await db.commit()

    res = await db.execute(
        select(DesignBriefImage)
        .options(selectinload(DesignBriefImage.annotations).selectinload(DesignBriefAnnotation.creator))
        .where(DesignBriefImage.id == img.id)
    )
    return res.scalar_one()


@router.delete("/{brief_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_design_image(
    org_id: str, team_id: str, brief_id: str, image_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hapus 1 gambar dari carousel (cascade ke annotation-nya)."""
    await _require_team_access(db, org_id, team_id, current_user)
    brief = await _get_brief(db, team_id, brief_id)
    res = await db.execute(
        select(DesignBriefImage).where(
            DesignBriefImage.id == image_id,
            DesignBriefImage.brief_id == brief_id,
        )
    )
    img = res.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=404, detail="Gambar tidak ditemukan")
    if str(brief.creator_id) != str(current_user.id) and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat brief yang boleh menghapus gambar")
    await db.delete(img)
    # Re-sync final_image_url ke gambar pertama tersisa.
    rest_q = await db.execute(
        select(DesignBriefImage).where(DesignBriefImage.brief_id == brief_id, DesignBriefImage.id != image_id)
        .order_by(DesignBriefImage.position)
    )
    rest = rest_q.scalars().first()
    brief.final_image_url = rest.image_url if rest else None
    await db.commit()
    return None


@router.patch("/{brief_id}/images/reorder", response_model=List[DesignBriefImageResponse])
async def reorder_design_images(
    org_id: str, team_id: str, brief_id: str,
    data: DesignBriefImageReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set urutan gambar dalam carousel. data.image_ids harus berisi
    semua image milik brief — tidak boleh ada yang missing."""
    await _require_team_access(db, org_id, team_id, current_user)
    brief = await _get_brief(db, team_id, brief_id)
    if str(brief.creator_id) != str(current_user.id) and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat brief yang boleh mengubah urutan")

    res = await db.execute(
        select(DesignBriefImage).where(DesignBriefImage.brief_id == brief_id)
    )
    images = {str(i.id): i for i in res.scalars().all()}
    incoming = [str(i) for i in data.image_ids]
    if set(incoming) != set(images.keys()):
        raise HTTPException(status_code=400, detail="image_ids harus berisi seluruh gambar brief ini")

    for idx, iid in enumerate(incoming):
        images[iid].position = idx
    # Sync final_image_url ke gambar paling depan setelah reorder.
    brief.final_image_url = images[incoming[0]].image_url if incoming else None
    await db.commit()

    out_q = await db.execute(
        select(DesignBriefImage)
        .options(selectinload(DesignBriefImage.annotations).selectinload(DesignBriefAnnotation.creator))
        .where(DesignBriefImage.brief_id == brief_id)
        .order_by(DesignBriefImage.position)
    )
    return list(out_q.scalars().all())


# Legacy endpoint dipertahankan agar deploy lama tidak rusak. Sekarang
# ia delegate ke add_design_image — sehingga upload jadi "append carousel"
# (tidak lagi replace single image).
@router.post("/{brief_id}/image", response_model=DesignBriefResponse)
async def upload_design_image_legacy(
    org_id: str, team_id: str, brief_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await add_design_image(org_id, team_id, brief_id, file, db, current_user)
    return await _get_brief(db, team_id, brief_id)


# ---------- Annotations (pin comments di atas image) ----------

@router.post("/{brief_id}/annotations", response_model=DesignBriefAnnotationResponse, status_code=status.HTTP_201_CREATED)
async def add_annotation(
    org_id: str, team_id: str, brief_id: str,
    data: DesignBriefAnnotationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    brief = await _get_brief(db, team_id, brief_id)

    # Validasi image_id: kalau dikirim, harus milik brief ini. Kalau tidak,
    # fallback ke gambar pertama (untuk client lama yang belum kirim image_id).
    image_id = data.image_id
    if image_id:
        ok = next((i for i in brief.images if str(i.id) == str(image_id)), None)
        if not ok:
            raise HTTPException(status_code=400, detail="image_id tidak ditemukan dalam brief ini")
    else:
        first = sorted(brief.images, key=lambda i: i.position)[:1]
        if not first:
            raise HTTPException(status_code=400, detail="Brief belum punya gambar — upload dulu")
        image_id = first[0].id

    ann = DesignBriefAnnotation(
        brief_id=brief_id,
        image_id=image_id,
        creator_id=current_user.id,
        x_pct=data.x_pct,
        y_pct=data.y_pct,
        w_pct=data.w_pct,
        h_pct=data.h_pct,
        content=data.content,
    )
    db.add(ann)
    await db.commit()
    res = await db.execute(
        select(DesignBriefAnnotation)
        .options(selectinload(DesignBriefAnnotation.creator))
        .where(DesignBriefAnnotation.id == ann.id)
    )
    return res.scalar_one()


@router.patch("/{brief_id}/annotations/{annotation_id}", response_model=DesignBriefAnnotationResponse)
async def update_annotation(
    org_id: str, team_id: str, brief_id: str, annotation_id: str,
    data: DesignBriefAnnotationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    res = await db.execute(
        select(DesignBriefAnnotation).where(
            DesignBriefAnnotation.id == annotation_id,
            DesignBriefAnnotation.brief_id == brief_id,
        )
    )
    ann = res.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation tidak ditemukan")

    payload = data.model_dump(exclude_unset=True)
    # Edit content: hanya pembuat annotation atau superuser.
    if "content" in payload and str(ann.creator_id) != str(current_user.id) and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat annotation yang boleh mengubah isi")
    # Resolve: siapa saja anggota tim boleh tandai resolved (review collaboration).
    for k, v in payload.items():
        setattr(ann, k, v)
    await db.commit()
    res = await db.execute(
        select(DesignBriefAnnotation)
        .options(selectinload(DesignBriefAnnotation.creator))
        .where(DesignBriefAnnotation.id == annotation_id)
    )
    return res.scalar_one()


@router.delete("/{brief_id}/annotations/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    org_id: str, team_id: str, brief_id: str, annotation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_team_access(db, org_id, team_id, current_user)
    res = await db.execute(
        select(DesignBriefAnnotation).where(
            DesignBriefAnnotation.id == annotation_id,
            DesignBriefAnnotation.brief_id == brief_id,
        )
    )
    ann = res.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation tidak ditemukan")
    if str(ann.creator_id) != str(current_user.id) and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat annotation yang boleh menghapus")
    await db.delete(ann)
    await db.commit()
    return None
