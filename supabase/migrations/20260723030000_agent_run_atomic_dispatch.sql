-- supabase/migrations/20260723030000_agent_run_atomic_dispatch.sql
-- 2026-07-23 queue audit P1: atomic Agent Run admission.
--
-- Two fixes:
--   1. The ordinary max-3 active-run cap was enforced only by application-side
--      count-then-insert in dispatch.ts — two concurrent dispatches could both
--      read 2 and insert runs 3 and 4, and worker-side insert paths (e.g.
--      startHereCaptureProcessor) bypassed the cap entirely. The capacity
--      trigger (which already serializes per-user with an advisory lock for
--      deep research) now also enforces the top-level cap for EVERY insert
--      path.
--   2. dispatchAgentRun performed a two-write handoff (insert agent_runs, then
--      add_queue_job): a process death between the writes stranded a queued
--      run until the sweep noticed. create_agent_run_with_job does both writes
--      in one transaction.

-- 1) Extend the capacity trigger with the ordinary top-level cap ---------------

CREATE OR REPLACE FUNCTION public.agent_run_enforce_deep_research_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_active_deep_root_id UUID;
	v_other_active_runs INTEGER;
	v_active_top_level_runs INTEGER;
BEGIN
	IF NEW.status NOT IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready') THEN
		RETURN NEW;
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::TEXT, 0));

	-- Transitions that keep an already-active run active are not new capacity
	-- reservations (worker claims, pause/resume, synthesis continuations).
	IF TG_OP = 'UPDATE'
		AND OLD.user_id = NEW.user_id
		AND OLD.status IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready')
	THEN
		RETURN NEW;
	END IF;

	IF NEW.run_template = 'deep_research' AND NEW.depth = 0 THEN
		SELECT COUNT(*)
		INTO v_other_active_runs
		FROM public.agent_runs
		WHERE user_id = NEW.user_id
			AND id <> NEW.id
			AND status IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready');

		IF v_other_active_runs > 0 THEN
			RAISE EXCEPTION 'Deep research requires all three Agent Run slots';
		END IF;
		RETURN NEW;
	END IF;

	SELECT id
	INTO v_active_deep_root_id
	FROM public.agent_runs
	WHERE user_id = NEW.user_id
		AND id <> NEW.id
		AND run_template = 'deep_research'
		AND depth = 0
		AND status IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready')
	ORDER BY created_at
	LIMIT 1;

	IF v_active_deep_root_id IS NOT NULL
		AND NEW.parent_run_id IS DISTINCT FROM v_active_deep_root_id
	THEN
		RAISE EXCEPTION 'Agent Run slots are reserved by active deep research';
	END IF;

	-- Ordinary top-level cap (max 3). Only depth-0 runs consume user slots;
	-- deep-research children ride on their coordinator's reservation.
	IF NEW.depth = 0 THEN
		SELECT COUNT(*)
		INTO v_active_top_level_runs
		FROM public.agent_runs
		WHERE user_id = NEW.user_id
			AND id <> NEW.id
			AND depth = 0
			AND status IN ('queued', 'running', 'paused', 'needs_input', 'proposal_ready');

		IF v_active_top_level_runs >= 3 THEN
			RAISE EXCEPTION 'agent_run_limit_exceeded: user already has 3 active agent runs';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;

-- (Trigger binding from 20260719020000 is unchanged; CREATE OR REPLACE above
-- swaps the function body in place.)

-- 2) Atomic run + queue-job admission -----------------------------------------

CREATE OR REPLACE FUNCTION public.create_agent_run_with_job(
	p_run jsonb,
	p_job_metadata jsonb,
	p_priority integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_run public.agent_runs;
	v_job_id uuid;
	v_job_metadata jsonb;
BEGIN
	INSERT INTO public.agent_runs (
		user_id,
		trigger,
		label,
		goal,
		instructions,
		expected_output,
		context_type,
		project_id,
		scope_mode,
		effort,
		run_template,
		allowed_ops,
		review_required,
		status,
		budgets,
		parent_run_id,
		parent_session_id,
		parent_message_id,
		depth,
		source_suggestion_id,
		source_decision
	) VALUES (
		(p_run->>'user_id')::uuid,
		p_run->>'trigger',
		p_run->>'label',
		p_run->>'goal',
		p_run->>'instructions',
		p_run->>'expected_output',
		p_run->>'context_type',
		NULLIF(p_run->>'project_id', '')::uuid,
		p_run->>'scope_mode',
		p_run->>'effort',
		p_run->>'run_template',
		CASE
			WHEN p_run ? 'allowed_ops' AND jsonb_typeof(p_run->'allowed_ops') = 'array'
			THEN ARRAY(SELECT jsonb_array_elements_text(p_run->'allowed_ops'))
			ELSE NULL
		END,
		COALESCE((p_run->>'review_required')::boolean, false),
		'queued',
		COALESCE(p_run->'budgets', '{}'::jsonb),
		NULLIF(p_run->>'parent_run_id', '')::uuid,
		NULLIF(p_run->>'parent_session_id', '')::uuid,
		NULLIF(p_run->>'parent_message_id', '')::uuid,
		COALESCE((p_run->>'depth')::integer, 0),
		NULLIF(p_run->>'source_suggestion_id', '')::uuid,
		p_run->>'source_decision'
	)
	RETURNING * INTO v_run;

	v_job_metadata := p_job_metadata || jsonb_build_object('run_id', v_run.id);

	v_job_id := public.add_queue_job(
		p_user_id := v_run.user_id,
		p_job_type := 'agent_run',
		p_metadata := v_job_metadata,
		p_priority := p_priority,
		p_scheduled_for := NOW(),
		p_dedup_key := 'agent-run:' || v_run.id
	);

	RETURN jsonb_build_object('run', to_jsonb(v_run), 'job_id', v_job_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_agent_run_with_job(jsonb, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_agent_run_with_job(jsonb, jsonb, integer) FROM anon;
REVOKE ALL ON FUNCTION public.create_agent_run_with_job(jsonb, jsonb, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_run_with_job(jsonb, jsonb, integer) TO service_role;

COMMENT ON FUNCTION public.create_agent_run_with_job(jsonb, jsonb, integer) IS
  'Atomic Agent Run admission: inserts the run and its queue job in one transaction so a process death cannot strand a queued run (2026-07-23 queue audit). Capacity is enforced by the agent_runs capacity trigger inside the same transaction.';
