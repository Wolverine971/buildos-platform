-- apps/web/supabase/migrations/20251015_add_sync_source_to_time_blocks.sql
-- Migration: Add sync_source tracking to time_blocks for webhook sync
-- This enables two-way sync between BuildOS and Google Calendar
-- Similar to task_calendar_events sync_source pattern

-- Add sync_source column to track who made the change
ALTER TABLE time_blocks
  ADD COLUMN IF NOT EXISTS sync_source TEXT DEFAULT 'app'
  CHECK (sync_source IN ('app', 'google'));

-- Add index for sync loop prevention queries
CREATE INDEX IF NOT EXISTS idx_time_blocks_sync_source_updated
  ON time_blocks(user_id, sync_source, updated_at)
  WHERE sync_source = 'app';

-- Add helpful comments
COMMENT ON COLUMN time_blocks.sync_source IS
  'Tracks the source of the last change: "app" for changes from BuildOS UI, "google" for changes from Google Calendar webhook. Used to prevent sync loops.';

-- Backfill existing rows to have sync_source = 'app'
UPDATE time_blocks
SET sync_source = 'app'
WHERE sync_source IS NULL;
