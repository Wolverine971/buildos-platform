-- supabase/migrations/20260626000000_project_suggestion_chat_link.sql
-- Link project-review suggestions to their seeded discussion chat sessions.

ALTER TABLE project_suggestions
  ADD COLUMN IF NOT EXISTS chat_session_id uuid REFERENCES chat_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_suggestions_chat_session
  ON project_suggestions(chat_session_id)
  WHERE chat_session_id IS NOT NULL;
