-- supabase/migrations/20260207_add_chat_session_last_classified_at.sql
-- Add last_classified_at to chat_sessions to track classification freshness

ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS last_classified_at TIMESTAMPTZ;

COMMENT ON COLUMN chat_sessions.last_classified_at IS
'Timestamp of the most recent chat classification; used to avoid reclassifying unless new messages arrive.';

UPDATE chat_sessions
SET last_classified_at = COALESCE(last_message_at, updated_at)
WHERE last_classified_at IS NULL
  AND summary IS NOT NULL;
