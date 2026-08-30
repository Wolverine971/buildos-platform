-- supabase/tests/fixtures/agentic_chat_stale_legacy_turn_reaper_base.sql
-- TEST FIXTURE ONLY: minimal pre-D4b schema for a brand-new disposable database.
CREATE SCHEMA IF NOT EXISTS public;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		CREATE ROLE anon NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		CREATE ROLE authenticated NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
		CREATE ROLE service_role NOLOGIN;
	END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.users (
	id uuid PRIMARY KEY
);

CREATE TABLE public.chat_sessions (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE public.chat_turn_runs (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	stream_run_id text NOT NULL UNIQUE,
	request_message text NOT NULL,
	status text NOT NULL,
	execution_mode text NOT NULL DEFAULT 'legacy_sse',
	started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	last_progress_at timestamptz,
	finished_reason text,
	finished_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	CONSTRAINT chk_chat_turn_runs_status
		CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
	CONSTRAINT chk_chat_turn_runs_execution_mode
		CHECK (execution_mode IN ('legacy_sse', 'worker_realtime'))
);
