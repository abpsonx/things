import asyncio
from app.core.database import engine
from sqlalchemy import text

async def alter_constraint():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE tasks DROP CONSTRAINT ck_task_status;"))
            print("Dropped constraint")
        except Exception as e:
            print("Constraint drop failed:", e)
        try:
            await conn.execute(text("ALTER TABLE tasks ADD CONSTRAINT ck_task_status CHECK (status IN ('todo', 'in_progress', 'pending', 'done'));"))
            print("Added new constraint")
        except Exception as e:
            print("Constraint add failed:", e)

if __name__ == "__main__":
    asyncio.run(alter_constraint())
