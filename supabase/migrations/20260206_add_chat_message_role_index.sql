-- supabase/migrations/20260206_add_chat_message_role_index.sql
-- Speed up tool-result lookups by session + role + recency.

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_role_created_at
  ON chat_messages (session_id, role, created_at DESC);
