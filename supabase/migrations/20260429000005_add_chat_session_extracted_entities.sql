-- supabase/migrations/20260429000005_add_chat_session_extracted_entities.sql
-- Store structured session-close synthesis artifacts for downstream integrations.

ALTER TABLE public.chat_sessions
	ADD COLUMN IF NOT EXISTS extracted_entities jsonb;

COMMENT ON COLUMN public.chat_sessions.extracted_entities IS
'Structured entities extracted during chat session synthesis, including Libri handoff candidates.';
