-- supabase/tests/fixtures/agent_run_atomic_dispatch_base.sql
-- Minimal current Agent Run + queue substrate for atomic-dispatch verification.

CREATE ROLE service_role;
CREATE ROLE anon;
CREATE ROLE authenticated;

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

CREATE TYPE public.agent_run_trigger AS ENUM ('chat', 'manual', 'scheduled', 'event');

CREATE TABLE public.agent_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	trigger public.agent_run_trigger NOT NULL,
	parent_run_id uuid NULL REFERENCES public.agent_runs(id) ON DELETE SET NULL,
	parent_session_id uuid NULL,
	parent_message_id uuid NULL,
	depth integer NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 1),
	label text NOT NULL,
	goal text NOT NULL,
	instructions text NULL,
	expected_output text NULL,
	context_type text NOT NULL CHECK (context_type IN ('project', 'global')),
	project_id uuid NULL,
	scope_mode text NOT NULL DEFAULT 'read_write' CHECK (scope_mode IN ('read_only', 'read_write')),
	effort text NOT NULL DEFAULT 'standard' CHECK (effort IN ('standard', 'deep')),
	run_template text NOT NULL DEFAULT 'agent' CHECK (run_template IN ('agent', 'deep_research')),
	allowed_ops text[] NULL,
	review_required boolean NOT NULL DEFAULT false,
	status public.agent_run_status NOT NULL DEFAULT 'queued',
	result jsonb NULL,
	change_set jsonb NULL,
	budgets jsonb NOT NULL DEFAULT '{}'::jsonb,
	metrics jsonb NULL,
	error text NULL,
	source_suggestion_id uuid NULL,
	source_decision text NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	started_at timestamptz NULL,
	completed_at timestamptz NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	job_type text NOT NULL,
	metadata jsonb NOT NULL,
	priority integer NOT NULL,
	scheduled_for timestamptz NOT NULL,
	dedup_key text,
	status text NOT NULL DEFAULT 'pending',
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX queue_jobs_dedup_key_active_idx
	ON public.queue_jobs (dedup_key)
	WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.add_queue_job(
	p_user_id uuid,
	p_job_type text,
	p_metadata jsonb,
	p_priority integer DEFAULT 10,
	p_scheduled_for timestamptz DEFAULT now(),
	p_dedup_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
	v_job_id uuid;
BEGIN
	INSERT INTO public.queue_jobs (
		user_id,
		job_type,
		metadata,
		priority,
		scheduled_for,
		dedup_key
	) VALUES (
		p_user_id,
		p_job_type,
		p_metadata,
		p_priority,
		p_scheduled_for,
		p_dedup_key
	)
	RETURNING id INTO v_job_id;

	RETURN v_job_id;
END;
$$;
