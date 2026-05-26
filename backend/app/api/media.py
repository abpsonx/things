"""Generic authenticated media upload — used by the rich-text editor
(announcements, etc.) to embed images and attach files."""
import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, UploadFile

from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/media", tags=["Media"])

UPLOAD_DIR = "uploads"


@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    unique = f"{uuid.uuid4()}{ext}"
    with open(os.path.join(UPLOAD_DIR, unique), "wb") as buf:
        shutil.copyfileobj(file.file, buf)
    return {"url": f"/api/uploads/{unique}", "filename": file.filename or "file"}
