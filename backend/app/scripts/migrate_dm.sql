-- Migration: Add columns to dm_messages table
-- Run: psql -h localhost -U things -d things -f migrate_dm.sql

-- Check if is_delivered exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dm_messages' AND column_name = 'is_delivered'
  ) THEN
    ALTER TABLE dm_messages ADD COLUMN is_delivered BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dm_messages' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE dm_messages ADD COLUMN delivered_at TIMESTAMP WITH TIME ZONE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dm_messages' AND column_name = 'reactions'
  ) THEN
    ALTER TABLE dm_messages ADD COLUMN reactions JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dm_messages' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE dm_messages ADD COLUMN attachment_url VARCHAR;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dm_messages' AND column_name = 'attachment_name'
  ) THEN
    ALTER TABLE dm_messages ADD COLUMN attachment_name VARCHAR;
  END IF;
END $$;