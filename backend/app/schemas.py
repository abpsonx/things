"""Pydantic schemas for API request/response validation."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any
from datetime import datetime
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

    class Config:
        from_attributes = True


# ============ Label Schemas ============

class LabelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field(default="#6b7280", pattern=r"^#[0-9a-fA-F]{6}$")


# ============ Comment Schemas ============

class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


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
    file_size: int
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
    attendee_ids: List[UUID] = []
    mention_ids: List[UUID] = []


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

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = None

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
    creator: Optional[UserResponse] = None

    class Config:
        from_attributes = True

