from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.system_setting import SystemSetting
from app.core.permissions import is_superuser
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["Settings"])

class SettingUpdate(BaseModel):
    value: str

@router.get("")
async def get_all_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Platform settings (incl. registration codes) are sensitive — Super User /
    # Developer only.
    if not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya Super User yang bisa mengakses pengaturan platform")
    result = await db.execute(select(SystemSetting))
    settings = result.scalars().all()
    
    # Ensure registration_code exists in DB if not there
    from app.core.config import get_settings
    global_settings = get_settings()
    
    keys_to_ensure = {
        "registration_code": global_settings.REGISTRATION_CODE,
        "registration_code_staff": global_settings.REGISTRATION_CODE_STAFF
    }
    
    existing_keys = {s.key for s in settings}
    added = False
    
    for key, default_val in keys_to_ensure.items():
        if key not in existing_keys:
            new_setting = SystemSetting(key=key, value=default_val)
            db.add(new_setting)
            added = True
            
    if added:
        await db.commit()
        # Re-fetch
        result = await db.execute(select(SystemSetting))
        settings = result.scalars().all()

    return [{"key": s.key, "value": s.value} for s in settings]

@router.put("/{key}")
async def update_setting(
    key: str,
    data: SettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not is_superuser(current_user):
        raise HTTPException(status_code=403, detail="Hanya Super User yang bisa mengubah pengaturan platform")
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    
    if not setting:
        setting = SystemSetting(key=key, value=data.value)
        db.add(setting)
    else:
        setting.value = data.value
        
    await db.commit()
    return {"key": key, "value": data.value}
