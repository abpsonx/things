"""Pydantic schemas for API request/response validation."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any
from datetime import datetime, date
from uuid import UUID


# ============ Auth Schemas ============

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    registration_code: str = Field(..., description="Kode eksklusif perusahaan")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    name: str
    email: str
    avatar_url: Optional[str] = None
    tagline: Optional[str] = None
    is_verified: bool
    role: str = "staff"
    created_at: datetime
    daily_digest_enabled: bool = True
    team_colors: dict = {}
    pinned_teams: list = []
    pinned_dms: list = []
    # Disisi backend saat semua koneksi socket user ditutup. Frontend DM
    # header pakai ini buat tampilkan "Terakhir online X menit lalu".
    last_seen_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    user: UserResponse
    tokens: TokenResponse


# ============ Organization Schemas ============

class OrgCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


class OrgResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class OrgMemberResponse(BaseModel):
    id: UUID
    user_id: UUID
    role: str
    joined_at: datetime
    user: Optional[UserResponse] = None

    class Config:
        from_attributes = True


class OrgDetailResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    members: List[OrgMemberResponse] = []

    class Config:
        from_attributes = True


# ============ Team Schemas ============

class TeamCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None

class TeamUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    allow_invite: Optional[bool] = None
    allow_delete_task: Optional[bool] = None

class TeamResponse(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    description: Optional[str] = None
    created_by: UUID
    created_at: datetime
    allow_invite: bool
    allow_delete_task: bool

    class Config:
        from_attributes = True

class TeamMemberResponse(BaseModel):
    id: UUID
    user_id: UUID
    role: str
    joined_at: datetime
    user: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# ============ Project Schemas ============

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    description: Optional[str] = None
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectMemberResponse(BaseModel):
    id: UUID
    user_id: UUID
    role: str
    joined_at: datetime
    user: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# ============ Task Schemas ============

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = "todo"
    priority: str = "medium"
    assignee_id: Optional[UUID] = None
    assignee_ids: Optional[List[UUID]] = None
    due_date: Optional[datetime] = None
    position: int = 0
    recurrence: Optional[str] = None
    result_url: Optional[str] = None
    custom_properties: Optional[List[dict]] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[UUID] = None
    assignee_ids: Optional[List[UUID]] = None
    due_date: Optional[datetime] = None
    position: Optional[int] = None
    recurrence: Optional[str] = None
    result_url: Optional[str] = None
    custom_properties: Optional[List[dict]] = None


class TaskMoveRequest(BaseModel):
    status: str
    position: int


class SubTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


class SubTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    is_done: Optional[bool] = None


class SubTaskResponse(BaseModel):
    id: UUID
    title: str
    is_done: bool

    class Config:
        from_attributes = True


class LabelResponse(BaseModel):
    id: UUID
    name: str
    color: str

    class Config:
        from_attributes = True


class TaskResponse(BaseModel):
    id: UUID
    project_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assignee_id: Optional[UUID] = None
    created_by: UUID
    due_date: Optional[datetime] = None
    position: int
    created_at: datetime
    updated_at: datetime
    subtasks: List[SubTaskResponse] = []
    labels: List[LabelResponse] = []
    comments_count: int = 0
    attachments_count: int = 0
    assignee: Optional[UserResponse] = None
    assignees: List[UserResponse] = []
    recurrence: Optional[str] = None
    archived_at: Optional[datetime] = None
    # List of ContentBrief IDs ditautkan ke task ini (untuk akses cepat final_url).
    # Frontend resolve detail brief-nya dari list brief tim yang sudah dimuat
    # — gak perlu round-trip ekstra.
    linked_brief_ids: List[str] = []
    result_url: Optional[str] = None
    # Tolerant: row lama (pre-migration) bisa NULL di DB. Pydantic v2 +
    # from_attributes tanpa Optional gagal validate None → seluruh GET task
    # 500 → modal task tampil kosong di FE.
    custom_properties: Optional[List[dict]] = []

    class Config:
        from_attributes = True


# ============ Label Schemas ============

class LabelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field(default="#6b7280", pattern=r"^#[0-9a-fA-F]{6}$")


# ============ Comment Schemas ============

class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)
    # ID user yang di-tag (@mention) — frontend MentionTextarea kirim ini
    # via onMentionsChange. Backend pakai untuk notify masing-masing.
    mention_ids: List[str] = []


class CommentResponse(BaseModel):
    id: UUID
    task_id: UUID
    user_id: UUID
    content: str
    created_at: datetime
    user: Optional[UserResponse] = None
    reactions: List[Any] = []

    class Config:
        from_attributes = True


# ============ Activity Log Schemas ============

class ActivityLogResponse(BaseModel):
    id: UUID
    org_id: UUID
    project_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    action: str
    entity_type: str
    entity_id: Optional[UUID] = None
    metadata_: Optional[dict] = None
    created_at: datetime
    user: Optional[UserResponse] = None

    class Config:
        from_attributes = True


class AttachmentResponse(BaseModel):
    id: UUID
    task_id: UUID
    uploaded_by: UUID
    file_name: str
    file_path: str
    # nullable di DB — row lama bisa kosong, jangan strict int.
    file_size: Optional[int] = None
    created_at: datetime
    uploader: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# ============ Event Schemas ============

class EventAttendeeResponse(BaseModel):
    id: UUID
    user_id: UUID
    status: str
    user: Optional[UserResponse] = None

    class Config:
        from_attributes = True

# ============ Notification Schemas ============

class NotificationResponse(BaseModel):
    id: UUID
    type: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    url: Optional[str] = None
    is_read: bool
    ref_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    start_at: datetime
    end_at: Optional[datetime] = None
    category: Optional[str] = "meeting"
    reminder_minutes: Optional[int] = None  # null = no reminder
    attendee_ids: List[UUID] = []
    mention_ids: List[UUID] = []


class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    category: Optional[str] = None
    reminder_minutes: Optional[int] = None  # explicit null akan clear; pakai sentinel terpisah kalau perlu
    clear_reminder: Optional[bool] = False  # True → clear reminder_minutes


class GlobalEventCreate(BaseModel):
    """Buat event dari Kalender Global. Pilih salah satu scope (org/team/project)."""
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    start_at: datetime
    end_at: Optional[datetime] = None
    category: Optional[str] = "event"
    reminder_minutes: Optional[int] = None
    # Tepat satu wajib ada — kalau gak ada, default ke personal (org user pertama).
    org_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    attendee_ids: List[UUID] = []


class EventResponse(BaseModel):
    id: UUID
    project_id: Optional[UUID] = None
    org_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    created_by: UUID
    title: str
    description: Optional[str] = None
    start_at: datetime
    end_at: Optional[datetime] = None
    category: str = "meeting"
    reminder_minutes: Optional[int] = None
    created_at: datetime
    creator: Optional[UserResponse] = None
    attendees: List[EventAttendeeResponse] = []

    class Config:
        from_attributes = True


class EventRSVPRequest(BaseModel):
    status: str = Field(..., pattern="^(accepted|declined)$")

# ============ Chat Schemas ============

class ChannelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class ChannelResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    content: Optional[str] = None
    parent_id: Optional[UUID] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    is_sticker: Optional[bool] = False


class MessageResponse(BaseModel):
    id: UUID
    channel_id: UUID
    user_id: UUID
    content: str
    parent_id: Optional[UUID] = None
    is_edited: bool = False
    edited_at: Optional[datetime] = None
    edit_history: List[dict] = []
    is_read: bool = False
    read_by: List[dict] = []
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    is_pinned: bool = False
    is_starred: bool = False
    is_sticker: bool = False
    poll_id: Optional[UUID] = None
    # Optional[Any] so Pydantic's from_attributes doesn't trip when the
    # SQLAlchemy relationship hands back a Poll ORM object. The handler
    # always replaces it with a plain dict before returning.
    poll: Optional[Any] = None
    reactions: List[Any] = []
    created_at: datetime
    user: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# ============ Invite Schemas ============

class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: str = "member"


# ============ Document Schemas ============

class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: Optional[str] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = None


class DocumentResponse(BaseModel):
    id: UUID
    project_id: UUID
    created_by: Optional[UUID] = None
    title: str
    content: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    creator: Optional[UserResponse] = None

    class Config:
        from_attributes = True


# ============ Announcement Schemas ============

class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str
    # Either a user UUID or a "team:{team_id}" token (expanded server-side).
    mention_ids: List[str] = []
    # Audience targeting (workspace announcements):
    # - Empty target_roles + empty target_user_ids → broadcast to everyone.
    # - target_roles: any of {"owner","manager","member"} — include all
    #   workspace members whose role matches.
    # - target_user_ids: explicit per-person picks.
    # Roles + ids are unioned together.
    target_roles: List[str] = []
    target_user_ids: List[str] = []
    # Optional ISO deadline — UI marks expired ones as such.
    expires_at: Optional[datetime] = None
    # Hide recipient list from non-creators + strip notification preview.
    is_secret: bool = False

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = None
    expires_at: Optional[datetime] = None
    is_secret: Optional[bool] = None

class AnnouncementResponse(BaseModel):
    id: UUID
    project_id: Optional[UUID] = None
    org_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    creator_id: UUID
    title: str
    content: str
    created_at: datetime
    updated_at: datetime
    expires_at: Optional[datetime] = None
    is_secret: bool = False
    creator: Optional[UserResponse] = None
    # Resolved recipient user_ids for targeted workspace announcements.
    # Empty list means "everyone" (broadcast).
    recipient_ids: List[UUID] = []
    # Engagement counters — diisi backend di list/get untuk meminimalkan
    # round-trip. 0 default kalau tidak ada.
    read_count: int = 0
    comment_count: int = 0
    has_read: bool = False  # apakah viewer (current_user) sudah baca

    class Config:
        from_attributes = True


# ============ Content Brief Schemas ============

class BriefSceneBase(BaseModel):
    scene_type: Optional[str] = None
    time_range: Optional[str] = None
    location: Optional[str] = None
    shoot_time: Optional[str] = None
    script_vo: Optional[str] = None
    footage: Optional[str] = None
    text_on_video: Optional[str] = None
    talent: Optional[str] = None
    duration: Optional[str] = None


class BriefSceneCreate(BriefSceneBase):
    pass


class BriefSceneUpdate(BriefSceneBase):
    pass


class BriefSceneResponse(BriefSceneBase):
    id: UUID
    brief_id: UUID
    position: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DesignBrandCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    color: Optional[str] = None


class DesignBrandUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    color: Optional[str] = None


class DesignBrandResponse(BaseModel):
    id: UUID
    team_id: UUID
    name: str
    color: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ContentBriefBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    brand: Optional[str] = None
    brand_id: Optional[UUID] = None
    location: Optional[str] = None  # legacy — disimpan tapi UI tidak menampilkan
    shoot_date: Optional[date] = None
    shoot_time: Optional[str] = None
    video_duration: Optional[str] = None
    video_format: Optional[str] = None
    platforms: List[str] = []
    tone: Optional[str] = None  # legacy — disimpan tapi UI tidak menampilkan
    reference_url: Optional[str] = None
    final_url: Optional[str] = None
    status: str = "draft"  # draft | review | approved | published


class ContentBriefCreate(ContentBriefBase):
    pass


class ContentBriefUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    brand: Optional[str] = None
    brand_id: Optional[UUID] = None
    location: Optional[str] = None
    shoot_date: Optional[date] = None
    shoot_time: Optional[str] = None
    video_duration: Optional[str] = None
    video_format: Optional[str] = None
    platforms: Optional[List[str]] = None
    tone: Optional[str] = None
    reference_url: Optional[str] = None
    final_url: Optional[str] = None
    status: Optional[str] = None


class BriefApprovalIn(BaseModel):
    note: Optional[str] = None  # catatan opsional dari approver


class BriefRejectIn(BaseModel):
    reason: str = Field(..., min_length=1)  # alasan reject wajib


class ContentBriefResponse(ContentBriefBase):
    id: UUID
    org_id: UUID
    team_id: UUID
    creator_id: Optional[UUID] = None
    creator: Optional[UserResponse] = None
    brand_label: Optional[DesignBrandResponse] = None
    # Approval fields
    approved_by_id: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    approval_note: Optional[str] = None
    approved_by: Optional[UserResponse] = None
    rejected_by_id: Optional[UUID] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    rejected_by: Optional[UserResponse] = None
    created_at: datetime
    updated_at: datetime
    scenes: List[BriefSceneResponse] = []

    class Config:
        from_attributes = True


class ContentBriefListItem(BaseModel):
    """Lightweight shape for the index page — no scenes payload."""
    id: UUID
    org_id: UUID
    team_id: UUID
    title: str
    brand: Optional[str] = None
    brand_id: Optional[UUID] = None
    brand_label: Optional[DesignBrandResponse] = None
    status: str
    shoot_date: Optional[date] = None
    video_format: Optional[str] = None
    platforms: List[str] = []
    creator: Optional[UserResponse] = None
    scene_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SceneReorderRequest(BaseModel):
    """Bulk reorder — list of scene IDs in their new order."""
    scene_ids: List[UUID]


class TaskBriefLinksUpdate(BaseModel):
    """Replace the full set of brief links on a task."""
    brief_ids: List[UUID]


# ============ Design Brief Schemas ============
# DesignBrand* sudah didefinisikan di atas (sebelum ContentBriefBase) supaya
# bisa di-reference oleh ContentBriefResponse/ListItem.


class DesignBriefBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    brand: Optional[str] = None
    brand_id: Optional[UUID] = None
    visual_text: Optional[str] = None  # legacy — UI sekarang pakai headline/sub_headline/body_text
    headline: Optional[str] = None
    sub_headline: Optional[str] = None
    body_text: Optional[str] = None
    caption: Optional[str] = None
    publish_date: Optional[date] = None
    hashtag: Optional[str] = None
    reference_url: Optional[str] = None
    final_image_url: Optional[str] = None
    # Notion-style: list of {name, value} ad-hoc properties. Tolerant ke
    # row lama yg NULL di DB.
    custom_properties: Optional[List[dict]] = []
    status: str = "draft"  # draft | onprogress | review | published


class DesignBriefCreate(DesignBriefBase):
    pass


class DesignBriefUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    brand: Optional[str] = None
    brand_id: Optional[UUID] = None
    visual_text: Optional[str] = None
    headline: Optional[str] = None
    sub_headline: Optional[str] = None
    body_text: Optional[str] = None
    caption: Optional[str] = None
    publish_date: Optional[date] = None
    hashtag: Optional[str] = None
    reference_url: Optional[str] = None
    final_image_url: Optional[str] = None
    custom_properties: Optional[List[dict]] = None
    status: Optional[str] = None


class DesignBriefAnnotationCreate(BaseModel):
    # image_id: gambar mana di brief carousel ini yang di-annotate. Opsional
    # untuk backward compat (annotation lama pre-multi-image). Bila NULL,
    # backend akan ambil gambar pertama brief.
    image_id: Optional[UUID] = None
    x_pct: float = Field(..., ge=0, le=100)
    y_pct: float = Field(..., ge=0, le=100)
    # Opsional: kalau ada, annotation berupa rectangle (drag-to-box).
    # Kalau null → pin titik.
    w_pct: Optional[float] = Field(None, ge=0, le=100)
    h_pct: Optional[float] = Field(None, ge=0, le=100)
    content: str = Field(..., min_length=1)


class DesignBriefAnnotationUpdate(BaseModel):
    content: Optional[str] = None
    resolved: Optional[bool] = None


class DesignBriefAnnotationResponse(BaseModel):
    id: UUID
    brief_id: UUID
    image_id: Optional[UUID] = None
    creator_id: Optional[UUID] = None
    creator: Optional[UserResponse] = None
    x_pct: float
    y_pct: float
    w_pct: Optional[float] = None
    h_pct: Optional[float] = None
    content: str
    resolved: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DesignBriefImageResponse(BaseModel):
    id: UUID
    brief_id: UUID
    image_url: str
    position: int
    created_at: datetime
    annotations: List[DesignBriefAnnotationResponse] = []

    class Config:
        from_attributes = True


class DesignBriefImageReorder(BaseModel):
    # Daftar image_id urut sesuai posisi yang diinginkan. Backend tinggal
    # set position = index dalam list ini.
    image_ids: List[UUID]


class DesignBriefResponse(DesignBriefBase):
    id: UUID
    org_id: UUID
    team_id: UUID
    creator_id: Optional[UUID] = None
    creator: Optional[UserResponse] = None
    brand_label: Optional[DesignBrandResponse] = None
    # Approval fields
    approved_by_id: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    approval_note: Optional[str] = None
    approved_by: Optional[UserResponse] = None
    rejected_by_id: Optional[UUID] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    rejected_by: Optional[UserResponse] = None
    created_at: datetime
    updated_at: datetime
    images: List[DesignBriefImageResponse] = []
    # annotations dipertahankan demi backward compat — sekarang berisi
    # union dari semua annotation di semua image brief ini. Frontend baru
    # cukup pakai `images[i].annotations`.
    annotations: List[DesignBriefAnnotationResponse] = []

    class Config:
        from_attributes = True


class DesignBriefListItem(BaseModel):
    id: UUID
    org_id: UUID
    team_id: UUID
    title: str
    brand: Optional[str] = None
    brand_id: Optional[UUID] = None
    brand_label: Optional[DesignBrandResponse] = None
    status: str
    publish_date: Optional[date] = None
    final_image_url: Optional[str] = None
    creator: Optional[UserResponse] = None
    annotation_count: int = 0
    open_annotation_count: int = 0  # belum resolved
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

