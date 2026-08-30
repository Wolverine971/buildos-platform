-- supabase/tests/20260830195800_agent_run_atomic_dispatch_trigger_cast.test.sql
-- Executable contract for create_agent_run_with_job trigger typing + atomic receipt.

DO $$
DECLARE
	v_user_id uuid := '10000000-0000-4000-8000-000000000001';
	v_project_id uuid := '20000000-0000-4000-8000-000000000001';
	v_session_id uuid := '30000000-0000-4000-8000-000000000001';
	v_receipt jsonb;
	v_run_id uuid;
	v_job_id uuid;
	v_function_def text;
BEGIN
	SELECT pg_get_functiondef(
		'public.create_agent_run_with_job(jsonb,jsonb,integer)'::regprocedure
	)
	INTO v_function_def;

	IF position('(p_run->>''trigger'')::public.agent_run_trigger' IN v_function_def) = 0 THEN
		RAISE EXCEPTION 'atomic dispatch must cast trigger text to agent_run_trigger';
	END IF;

	v_receipt := public.create_agent_run_with_job(
		jsonb_build_object(
			'user_id', v_user_id,
			'trigger', 'chat',
			'label', 'Review campaign proposal',
			'goal', 'Stage one reviewable campaign change set',
			'instructions', 'Do not apply the staged changes.',
			'expected_output', 'One pending change set.',
			'context_type', 'project',
			'project_id', v_project_id,
			'scope_mode', 'read_write',
			'effort', 'standard',
			'run_template', 'agent',
			'allowed_ops', NULL,
			'review_required', true,
			'budgets', jsonb_build_object('max_tool_calls', 30, 'max_cost_usd', 0.5),
			'parent_session_id', v_session_id,
			'depth', 0
		),
		jsonb_build_object('correlationId', 'dispatch-contract'),
		7
	);

	v_run_id := (v_receipt->'run'->>'id')::uuid;
	v_job_id := (v_receipt->>'job_id')::uuid;

	IF NOT EXISTS (
		SELECT 1
		FROM public.agent_runs
		WHERE id = v_run_id
			AND user_id = v_user_id
			AND trigger = 'chat'
			AND project_id = v_project_id
			AND scope_mode = 'read_write'
			AND review_required
			AND status = 'queued'
	) THEN
		RAISE EXCEPTION 'typed Agent Run receipt did not match the inserted row';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM public.queue_jobs
		WHERE id = v_job_id
			AND user_id = v_user_id
			AND job_type = 'agent_run'
			AND metadata->>'run_id' = v_run_id::text
			AND dedup_key = 'agent-run:' || v_run_id
	) THEN
		RAISE EXCEPTION 'queue job was not atomically correlated to the Agent Run';
	END IF;

	BEGIN
		PERFORM public.create_agent_run_with_job(
			jsonb_build_object(
				'user_id', v_user_id,
				'trigger', 'not-a-trigger',
				'label', 'Invalid run',
				'goal', 'This must fail',
				'context_type', 'project',
				'project_id', v_project_id,
				'scope_mode', 'read_write',
				'effort', 'standard',
				'run_template', 'agent'
			),
			'{}'::jsonb,
			7
		);
		RAISE EXCEPTION 'invalid trigger unexpectedly dispatched';
	EXCEPTION
		WHEN invalid_text_representation THEN NULL;
	END;

	IF (SELECT count(*) FROM public.agent_runs) <> 1
		OR (SELECT count(*) FROM public.queue_jobs) <> 1
	THEN
		RAISE EXCEPTION 'failed dispatch left a partial run or queue job';
	END IF;

	IF has_function_privilege('anon', 'public.create_agent_run_with_job(jsonb,jsonb,integer)', 'EXECUTE')
		OR has_function_privilege('authenticated', 'public.create_agent_run_with_job(jsonb,jsonb,integer)', 'EXECUTE')
		OR NOT has_function_privilege('service_role', 'public.create_agent_run_with_job(jsonb,jsonb,integer)', 'EXECUTE')
	THEN
		RAISE EXCEPTION 'atomic dispatch function privileges are broader than service_role';
	END IF;
END;
$$;

SELECT 'agent_run_atomic_dispatch_trigger_cast_ok';
