-- supabase/migrations/20260922230100_chat_capture_checkpoints.sql
-- Tasker 95 (chat checkpoint capture), part 2 of 2.
--
-- Project chats used to be captured only when explicitly closed; in prod that
-- reached 48 of 516 project sessions over 60 days. A worker sweep now captures a
-- session once it crosses a size or turn threshold or goes idle. This adds:
--   - a per-session watermark, so each message is captured once;
--   - chat_capture_checkpoints: one row per capture that ran the model. The chat
--     subscribes to it (realtime) for the "Saved to START HERE · thinking log"
--     receipt, and Undo reads the stored before-state from it.
--
-- Rollback:
--   DROP TABLE public.chat_capture_checkpoints;
--   ALTER TABLE public.chat_sessions DROP COLUMN capture_watermark_message_id,
--     DROP COLUMN capture_watermark_at;

ALTER TABLE public.chat_sessions
	ADD COLUMN IF NOT EXISTS capture_watermark_message_id uuid,
	ADD COLUMN IF NOT EXISTS capture_watermark_at timestamptz;

COMMENT ON COLUMN public.chat_sessions.capture_watermark_at IS
	'Tasker 95: created_at of the last chat message a checkpoint capture has read. Messages after it are uncaptured.';

CREATE TABLE IF NOT EXISTS public.chat_capture_checkpoints (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE SET NULL,
	trigger text NOT NULL
		CHECK (trigger IN ('threshold', 'idle', 'close', 'backfill', 'manual')),
	status text NOT NULL CHECK (status IN ('noop', 'captured', 'failed', 'undone')),
	through_message_id uuid,
	through_message_at timestamptz,
	user_message_count integer NOT NULL DEFAULT 0,
	thinking_log_document_id uuid REFERENCES public.onto_documents(id) ON DELETE SET NULL,
	thinking_log_entry text,
	start_here_document_id uuid REFERENCES public.onto_documents(id) ON DELETE SET NULL,
	start_here_before text,
	start_here_after_updated_at timestamptz,
	applied_sections text[] NOT NULL DEFAULT '{}',
	review_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
	review_sections text[] NOT NULL DEFAULT '{}',
	details jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	undone_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_capture_checkpoints_session_created
	ON public.chat_capture_checkpoints (session_id, created_at DESC);

ALTER TABLE public.chat_capture_checkpoints ENABLE ROW LEVEL SECURITY;

-- Owners read their own receipts. Writes go through the worker (service role)
-- and the Undo endpoint's admin client after an ownership check.
DROP POLICY IF EXISTS chat_capture_checkpoints_owner_read ON public.chat_capture_checkpoints;
CREATE POLICY chat_capture_checkpoints_owner_read
	ON public.chat_capture_checkpoints FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.chat_capture_checkpoints FROM anon;
GRANT SELECT ON public.chat_capture_checkpoints TO authenticated;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
		AND NOT EXISTS (
			SELECT 1 FROM pg_publication_tables
			WHERE pubname = 'supabase_realtime'
				AND schemaname = 'public'
				AND tablename = 'chat_capture_checkpoints'
		) THEN
		ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_capture_checkpoints;
	END IF;
END;
$$;
