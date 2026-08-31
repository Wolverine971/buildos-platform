-- supabase/tests/20260831151000_agent_run_review_completion_guard.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/agent_run_review_completion_guard_base.sql

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF COALESCE(p_condition, false) IS NOT TRUE THEN
		RAISE EXCEPTION 'assertion failed: %', p_message;
	END IF;
END;
$$;

INSERT INTO public.agent_runs (
	id, user_id, label, goal, scope_mode, review_required, status, result, completed_at
) VALUES
	(
		'10000000-0000-4000-8000-000000000001',
		'20000000-0000-4000-8000-000000000001',
		'Invalid review completion',
		'Stage a proposal',
		'read_write',
		true,
		'completed',
		'{"summary":"Staged it","answer":{"claimed":"proposal"}}'::jsonb,
		now()
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'20000000-0000-4000-8000-000000000001',
		'Ordinary completion',
		'Report a read-only finding',
		'read_only',
		false,
		'completed',
		'{"answer":"Done"}'::jsonb,
		now()
	),
	(
		'10000000-0000-4000-8000-000000000003',
		'20000000-0000-4000-8000-000000000001',
		'Valid reviewed commit',
		'Apply a reviewed proposal',
		'read_write',
		true,
		'completed',
		'{"answer":"Applied"}'::jsonb,
		now()
	),
	(
		'10000000-0000-4000-8000-000000000005',
		'20000000-0000-4000-8000-000000000001',
		'Empty review completion',
		'Stage at least one change',
		'read_write',
		true,
		'completed',
		'{"answer":"Nothing staged"}'::jsonb,
		now()
	);

UPDATE public.agent_runs
SET change_set = '{"status":"pending","changes":[]}'::jsonb,
	status = 'completed'
WHERE id = '10000000-0000-4000-8000-000000000005';

UPDATE public.agent_runs
SET change_set = '{"status":"committed","changes":[{"id":"change-1"}]}'::jsonb,
	status = 'completed'
WHERE id = '10000000-0000-4000-8000-000000000003';

INSERT INTO public.agent_runs (
	id, user_id, label, goal, scope_mode, review_required, status, result
) VALUES (
	'10000000-0000-4000-8000-000000000004',
	'20000000-0000-4000-8000-000000000001',
	'Invalid update completion',
	'Stage another proposal',
	'read_write',
	true,
	'running',
	'{"answer":"Working"}'::jsonb
);

UPDATE public.agent_runs
SET status = 'completed',
	result = '{"summary":"Finished","answer":"Only prose"}'::jsonb,
	completed_at = now()
WHERE id = '10000000-0000-4000-8000-000000000004';

SELECT pg_temp.assert_true(
	(
		SELECT status = 'partial'
			AND error = 'review_run_no_proposed_changes'
			AND result->>'error' = 'review_run_no_proposed_changes'
			AND result->'reported_answer' = '{"claimed":"proposal"}'::jsonb
		FROM public.agent_runs
		WHERE id = '10000000-0000-4000-8000-000000000001'
	),
	'an inserted review completion without staged changes must fail closed'
);

SELECT pg_temp.assert_true(
	(
		SELECT status = 'completed' AND result->>'answer' = 'Done'
		FROM public.agent_runs
		WHERE id = '10000000-0000-4000-8000-000000000002'
	),
	'ordinary read-only completion must remain unchanged'
);

SELECT pg_temp.assert_true(
	(
		SELECT status = 'completed'
			AND jsonb_array_length(change_set->'changes') = 1
		FROM public.agent_runs
		WHERE id = '10000000-0000-4000-8000-000000000003'
	),
	'a review completion with a durable non-empty change set must remain completed'
);

SELECT pg_temp.assert_true(
	(
		SELECT status = 'partial'
			AND result->>'error' = 'review_run_no_proposed_changes'
		FROM public.agent_runs
		WHERE id = '10000000-0000-4000-8000-000000000005'
	),
	'an empty Change Set must not satisfy the durable review completion contract'
);

SELECT pg_temp.assert_true(
	(
		SELECT status = 'partial'
			AND result->>'reported_answer' = 'Only prose'
		FROM public.agent_runs
		WHERE id = '10000000-0000-4000-8000-000000000004'
	),
	'an update into invalid completed state must fail closed'
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM pg_catalog.pg_trigger
		WHERE tgrelid = 'public.agent_runs'::regclass
			AND tgname = 'trg_agent_run_review_completion_guard'
			AND NOT tgisinternal
	),
	'the durable completion guard trigger must exist'
);

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.enforce_agent_run_review_completion()',
		'EXECUTE'
	)
		AND NOT has_function_privilege(
			'authenticated',
			'public.enforce_agent_run_review_completion()',
			'EXECUTE'
		)
		AND has_function_privilege(
			'service_role',
			'public.enforce_agent_run_review_completion()',
			'EXECUTE'
		),
	'trigger function execution privileges must remain service-only'
);

SELECT 'agent_run_review_completion_guard_ok' AS result;
