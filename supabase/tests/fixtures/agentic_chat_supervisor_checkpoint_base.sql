-- supabase/tests/fixtures/agentic_chat_supervisor_checkpoint_base.sql
-- Disposable PostgreSQL fixture for the worker supervisor checkpoint RPC.
-- This intentionally models only the pre-migration columns used by S3.

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
		CREATE ROLE service_role NOLOGIN BYPASSRLS;
	ELSE
		ALTER ROLE service_role BYPASSRLS;
	END IF;
END;
$$;

CREATE TABLE public.users (
	id uuid PRIMARY KEY
);

CREATE TABLE public.chat_sessions (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	job_type text NOT NULL,
	status text NOT NULL,
	processing_token uuid,
	dedup_key text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.chat_turn_runs (
	id uuid PRIMARY KEY,
	queue_job_id uuid REFERENCES public.queue_jobs(id) ON DELETE SET NULL,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	correlation_id uuid NOT NULL,
	execution_mode text NOT NULL,
	execution_generation integer NOT NULL,
	status text NOT NULL,
	execution_started_at timestamptz,
	cancel_requested_at timestamptz,
	cancel_reason text,
	last_progress_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at := transaction_timestamp();
	RETURN NEW;
END;
$$;

CREATE TABLE public.chat_turn_checkpoints (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	resume_turn_run_id uuid REFERENCES public.chat_turn_runs(id) ON DELETE SET NULL,
	checkpoint_type text NOT NULL,
	status text NOT NULL DEFAULT 'active',
	reason text NOT NULL,
	digest jsonb NOT NULL DEFAULT '{}'::jsonb,
	resume_context jsonb NOT NULL DEFAULT '{}'::jsonb,
	supervisor_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
	question text,
	resume_started_at timestamptz,
	resumed_at timestamptz,
	expires_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
	CONSTRAINT chk_chat_turn_checkpoints_status
		CHECK (status IN ('active', 'resuming', 'resumed', 'expired', 'cancelled')),
	CONSTRAINT chk_chat_turn_checkpoints_type CHECK (length(trim(checkpoint_type)) > 0),
	CONSTRAINT chk_chat_turn_checkpoints_reason CHECK (length(trim(reason)) > 0)
);

CREATE TRIGGER trg_chat_turn_checkpoints_updated
BEFORE UPDATE ON public.chat_turn_checkpoints
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chat_turn_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_turn_checkpoints_service_role
	ON public.chat_turn_checkpoints
	FOR ALL TO service_role
	USING (true)
	WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
	public.users,
	public.chat_sessions,
	public.queue_jobs,
	public.chat_turn_runs,
	public.chat_turn_checkpoints
TO service_role;

INSERT INTO public.users(id)
VALUES ('fa100000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions(id, user_id)
VALUES (
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001'
);

INSERT INTO public.queue_jobs(
	id, user_id, job_type, status, processing_token, dedup_key, metadata
) VALUES (
	'fc400000-0000-4000-8000-000000000004',
	'fa100000-0000-4000-8000-000000000001',
	'agentic_chat_turn',
	'processing',
	'fe600000-0000-4000-8000-000000000006',
	'agentic-chat-turn:fc300000-0000-4000-8000-000000000003',
	'{
		"turnRunId":"fc300000-0000-4000-8000-000000000003",
		"correlationId":"fd500000-0000-4000-8000-000000000005"
	}'::jsonb
);

INSERT INTO public.chat_turn_runs(
	id, queue_job_id, session_id, user_id, correlation_id, execution_mode,
	execution_generation, status, execution_started_at
) VALUES (
	'fc300000-0000-4000-8000-000000000003',
	'fc400000-0000-4000-8000-000000000004',
	'fb200000-0000-4000-8000-000000000002',
	'fa100000-0000-4000-8000-000000000001',
	'fd500000-0000-4000-8000-000000000005',
	'worker_realtime',
	1,
	'running',
	transaction_timestamp()
);

