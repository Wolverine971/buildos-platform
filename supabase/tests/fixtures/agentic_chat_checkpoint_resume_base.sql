-- supabase/tests/fixtures/agentic_chat_checkpoint_resume_base.sql
-- Disposable PostgreSQL fixture for the immutable checkpoint-resume lifecycle.
-- Extend the S3 checkpoint shape with only the artifact columns consumed by S4.
\ir agentic_chat_supervisor_checkpoint_base.sql

CREATE TABLE public.chat_turn_input_artifacts (
	id uuid PRIMARY KEY,
	turn_run_id uuid NOT NULL UNIQUE REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	prepared jsonb NOT NULL CHECK (jsonb_typeof(prepared) = 'object'),
	created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

ALTER TABLE public.chat_turn_runs
	ADD COLUMN input_artifact_id uuid
		REFERENCES public.chat_turn_input_artifacts(id) ON DELETE RESTRICT;

GRANT SELECT, INSERT, DELETE ON TABLE public.chat_turn_input_artifacts TO service_role;
