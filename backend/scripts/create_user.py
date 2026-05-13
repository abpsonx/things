import asyncio
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.models.user import User
from app.core.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

async def create_admin():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Check if exists
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.email == "admin@cicle.app"))
        if result.scalar_one_or_none():
            print("❌ Akun admin@cicle.app sudah ada.")
            return

        hashed_password = pwd_context.hash("admin123")
        user = User(
            name="Admin Antigravity",
            email="admin@cicle.app",
            password_hash=hashed_password,
            is_verified=True
        )
        session.add(user)
        await session.commit()
        print("✅ Akun berhasil dibuat!")
        print("Email: admin@cicle.app")
        print("Password: admin123")

if __name__ == "__main__":
    asyncio.run(create_admin())
