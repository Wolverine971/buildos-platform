-- supabase/tests/fixtures/agent_run_review_completion_guard_base.sql
-- TEST FIXTURE ONLY: minimal Agent Run substrate for a disposable PostgreSQL
-- contract test. Never apply this fixture to a linked database.

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
		CREATE ROLE service_role NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
		CREATE ROLE anon NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
		CREATE ROLE authenticated NOLOGIN;
	END IF;
END;
$$;

CREATE TYPE public.agent_run_status AS ENUM (
	'queued',
	'running',
	'paused',
	'needs_input',
	'proposal_ready',
	'completed',
	'partial',
	'failed',
	'cancelled'
);

CREATE TABLE public.agent_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	label text NOT NULL,
	goal text NOT NULL,
	scope_mode text NOT NULL DEFAULT 'read_write'
		CHECK (scope_mode IN ('read_only', 'read_write')),
	review_required boolean NOT NULL DEFAULT false,
	status public.agent_run_status NOT NULL DEFAULT 'queued',
	result jsonb NULL,
	change_set jsonb NULL,
	error text NULL,
	completed_at timestamptz NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);

\ir ../../migrations/20260831151000_agent_run_review_completion_guard.sql
