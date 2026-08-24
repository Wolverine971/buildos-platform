-- supabase/tests/fixtures/agentic_chat_voice_note_group_base.sql
-- Minimal hosted voice-note group shape for worker-admission trigger tests.

CREATE TABLE public.voice_note_groups (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	linked_entity_type text,
	linked_entity_id uuid,
	chat_session_id uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
	status text NOT NULL DEFAULT 'draft',
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voice_note_groups TO service_role;
