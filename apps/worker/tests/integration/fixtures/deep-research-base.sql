-- apps/worker/tests/integration/fixtures/deep-research-base.sql
CREATE ROLE service_role;
CREATE ROLE anon;
CREATE ROLE authenticated;

-- Supabase parity: hosted projects grant broad default privileges to the API
-- roles, so every function/table a migration creates starts out executable and
-- readable by anon/authenticated unless the migration explicitly revokes it.
-- This runs before the harness applies migrations so a missed revoke (like the
-- queue_deep_research_synthesis gap) is detectable instead of silently passing.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
	GRANT ALL ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
	GRANT ALL ON TABLES TO anon, authenticated;

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
	-- Production parity: 20260615000000_agent_work_phase0.sql declares
	-- parent_run_id REFERENCES agent_runs(id) ON DELETE SET NULL.
	parent_run_id UUID NULL REFERENCES public.agent_runs(id) ON DELETE SET NULL,
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
	dedup_key TEXT,
	status TEXT NOT NULL DEFAULT 'pending',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Production parity: 20260706000000_codify_queue_job_dedup.sql dedups only
-- while a job with the same key is pending/processing; a terminal job with the
-- same dedup key does not block a fresh insert.
CREATE UNIQUE INDEX queue_jobs_dedup_key_active_idx
	ON public.queue_jobs (dedup_key)
	WHERE dedup_key IS NOT NULL
		AND status IN ('pending', 'processing');

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
	v_job_id UUID;
	v_attempt INTEGER := 0;
BEGIN
	LOOP
		v_attempt := v_attempt + 1;
		v_job_id := NULL;

		INSERT INTO public.queue_jobs (
			user_id, job_type, metadata, priority, scheduled_for, dedup_key, status
		) VALUES (
			p_user_id, p_job_type, p_metadata, p_priority, p_scheduled_for, p_dedup_key, 'pending'
		)
		ON CONFLICT (dedup_key)
		WHERE dedup_key IS NOT NULL
			AND status IN ('pending', 'processing')
		DO NOTHING
		RETURNING id INTO v_job_id;

		IF v_job_id IS NOT NULL THEN
			RETURN v_job_id;
		END IF;

		IF p_dedup_key IS NOT NULL THEN
			SELECT id INTO v_job_id
			FROM public.queue_jobs
			WHERE dedup_key = p_dedup_key
				AND status IN ('pending', 'processing')
			ORDER BY created_at ASC
			LIMIT 1;

			IF v_job_id IS NOT NULL THEN
				RETURN v_job_id;
			END IF;
		END IF;

		IF v_attempt >= 2 THEN
			RAISE EXCEPTION 'Failed to create or find job with dedup_key: %', p_dedup_key;
		END IF;
	END LOOP;
END;
$$;
