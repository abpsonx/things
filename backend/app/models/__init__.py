"""Models package — import all models here for Alembic to detect them."""
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.models.project import Project, ProjectMember
from app.models.task import Task, SubTask, TaskDependency
from app.models.attachment import Attachment
from app.models.label import Label, TaskLabel
from app.models.comment import Comment
from app.models.channel import Channel, Message
from app.models.dm import DMChannel, DMMessage
from app.models.event import Event, EventAttendee
from app.models.activity_log import ActivityLog
from app.models.notification import Notification, PushSubscription
from app.models.invitation import Invitation
from app.models.system_setting import SystemSetting
from app.models.team import Team, TeamMember, TeamMessage
from app.models.document import Document
from app.models.announcement import Announcement, AnnouncementRecipient, AnnouncementComment, AnnouncementRead
from app.models.board_column import BoardColumn
from app.models.poll import Poll, PollVote
from app.models.reaction import Reaction
from app.models.team_file import TeamFile
from app.models.task_edit_request import TaskEditRequest
from app.models.social_account import SocialAccount, SocialMetric
from app.models.content_brief import ContentBrief, BriefScene

__all__ = [
    "User",
    "Organization", "OrgMember",
    "Project", "ProjectMember",
    "Team", "TeamMember", "TeamMessage",
    "Task", "SubTask", "TaskDependency", "Attachment",
    "Label", "TaskLabel",
    "Comment",
    "Channel", "Message",
    "DMChannel", "DMMessage",
    "Event", "EventAttendee",
    "ActivityLog",
    "Notification", "PushSubscription",
    "Invitation",
    "SystemSetting",
    "Document",
    "Announcement",
    "BoardColumn",
    "Poll", "PollVote",
    "Reaction",
    "TeamFile",
    "AnnouncementRecipient", "AnnouncementComment", "AnnouncementRead",
    "TaskEditRequest",
    "SocialAccount", "SocialMetric",
    "ContentBrief", "BriefScene",
]
