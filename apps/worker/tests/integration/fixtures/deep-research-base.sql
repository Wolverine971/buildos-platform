-- apps/worker/tests/integration/fixtures/deep-research-base.sql
CREATE ROLE service_role;

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
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL,
	trigger public.agent_run_trigger NOT NULL,
	parent_run_id UUID NULL REFERENCES public.agent_runs(id),
	parent_session_id UUID NULL,
	parent_message_id UUID NULL,
	depth INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 1),
	label TEXT NOT NULL,
	goal TEXT NOT NULL,
	instructions TEXT NULL,
	expected_output TEXT NULL,
	context_type TEXT NOT NULL CHECK (context_type IN ('project', 'global')),
	project_id UUID NULL,
	scope_mode TEXT NOT NULL DEFAULT 'read_write' CHECK (scope_mode IN ('read_only', 'read_write')),
	allowed_ops TEXT[] NULL,
	review_required BOOLEAN NOT NULL DEFAULT FALSE,
	status public.agent_run_status NOT NULL DEFAULT 'queued',
	result JSONB NULL,
	change_set JSONB NULL,
	budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
	metrics JSONB NULL,
	error TEXT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	started_at TIMESTAMPTZ NULL,
	completed_at TIMESTAMPTZ NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.queue_jobs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL,
	job_type TEXT NOT NULL,
	metadata JSONB NOT NULL,
	priority INTEGER NOT NULL,
	scheduled_for TIMESTAMPTZ NOT NULL,
	dedup_key TEXT UNIQUE,
	status TEXT NOT NULL DEFAULT 'pending'
);

CREATE OR REPLACE FUNCTION public.add_queue_job(
	p_user_id UUID,
	p_job_type TEXT,
	p_metadata JSONB,
	p_priority INTEGER DEFAULT 10,
	p_scheduled_for TIMESTAMPTZ DEFAULT NOW(),
	p_dedup_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
	v_id UUID;
BEGIN
	INSERT INTO public.queue_jobs (
		user_id, job_type, metadata, priority, scheduled_for, dedup_key
	) VALUES (
		p_user_id, p_job_type, p_metadata, p_priority, p_scheduled_for, p_dedup_key
	)
	ON CONFLICT (dedup_key)
	DO UPDATE SET metadata = EXCLUDED.metadata
	RETURNING id INTO v_id;
	RETURN v_id;
END;
$$;
