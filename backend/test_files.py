import asyncio
from sqlalchemy import select
from app.core.database import SessionLocal
from app.models.attachment import Attachment
from app.models.channel import Message

async def check_files():
    async with SessionLocal() as db:
        res = await db.execute(select(Message).where(Message.attachment_url != None))
        msgs = res.scalars().all()
        print(f"Messages with attachments: {len(msgs)}")
        for m in msgs:
            print(f"- {m.attachment_name} ({m.attachment_url})")

if __name__ == "__main__":
    asyncio.run(check_files())
