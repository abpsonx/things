import asyncio
from app.core.database import engine, Base
from sqlalchemy import inspect
from app.models import *

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with engine.connect() as conn:
        tables = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
        print(f"Tables in DB now: {tables}")

if __name__ == "__main__":
    asyncio.run(create())
