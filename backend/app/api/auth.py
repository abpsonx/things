"""Authentication endpoints: register, login, me, refresh."""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token, create_reset_token, verify_reset_token
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas import RegisterRequest, LoginRequest, AuthResponse, UserResponse, TokenResponse
from app.dependencies import get_current_user
from app.services.email import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    from app.core.config import get_settings
    from app.models.invitation import Invitation
    from app.models.organization import OrgMember
    settings = get_settings()

    # 1. Validate Registration Code
    from app.models.system_setting import SystemSetting
    db_admin_code = await db.execute(select(SystemSetting.value).where(SystemSetting.key == "registration_code"))
    active_admin_code = db_admin_code.scalar() or settings.REGISTRATION_CODE
    
    db_staff_code = await db.execute(select(SystemSetting.value).where(SystemSetting.key == "registration_code_staff"))
    active_staff_code = db_staff_code.scalar() or settings.REGISTRATION_CODE_STAFF

    user_role = "staff"
    if data.registration_code == active_admin_code:
        user_role = "admin"
    elif data.registration_code == active_staff_code:
        user_role = "staff"
    else:
        # Check if user is at least invited via email
        inv_result = await db.execute(select(Invitation).where(Invitation.email == data.email))
        if not inv_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Kode perusahaan salah atau email belum diundang",
            )

    # 2. Check if email already exists
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email sudah terdaftar",
        )

    # 3. Create user
    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=user_role,
        is_verified=True,  # Skip email verification for dev
    )
    db.add(user)
    await db.flush() # Get user.id

    # 4. Handle Pending Invitations
    inv_result = await db.execute(select(Invitation).where(Invitation.email == data.email))
    invitations = inv_result.scalars().all()
    for inv in invitations:
        # Add to organization
        member = OrgMember(org_id=inv.org_id, user_id=user.id, role=inv.role)
        db.add(member)
        await db.delete(inv) # Remove invitation after joining

    await db.commit()
    await db.refresh(user)

    # Generate tokens
    token_data = {"sub": str(user.id), "role": user.role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        tokens=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
        ),
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with email and password."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau password salah",
        )

    # Generate tokens
    token_data = {"sub": str(user.id), "role": user.role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        tokens=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: dict, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update current user profile."""
    if "name" in data:
        current_user.name = data["name"]
    if "daily_digest_enabled" in data:
        current_user.daily_digest_enabled = bool(data["daily_digest_enabled"])
    if "tagline" in data:
        tagline = (data.get("tagline") or "").strip()
        current_user.tagline = tagline[:120] or None

    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post("/change-password")
async def change_password(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change password for the logged-in user (needs the current password)."""
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    if not verify_password(current, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Password lama salah")
    if len(new) < 6:
        raise HTTPException(status_code=400, detail="Password baru minimal 6 karakter")
    current_user.password_hash = hash_password(new)
    await db.commit()
    return {"message": "Password berhasil diubah"}


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, data: dict, db: AsyncSession = Depends(get_db)):
    """Email a password-reset link. Always returns success (no email enumeration)."""
    email = (data.get("email") or "").strip().lower()
    generic = {"message": "Jika email terdaftar, link reset sudah dikirim ke email tersebut."}
    if not email:
        return generic
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        token = create_reset_token(str(user.id))
        base = (get_settings().FRONTEND_URL or "").rstrip("/")
        await send_password_reset_email(user.email, f"{base}/reset-password?token={token}")
    return generic


@router.post("/reset-password")
async def reset_password(data: dict, db: AsyncSession = Depends(get_db)):
    """Set a new password using the token from the reset email."""
    token = data.get("token") or ""
    new = data.get("new_password") or ""
    user_id = verify_reset_token(token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Link reset tidak valid atau sudah kedaluwarsa")
    if len(new) < 6:
        raise HTTPException(status_code=400, detail="Password baru minimal 6 karakter")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    user.password_hash = hash_password(new)
    await db.commit()
    return {"message": "Password berhasil direset. Silakan login dengan password baru."}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh token."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token tidak ditemukan")

    token = auth_header.split(" ")[1]
    payload = decode_token(token)

    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Refresh token tidak valid")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User tidak ditemukan")

    token_data = {"sub": str(user.id), "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/avatar")
async def upload_avatar(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload user avatar."""
    import os
    import uuid
    from fastapi import UploadFile
    from app.core.config import get_settings
    
    # Receive file
    form = await request.form()
    file = form.get("file")
    
    print(f"DEBUG: Received upload request from {current_user.email}")
    print(f"DEBUG: Form data keys: {list(form.keys())}")
    
    if not file or not hasattr(file, "filename"):
        print(f"DEBUG: File not found or invalid: {type(file)}")
        raise HTTPException(status_code=400, detail="File tidak ditemukan atau tidak valid")

    # Save file
    upload_dir = os.path.join(os.getcwd(), "uploads", "avatars")
    os.makedirs(upload_dir, exist_ok=True)
    
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, filename)
    
    print(f"DEBUG: Saving to {file_path}")
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        print(f"DEBUG: Error writing file: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal menulis file: {e}")

    # Update user
    settings = get_settings()
    url = f"{settings.BACKEND_URL}/uploads/avatars/{filename}"
    current_user.avatar_url = url
    
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    print(f"DEBUG: Upload successful! URL: {url}")
    return {"avatar_url": url}
