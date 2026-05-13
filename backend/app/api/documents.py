"""Documents / Wiki API."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.project import Project, ProjectMember
from app.models.document import Document
from app.schemas import DocumentCreate, DocumentUpdate, DocumentResponse

router = APIRouter(prefix="/projects/{project_id}/docs", tags=["Documents"])


async def verify_project_member(project_id: str, user_id: str, db: AsyncSession):
    """Ensure user is a member of the project."""
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Bukan anggota project")


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents in a project."""
    await verify_project_member(str(project_id), str(current_user.id), db)
    
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.creator))
        .where(Document.project_id == project_id)
        .order_by(Document.updated_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=DocumentResponse)
async def create_document(
    project_id: UUID,
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new document."""
    await verify_project_member(str(project_id), str(current_user.id), db)
    
    doc = Document(
        project_id=project_id,
        created_by=current_user.id,
        title=data.title,
        content=data.content
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    
    result = await db.execute(
        select(Document).options(selectinload(Document.creator)).where(Document.id == doc.id)
    )
    return result.scalar_one()


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    project_id: UUID,
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a document by ID."""
    await verify_project_member(str(project_id), str(current_user.id), db)
    
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.creator))
        .where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
        
    return doc


@router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    project_id: UUID,
    doc_id: UUID,
    data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a document."""
    await verify_project_member(str(project_id), str(current_user.id), db)
    
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.creator))
        .where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
        
    if data.title is not None:
        doc.title = data.title
    if data.content is not None:
        doc.content = data.content
        
    await db.commit()
    await db.refresh(doc)
    
    return doc


@router.delete("/{doc_id}")
async def delete_document(
    project_id: UUID,
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document."""
    await verify_project_member(str(project_id), str(current_user.id), db)
    
    result = await db.execute(
        select(Document)
        .where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
        
    await db.delete(doc)
    await db.commit()
    return {"message": "Dokumen berhasil dihapus"}
