"""Workspace-wide ("all staff") announcements.

Mirrors the project announcements API but scoped to an organization. Only
Manager+ (org manager / Admin / Super User / Developer) can post; every
workspace member is notified.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from app.core.database import get_db
from app.core.permissions import is_superuser, require_org_manager
from app.dependencies import get_current_user
from app.models.announcement import Announcement, AnnouncementRecipient, AnnouncementRead, AnnouncementComment
from app.models.organization import OrgMember
from app.models.reaction import Reaction
from app.models.user import User
from app.schemas import AnnouncementCreate, AnnouncementResponse, AnnouncementUpdate, UserResponse
from app.services import log_activity
from app.services.notification import notify_user

router = APIRouter(prefix="/organizations/{org_id}/announcements", tags=["Workspace Announcements"])


async def _require_member(db, org_id: UUID, user_id) -> None:
    res = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org_id, OrgMember.user_id == user_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Bukan anggota workspace ini")


@router.get("", response_model=List[AnnouncementResponse])
async def list_org_announcements(
    org_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    result = await db.execute(
        select(Announcement)
        .options(
            selectinload(Announcement.creator),
            selectinload(Announcement.recipients),
        )
        .where(Announcement.org_id == oid)
        .order_by(Announcement.created_at.desc())
    )
    rows = result.scalars().all()

    # Audience filter: if an announcement has recipients pinned, only those
    # users (plus the creator and any platform superuser) may see it.
    can_see_all = is_superuser(current_user)
    visible = []
    for a in rows:
        rids = {str(r.user_id) for r in (a.recipients or [])}
        if not rids:
            visible.append(a)  # broadcast
            continue
        if can_see_all or str(a.creator_id) == str(current_user.id) or str(current_user.id) in rids:
            visible.append(a)

    # Pydantic doesn't know recipient_ids exists on the ORM object, so attach
    # it as a synthetic attribute the response model can read.
    # For SECRET announcements: hide the recipient list from everyone except
    # the creator + platform superusers (so even other recipients can't see
    # who else got it).

    # Bulk counters — hindari N+1 untuk read/comment counts.
    from sqlalchemy import func as safunc
    visible_ids = [a.id for a in visible]
    read_counts: dict = {}
    comment_counts: dict = {}
    my_reads: set = set()
    if visible_ids:
        rc_res = await db.execute(
            select(AnnouncementRead.announcement_id, safunc.count(AnnouncementRead.id))
            .where(AnnouncementRead.announcement_id.in_(visible_ids))
            .group_by(AnnouncementRead.announcement_id)
        )
        read_counts = {str(aid): int(n) for aid, n in rc_res.all()}
        cc_res = await db.execute(
            select(AnnouncementComment.announcement_id, safunc.count(AnnouncementComment.id))
            .where(AnnouncementComment.announcement_id.in_(visible_ids))
            .group_by(AnnouncementComment.announcement_id)
        )
        comment_counts = {str(aid): int(n) for aid, n in cc_res.all()}
        mr_res = await db.execute(
            select(AnnouncementRead.announcement_id)
            .where(
                AnnouncementRead.announcement_id.in_(visible_ids),
                AnnouncementRead.user_id == current_user.id,
            )
        )
        my_reads = {str(r[0]) for r in mr_res.all()}

    out = []
    for a in visible:
        resp = AnnouncementResponse.model_validate(a)
        is_creator = str(a.creator_id) == str(current_user.id)
        if a.is_secret and not is_creator and not can_see_all:
            resp.recipient_ids = []
        else:
            resp.recipient_ids = [r.user_id for r in (a.recipients or [])]
        resp.read_count = read_counts.get(str(a.id), 0)
        resp.comment_count = comment_counts.get(str(a.id), 0)
        resp.has_read = str(a.id) in my_reads or is_creator
        out.append(resp)
    return out


@router.post("", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_org_announcement(
    org_id: str,
    data: AnnouncementCreate,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await require_org_manager(db, oid, current_user)

    announcement = Announcement(
        org_id=oid,
        creator_id=current_user.id,
        title=data.title,
        content=data.content,
        expires_at=data.expires_at,
        is_secret=bool(data.is_secret),
    )
    db.add(announcement)
    await db.flush()

    # Resolve audience: union of (members whose role matches target_roles)
    # and explicit target_user_ids. Empty union → broadcast to everyone.
    mem = await db.execute(
        select(OrgMember.user_id, OrgMember.role).where(OrgMember.org_id == oid)
    )
    all_members = [(str(uid), role) for uid, role in mem.all()]
    member_ids = [uid for uid, _ in all_members]

    requested_roles = {r for r in (data.target_roles or []) if r in {"owner", "manager", "member"}}
    requested_user_ids = {str(u) for u in (data.target_user_ids or [])}

    if requested_roles or requested_user_ids:
        # Targeted — only recipients matching either role or explicit pick
        # AND who are actually members of this workspace.
        targets: set[str] = set()
        member_set = set(member_ids)
        for uid, role in all_members:
            if role in requested_roles:
                targets.add(uid)
        for uid in requested_user_ids:
            if uid in member_set:
                targets.add(uid)
        # Persist as AnnouncementRecipient rows so visibility persists.
        for uid in targets:
            db.add(AnnouncementRecipient(announcement_id=announcement.id, user_id=UUID(uid)))
        notify_targets = targets
    else:
        # Broadcast — no recipient rows; notify everyone except author.
        notify_targets = set(member_ids)

    await log_activity(
        db, org_id=oid, user_id=current_user.id,
        action="announcement_created", entity_type="announcement", entity_id=announcement.id,
        metadata={
            "title": data.title,
            "scope": "workspace",
            "audience": "targeted" if (requested_roles or requested_user_ids) else "all",
            "recipient_count": len(notify_targets),
        },
    )

    from app.core.mentions import expand_mention_ids
    mentioned = await expand_mention_ids(db, data.mention_ids)
    # Secret announcements: no title/content preview in the notif, just a
    # neutral "ada pengumuman rahasia" so anyone glancing over a shoulder
    # can't read it from the bell dropdown.
    secret = bool(data.is_secret)
    for uid in notify_targets:
        if uid == str(current_user.id):
            continue
        if secret:
            await notify_user(
                db, user_id=uid, type="announcement",
                title="Pengumuman rahasia",
                content=f"{current_user.name} mengirim pengumuman rahasia",
                ref_id=str(announcement.id), org_id=org_id,
                url=f"/org/{org_id}/announcements",
            )
            continue
        if uid in mentioned:
            await notify_user(
                db, user_id=uid, type="announcement",
                title=f"Kamu di-tag di pengumuman: {data.title}",
                content=f"{current_user.name} menandai kamu di pengumuman workspace",
                ref_id=str(announcement.id), org_id=org_id,
                url=f"/org/{org_id}/announcements",
            )
        else:
            await notify_user(
                db, user_id=uid, type="announcement",
                title=f"Pengumuman: {data.title}",
                content=f"{current_user.name} memposting pengumuman",
                ref_id=str(announcement.id), org_id=org_id,
                url=f"/org/{org_id}/announcements",
            )

    await db.commit()
    result = await db.execute(
        select(Announcement)
        .options(
            selectinload(Announcement.creator),
            selectinload(Announcement.recipients),
        )
        .where(Announcement.id == announcement.id)
    )
    row = result.scalar_one()
    resp = AnnouncementResponse.model_validate(row)
    resp.recipient_ids = [r.user_id for r in (row.recipients or [])]
    return resp


@router.put("/{announcement_id}", response_model=AnnouncementResponse)
async def update_org_announcement(
    org_id: str,
    announcement_id: str,
    data: AnnouncementUpdate,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await require_org_manager(db, oid, current_user)
    result = await db.execute(
        select(Announcement).where(Announcement.id == UUID(announcement_id), Announcement.org_id == oid)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")
    if announcement.creator_id != current_user.id and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat pengumuman yang bisa mengedit")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(announcement, key, value)
    await db.commit()
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.creator)).where(Announcement.id == announcement.id)
    )
    return result.scalar_one()


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org_announcement(
    org_id: str,
    announcement_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await require_org_manager(db, oid, current_user)
    result = await db.execute(
        select(Announcement).where(Announcement.id == UUID(announcement_id), Announcement.org_id == oid)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")
    if announcement.creator_id != current_user.id and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat atau Admin yang bisa menghapus")
    await db.delete(announcement)
    await db.commit()
    return None


# ─── Read receipts ────────────────────────────────────────────────────────────

async def _load_announcement(db, oid: UUID, ann_id: str) -> Announcement:
    """Cari announcement + cek user boleh akses (member workspace + masuk audiens)."""
    res = await db.execute(
        select(Announcement)
        .options(selectinload(Announcement.recipients))
        .where(Announcement.id == UUID(ann_id), Announcement.org_id == oid)
    )
    ann = res.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Pengumuman tidak ditemukan")
    return ann


@router.post("/{announcement_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_announcement_read(
    org_id: str,
    announcement_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Idempotent: rekam bahwa user ini sudah baca pengumuman. Unique constraint
    menjaga supaya retry / multi-tab tidak menggandakan row."""
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    ann = await _load_announcement(db, oid, announcement_id)

    # Jangan record kalau user adalah creator-nya sendiri (tidak masuk hitungan).
    if str(ann.creator_id) == str(current_user.id):
        return None

    # Audience check — kalau ada recipient list dan user tidak masuk, ignore.
    rids = {str(r.user_id) for r in (ann.recipients or [])}
    if rids and str(current_user.id) not in rids and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Pengumuman ini bukan untukmu")

    existing = await db.execute(
        select(AnnouncementRead).where(
            AnnouncementRead.announcement_id == ann.id,
            AnnouncementRead.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        return None
    db.add(AnnouncementRead(announcement_id=ann.id, user_id=current_user.id))
    await db.commit()
    return None


@router.get("/{announcement_id}/readers", response_model=List[UserResponse])
async def list_announcement_readers(
    org_id: str,
    announcement_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Siapa saja yang sudah baca. Hanya pembuat + superuser yang boleh lihat
    (privacy — anggota lain tidak perlu tahu siapa baca apa)."""
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    ann = await _load_announcement(db, oid, announcement_id)
    if str(ann.creator_id) != str(current_user.id) and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat yang bisa melihat daftar pembaca")
    res = await db.execute(
        select(User)
        .join(AnnouncementRead, AnnouncementRead.user_id == User.id)
        .where(AnnouncementRead.announcement_id == ann.id)
        .order_by(AnnouncementRead.read_at.desc())
    )
    return res.scalars().all()


@router.get("/{announcement_id}/read-status")
async def announcement_read_status(
    org_id: str,
    announcement_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Status lengkap: siapa sudah baca & siapa belum, di antara seluruh
    anggota workspace. Hanya pembuat + superuser yang boleh lihat."""
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    ann = await _load_announcement(db, oid, announcement_id)
    if str(ann.creator_id) != str(current_user.id) and not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya pembuat yang bisa melihat daftar pembaca")

    # Semua anggota workspace.
    members_res = await db.execute(
        select(User, OrgMember.role)
        .join(OrgMember, OrgMember.user_id == User.id)
        .where(OrgMember.org_id == oid)
    )
    members = list(members_res.all())

    # ID yang sudah baca + timestamp baca-nya.
    reads_res = await db.execute(
        select(AnnouncementRead.user_id, AnnouncementRead.read_at)
        .where(AnnouncementRead.announcement_id == ann.id)
    )
    read_map = {str(uid): ts for uid, ts in reads_res.all()}

    readers, unreaders = [], []
    for user, _role in members:
        u = UserResponse.model_validate(user).model_dump(mode="json")
        if str(user.id) in read_map:
            u["read_at"] = read_map[str(user.id)].isoformat() if read_map[str(user.id)] else None
            readers.append(u)
        else:
            unreaders.append(u)
    # Urutkan readers paling baru di atas, unreaders alfabetis.
    readers.sort(key=lambda x: x.get("read_at") or "", reverse=True)
    unreaders.sort(key=lambda x: (x.get("name") or "").lower())
    return {"readers": readers, "unreaders": unreaders}


# ─── Reactions ────────────────────────────────────────────────────────────────

@router.post("/{announcement_id}/reactions/{emoji}", status_code=status.HTTP_204_NO_CONTENT)
async def toggle_announcement_reaction(
    org_id: str,
    announcement_id: str,
    emoji: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle 1 emoji reaksi pada pengumuman. Pakai polymorphic Reaction
    dengan target_type='announcement'."""
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    ann = await _load_announcement(db, oid, announcement_id)
    existing = await db.execute(
        select(Reaction).where(
            Reaction.target_type == "announcement",
            Reaction.target_id == ann.id,
            Reaction.user_id == current_user.id,
            Reaction.emoji == emoji,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        await db.delete(row)
    else:
        db.add(Reaction(
            target_type="announcement",
            target_id=ann.id,
            user_id=current_user.id,
            emoji=emoji,
        ))
    await db.commit()
    return None


@router.get("/{announcement_id}/reactions")
async def list_announcement_reactions(
    org_id: str,
    announcement_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregated: { emoji: { count, mine: bool, users: [{id,name}] } }."""
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    ann = await _load_announcement(db, oid, announcement_id)
    res = await db.execute(
        select(Reaction)
        .options(selectinload(Reaction.user))
        .where(Reaction.target_type == "announcement", Reaction.target_id == ann.id)
        .order_by(Reaction.created_at.asc())
    )
    buckets: dict = {}
    for r in res.scalars().all():
        b = buckets.setdefault(r.emoji, {"emoji": r.emoji, "count": 0, "mine": False, "users": []})
        b["count"] += 1
        if str(r.user_id) == str(current_user.id):
            b["mine"] = True
        if r.user:
            b["users"].append({"id": str(r.user.id), "name": r.user.name})
    return list(buckets.values())


# ─── Comments ─────────────────────────────────────────────────────────────────

@router.get("/{announcement_id}/comments")
async def list_announcement_comments(
    org_id: str,
    announcement_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    ann = await _load_announcement(db, oid, announcement_id)
    res = await db.execute(
        select(AnnouncementComment)
        .options(selectinload(AnnouncementComment.user))
        .where(AnnouncementComment.announcement_id == ann.id)
        .order_by(AnnouncementComment.created_at.asc())
    )
    out = []
    for c in res.scalars().all():
        out.append({
            "id": str(c.id),
            "announcement_id": str(c.announcement_id),
            "content": c.content,
            "created_at": c.created_at.isoformat(),
            "user": {
                "id": str(c.user.id),
                "name": c.user.name,
                "avatar_url": c.user.avatar_url,
            } if c.user else None,
        })
    return out


@router.post("/{announcement_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_announcement_comment(
    org_id: str,
    announcement_id: str,
    data: dict,  # {"content": "...", "mention_ids": [uuid, ...]}
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    ann = await _load_announcement(db, oid, announcement_id)
    content = (data.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Komentar tidak boleh kosong")
    c = AnnouncementComment(announcement_id=ann.id, user_id=current_user.id, content=content)
    db.add(c)
    await db.commit()
    await db.refresh(c, ["user"])

    # Notify mentions
    raw_mentions = data.get("mention_ids") or []
    if raw_mentions:
        for uid in raw_mentions:
            uid_s = str(uid)
            if not uid_s or uid_s == str(current_user.id):
                continue
            await notify_user(
                db,
                user_id=uid_s,
                type="mention",
                content=f"{current_user.name} menyebut kamu di komentar pengumuman",
                ref_id=str(ann.id),
                org_id=str(oid),
            )
    return {
        "id": str(c.id),
        "announcement_id": str(c.announcement_id),
        "content": c.content,
        "created_at": c.created_at.isoformat(),
        "user": {
            "id": str(c.user.id),
            "name": c.user.name,
            "avatar_url": c.user.avatar_url,
        } if c.user else None,
    }


@router.delete("/{announcement_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement_comment(
    org_id: str,
    announcement_id: str,
    comment_id: str,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Penulis komentar sendiri atau creator pengumuman boleh hapus."""
    oid = UUID(org_id)
    await _require_member(db, oid, current_user.id)
    ann = await _load_announcement(db, oid, announcement_id)
    res = await db.execute(
        select(AnnouncementComment).where(
            AnnouncementComment.id == UUID(comment_id),
            AnnouncementComment.announcement_id == ann.id,
        )
    )
    cm = res.scalar_one_or_none()
    if not cm:
        raise HTTPException(status_code=404, detail="Komentar tidak ditemukan")
    can_delete = (
        str(cm.user_id) == str(current_user.id)
        or str(ann.creator_id) == str(current_user.id)
        or is_superuser(current_user)
    )
    if not can_delete:
        raise HTTPException(status_code=403, detail="Tidak boleh menghapus komentar ini")
    await db.delete(cm)
    await db.commit()
    return None
