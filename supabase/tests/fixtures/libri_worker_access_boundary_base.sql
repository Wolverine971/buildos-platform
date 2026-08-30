-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the Libri worker
-- authorization boundary. Never apply this fixture to a linked database.

\ir libri_research_orchestration_base.sql

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'libri_worker') THEN
		CREATE ROLE libri_worker
			LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
			CONNECTION LIMIT 3;
	END IF;
END;
$$;

CREATE TYPE public.queue_status AS ENUM (
	'pending',
	'processing',
	'completed',
	'failed',
	'cancelled'
);

CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	queue_job_id text NOT NULL UNIQUE,
	user_id uuid NOT NULL,
	job_type public.queue_type NOT NULL,
	metadata jsonb,
	status public.queue_status NOT NULL DEFAULT 'pending',
	priority integer DEFAULT 10,
	attempts integer DEFAULT 0,
	max_attempts integer DEFAULT 3,
	scheduled_for timestamptz NOT NULL DEFAULT now(),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	started_at timestamptz,
	completed_at timestamptz,
	error_message text,
	processing_token uuid,
	result jsonb,
	dedup_key text
);

CREATE INDEX idx_queue_jobs_pending_claim_priority
	ON public.queue_jobs (job_type, priority ASC, scheduled_for ASC)
	WHERE status = 'pending';
CREATE UNIQUE INDEX idx_queue_jobs_active_dedup
	ON public.queue_jobs (dedup_key)
	WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing');

ALTER TABLE public.queue_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_jobs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.queue_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.queue_jobs TO service_role;

\ir ../../migrations/20260830181834_libri_worker_access_boundary.sql
