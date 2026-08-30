-- supabase/migrations/20260830195800_fix_agent_run_atomic_dispatch_trigger_cast.sql
-- Fix atomic Agent Run admission after the production delegate_task smoke found
-- that jsonb ->> returns text while agent_runs.trigger is agent_run_trigger.

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
		(p_run->>'trigger')::public.agent_run_trigger,
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
	'Atomic Agent Run admission with typed trigger validation: inserts the run and its queue job in one transaction so a process death cannot strand a queued run (trigger cast fixed 2026-08-30).';
