"""Main FastAPI application module."""
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.core.database import engine, Base
from app.api import auth, projects, teams, organizations, channels, tasks, attachments, events, comments, subtasks, labels, notifications, search, stats, settings as settings_api, dm, google, documents, reports, announcements, board_columns


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
