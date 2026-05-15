-- Migration: Add DM message delivery/read/reaction columns
-- Jalankan: sudo docker exec -i things-backend psql -U cicle cicle < backend/scripts/migrate_dm.sql

ALTER TABLE dm_messages 
  ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- Update existing messages as delivered
UPDATE dm_messages SET is_delivered = TRUE WHERE is_delivered IS NULL;
UPDATE dm_messages SET reactions = '{}'::jsonb WHERE reactions IS NULL;