import asyncio
from sqlalchemy import select
from app.core.database import SessionLocal
from app.models.user import User

async def check_user():
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.email == "admin@cicle.app"))
        user = result.scalar_one_or_none()
        if user:
            print(f"User: {user.name}")
            print(f"Avatar URL: {user.avatar_url}")
        else:
            print("User not found")

if __name__ == "__main__":
    asyncio.run(check_user())
