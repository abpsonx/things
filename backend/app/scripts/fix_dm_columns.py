"""Script to fix missing columns in dm_messages table.
Run: python -m app.scripts.fix_dm_columns
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import text
from app.core.database import get_db, engine
from app.models.dm import DMMessage

async def fix_columns():
    """Add missing columns to dm_messages table."""
    # Use raw SQL via connection
    async with engine.connect() as conn:
        # Check if is_delivered exists
        result = await conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name='dm_messages' AND column_name='is_delivered'")
        )
        if not result.fetchone():
            print("Adding is_delivered column...")
            await conn.execute(text("ALTER TABLE dm_messages ADD COLUMN is_delivered BOOLEAN DEFAULT FALSE"))
        
        # Check if delivered_at exists
        result = await conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name='dm_messages' AND column_name='delivered_at'")
        )
        if not result.fetchone():
            print("Adding delivered_at column...")
            await conn.execute(text("ALTER TABLE dm_messages ADD COLUMN delivered_at TIMESTAMP WITH TIME ZONE"))
        
        # Check if reactions exists
        result = await conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name='dm_messages' AND column_name='reactions'")
        )
        if not result.fetchone():
            print("Adding reactions column...")
            await conn.execute(text("ALTER TABLE dm_messages ADD COLUMN reactions JSONB DEFAULT '{}'::jsonb"))
        
        # Check if attachment_url exists
        result = await conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name='dm_messages' AND column_name='attachment_url'")
        )
        if not result.fetchone():
            print("Adding attachment_url column...")
            await conn.execute(text("ALTER TABLE dm_messages ADD COLUMN attachment_url VARCHAR"))
        
        # Check if attachment_name exists
        result = await conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name='dm_messages' AND column_name='attachment_name'")
        )
        if not result.fetchone():
            print("Adding attachment_name column...")
            await conn.execute(text("ALTER TABLE dm_messages ADD COLUMN attachment_name VARCHAR"))
        
        await conn.commit()
        print("✅ All columns added successfully!")

if __name__ == "__main__":
    asyncio.run(fix_columns())