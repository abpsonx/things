import asyncio
from app.core.database import engine
from sqlalchemy import text

async def test_q():
    async with engine.begin() as conn:
        query = """
        SELECT c.project_id, COUNT(m.id) as unread_count
        FROM messages m
        JOIN channels c ON m.channel_id = c.id
        WHERE m.user_id != :user_id
        AND NOT m.read_by @> cast(:search as jsonb)
        GROUP BY c.project_id
        """
        user_id = "00000000-0000-0000-0000-000000000000"
        result = await conn.execute(text(query), {"user_id": user_id, "search": f'[{{"id": "{user_id}"}}]'})
        for row in result:
            print(row)

if __name__ == "__main__":
    asyncio.run(test_q())
