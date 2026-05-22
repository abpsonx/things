"""Main FastAPI application module."""
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.core.database import engine, Base
from app.api import auth, projects, teams, organizations, channels, tasks, attachments, events, comments, subtasks, labels, notifications, search, stats, settings as settings_api, dm, google, documents, reports, announcements, board_columns, polls, reactions, file_index, task_activities, task_edit_requests, sosmed


settings = get_settings()

import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    async with engine.begin() as conn:
        # Note: In production, use Alembic for migrations
        await conn.run_sync(Base.metadata.create_all)
        
        # Auto-fix missing columns in dm_messages (existing databases)
        from sqlalchemy import text
        for col, col_type in [
            ("is_delivered", "BOOLEAN DEFAULT FALSE"),
            ("delivered_at", "TIMESTAMP WITH TIME ZONE"),
            ("read_at", "TIMESTAMP WITH TIME ZONE"),
            ("reactions", "JSONB DEFAULT '{}'::jsonb"),
            ("attachment_url", "VARCHAR"),
            ("attachment_name", "VARCHAR"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS {col} {col_type}"))
            except Exception:
                pass  # Table may not exist yet

        # Auto-fix missing columns in notifications (title + url)
        for col, col_type in [
            ("title", "VARCHAR(200)"),
            ("url", "TEXT"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE notifications ADD COLUMN IF NOT EXISTS {col} {col_type}"))
            except Exception:
                pass

        # edited_at on message tables (so the UI can show "Diedit DD/MM HH:MM")
        for tbl in ("messages", "dm_messages"):
            try:
                await conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE"))
            except Exception:
                pass

        # engagement totals on social_metrics (existing tables predate them)
        for col in ("comments", "shares", "saves"):
            try:
                await conn.execute(text(f"ALTER TABLE social_metrics ADD COLUMN IF NOT EXISTS {col} INTEGER"))
            except Exception:
                pass

        # parent_id on dm_messages + team_messages so replies work in DM and team chat
        try:
            await conn.execute(text(
                "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS parent_id UUID "
                "REFERENCES dm_messages(id) ON DELETE SET NULL"
            ))
        except Exception:
            pass
        try:
            await conn.execute(text(
                "ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS parent_id UUID "
                "REFERENCES team_messages(id) ON DELETE SET NULL"
            ))
        except Exception:
            pass

        # google_event_id on tasks so we can update/delete the matching
        # Google Calendar event when the task is edited or finished
        try:
            await conn.execute(text(
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255)"
            ))
        except Exception:
            pass

        # Dynamic kanban columns: drop the legacy status enum constraint so
        # tasks can sit in user-defined columns, then seed the four defaults
        # ("To Do", "In Progress", "Pending", "Done") for any project that
        # doesn't have columns yet. Default column slugs match the historical
        # status values so existing tasks keep landing in the right column
        # without a data migration.
        try:
            await conn.execute(text("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS ck_task_status"))
        except Exception:
            pass

        # daily digest opt-in on users
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_digest_enabled BOOLEAN DEFAULT TRUE"
            ))
        except Exception as e:
            print(f"[boot] users.daily_digest_enabled add skipped: {e}")

        # recurrence column on tasks — supports "daily" | "weekly" | "monthly"
        try:
            await conn.execute(text(
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence VARCHAR(16)"
            ))
        except Exception as e:
            print(f"[boot] tasks.recurrence add skipped: {e}")

        # archived_at on tasks — soft delete (NULL = active)
        try:
            await conn.execute(text(
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE"
            ))
        except Exception as e:
            print(f"[boot] tasks.archived_at add skipped: {e}")

        # task_edit_requests — request/approve edit access to a task
        try:
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS task_edit_requests ("
                " id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                " task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,"
                " requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                " status VARCHAR(10) NOT NULL DEFAULT 'pending',"
                " created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"
                " resolved_at TIMESTAMP WITH TIME ZONE,"
                " resolved_by UUID REFERENCES users(id) ON DELETE SET NULL"
                ")"
            ))
        except Exception as e:
            print(f"[boot] task_edit_requests create skipped: {e}")

        # last_reminded_on on tasks — the date (UTC) we last sent a deadline
        # reminder, so the scheduler only notifies once per day per task.
        try:
            await conn.execute(text(
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_reminded_on DATE"
            ))
        except Exception as e:
            print(f"[boot] tasks.last_reminded_on add skipped: {e}")

        # Team announcements — make project_id nullable + add team_id
        try:
            await conn.execute(text("ALTER TABLE announcements ALTER COLUMN project_id DROP NOT NULL"))
        except Exception as e:
            print(f"[boot] announcements.project_id nullable skipped: {e}")
        try:
            await conn.execute(text(
                "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE"
            ))
        except Exception as e:
            print(f"[boot] announcements.team_id add skipped: {e}")

        # Announcement deadline + recipients + comments
        try:
            await conn.execute(text(
                "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE"
            ))
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS announcement_recipients ("
                " id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                " announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,"
                " user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                " UNIQUE (announcement_id, user_id)"
                ")"
            ))
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS announcement_comments ("
                " id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                " announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,"
                " user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                " content TEXT NOT NULL,"
                " created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
                ")"
            ))
        except Exception as e:
            print(f"[boot] announcement extras migration skipped: {e}")

        # Team events — make project_id nullable + add team_id
        try:
            await conn.execute(text("ALTER TABLE events ALTER COLUMN project_id DROP NOT NULL"))
        except Exception as e:
            print(f"[boot] events.project_id nullable skipped: {e}")
        try:
            await conn.execute(text(
                "ALTER TABLE events ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE"
            ))
        except Exception as e:
            print(f"[boot] events.team_id add skipped: {e}")
        try:
            await conn.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) DEFAULT 'public' NOT NULL"))
            await conn.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'meeting' NOT NULL"))
        except Exception as e:
            print(f"[boot] events.visibility/category add skipped: {e}")

        # Team documents (wiki) — make project_id nullable + add team_id
        try:
            await conn.execute(text("ALTER TABLE documents ALTER COLUMN project_id DROP NOT NULL"))
        except Exception as e:
            print(f"[boot] documents.project_id nullable skipped: {e}")
        try:
            await conn.execute(text(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE"
            ))
        except Exception as e:
            print(f"[boot] documents.team_id add skipped: {e}")

        # team_files — files uploaded directly to a team
        try:
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS team_files ("
                " id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                " team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,"
                " uploaded_by UUID NOT NULL REFERENCES users(id),"
                " file_name VARCHAR(255) NOT NULL,"
                " file_path VARCHAR(512) NOT NULL,"
                " file_size INTEGER,"
                " created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
                ")"
            ))
        except Exception as e:
            print(f"[boot] team_files create skipped: {e}")

        # Reactions — emoji reactions on comments + chat messages
        try:
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS reactions ("
                " id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                " target_type VARCHAR(20) NOT NULL,"
                " target_id UUID NOT NULL,"
                " user_id UUID NOT NULL REFERENCES users(id),"
                " emoji VARCHAR(20) NOT NULL,"
                " created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"
                " UNIQUE (target_type, target_id, user_id, emoji)"
                ")"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_reactions_target ON reactions(target_type, target_id)"
            ))
        except Exception as e:
            print(f"[boot] reactions migration skipped: {e}")

        # Polls — chat-room polling for project & team chats
        try:
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS polls ("
                " id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                " channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,"
                " team_id UUID REFERENCES teams(id) ON DELETE CASCADE,"
                " created_by UUID NOT NULL REFERENCES users(id),"
                " question TEXT NOT NULL,"
                " options JSONB NOT NULL DEFAULT '[]'::jsonb,"
                " allow_multi BOOLEAN NOT NULL DEFAULT FALSE,"
                " closed_at TIMESTAMP WITH TIME ZONE,"
                " created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
                ")"
            ))
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS poll_votes ("
                " id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                " poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,"
                " user_id UUID NOT NULL REFERENCES users(id),"
                " option_index INT NOT NULL,"
                " created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"
                " UNIQUE (poll_id, user_id, option_index)"
                ")"
            ))
            # Reference polls from chat messages so they render inline
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id UUID REFERENCES polls(id) ON DELETE SET NULL"))
            await conn.execute(text("ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS poll_id UUID REFERENCES polls(id) ON DELETE SET NULL"))
        except Exception as e:
            print(f"[boot] polls migration skipped: {e}")

        # task_dependencies — edges in the blocker→blocked task graph
        try:
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS task_dependencies ("
                " id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                " blocker_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,"
                " blocked_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,"
                " created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),"
                " UNIQUE (blocker_id, blocked_id)"
                ")"
            ))
        except Exception as e:
            print(f"[boot] task_dependencies create skipped: {e}")

        try:
            res = await conn.execute(text(
                "SELECT p.id FROM projects p "
                "WHERE NOT EXISTS (SELECT 1 FROM board_columns bc WHERE bc.project_id = p.id)"
            ))
            project_ids_without_columns = [row[0] for row in res]
            for pid in project_ids_without_columns:
                for slug, title, pos in [
                    ("todo", "To Do", 0),
                    ("in_progress", "In Progress", 1),
                    ("pending", "Pending", 2),
                    ("done", "Done", 3),
                ]:
                    await conn.execute(text(
                        "INSERT INTO board_columns (id, project_id, slug, title, position, created_at) "
                        "VALUES (gen_random_uuid(), :pid, :slug, :title, :pos, NOW())"
                    ), {"pid": str(pid), "slug": slug, "title": title, "pos": pos})
        except Exception as e:
            print(f"[boot] board_columns seed skipped: {e}")
        
    # Start background scheduler
    from app.services.scheduler import check_reminders
    scheduler_task = asyncio.create_task(check_reminders())
    
    yield
    
    # Clean up
    scheduler_task.cancel()

app = FastAPI(
    title="Cicle API",
    description="Backend API for Cicle Project Management App",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )

# Include Routers
app.include_router(auth.router, prefix="/api")
app.include_router(organizations.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(channels.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(attachments.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(subtasks.router, prefix="/api")
app.include_router(labels.router, prefix="/api")
app.include_router(labels.org_router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(notifications.presence_router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")
app.include_router(dm.router, prefix="/api")
app.include_router(google.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(announcements.router, prefix="/api")
app.include_router(board_columns.router, prefix="/api")
app.include_router(polls.router, prefix="/api")
app.include_router(reactions.router, prefix="/api")
app.include_router(file_index.router, prefix="/api")
app.include_router(task_activities.router, prefix="/api")
app.include_router(task_edit_requests.router, prefix="/api")
app.include_router(sosmed.router, prefix="/api")
app.include_router(sosmed.webhook_router, prefix="/api")


# Static Files
os.makedirs("uploads", exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "environment": settings.ENVIRONMENT}

# SOCKET.IO INTEGRATION
import socketio
from app.sockets.manager import sio

# Wrap the FastAPI app with Socket.IO ASGIApp
# This is the standard and safest way according to documentation
app = socketio.ASGIApp(sio, other_asgi_app=app)
