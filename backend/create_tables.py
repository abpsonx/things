import asyncio
from app.core.database import engine, Base
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.channel import Channel, Message
from app.models.task import Task, SubTask
from app.models.label import Label, TaskLabel
from app.models.comment import Comment
from app.models.attachment import Attachment
from app.models.event import Event, EventAttendee
from app.models.organization import Organization, OrgMember

async def create_all():
    async with engine.begin() as conn:
        print("Creating all tables...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done!")

if __name__ == "__main__":
    asyncio.run(create_all())
