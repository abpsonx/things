"""Main FastAPI application module."""
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.core.database import engine, Base
from app.api import auth, projects, organizations, channels, tasks, attachments, events, comments, subtasks, labels, notifications, search, stats, settings as settings_api, dm, google, documents, reports, announcements


settings = get_settings()

import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    async with engine.begin() as conn:
        # Note: In production, use Alembic for migrations
        await conn.run_sync(Base.metadata.create_all)
        
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
app.include_router(channels.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(attachments.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(subtasks.router, prefix="/api")
app.include_router(labels.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")
app.include_router(dm.router, prefix="/api")
app.include_router(google.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(announcements.router, prefix="/api")


# Static Files
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "environment": settings.ENVIRONMENT}

# SOCKET.IO INTEGRATION
import socketio
from app.sockets.manager import sio

# Wrap the FastAPI app with Socket.IO ASGIApp
# This is the standard and safest way according to documentation
app = socketio.ASGIApp(sio, other_asgi_app=app)
