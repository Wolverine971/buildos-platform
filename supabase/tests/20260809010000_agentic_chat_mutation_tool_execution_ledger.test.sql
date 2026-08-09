-- Disposable PostgreSQL verification for Agentic Chat Phase 4 P2 Slice 1.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN false;
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_mutation_tool_execution(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,integer,text,text,text,jsonb,integer,integer,boolean,jsonb)',
		'EXECUTE'
	),
	'service role can persist worker mutation rows'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.persist_agentic_chat_mutation_tool_execution(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,integer,text,text,text,jsonb,integer,integer,boolean,jsonb)',
		'EXECUTE'
	) AND NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_mutation_tool_execution(uuid,uuid,uuid,uuid,integer,uuid,text,uuid,integer,text,text,text,jsonb,integer,integer,boolean,jsonb)',
		'EXECUTE'
	),
	'client roles cannot persist worker mutation rows'
);

SELECT pg_temp.seed_timing_turn(
	'f8300000-0000-4000-8000-000000000001',
	'f8400000-0000-4000-8000-000000000001',
	'f8500000-0000-4000-8000-000000000001',
	'f8600000-0000-4000-8000-000000000001',
	'f8700000-0000-4000-8000-000000000001',
	'mutation-tool-ledger',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.reserve_agentic_chat_effect(
	'f8800000-0000-5000-8000-000000000001',
	'f8300000-0000-4000-8000-000000000001',
	'f8400000-0000-4000-8000-000000000001',
	'f8500000-0000-4000-8000-000000000001',
	1,
	'update_onto_task',
	'onto.task.update',
	repeat('a', 64),
	true,
	'mutation-tool-call-1'
);
SELECT public.begin_agentic_chat_effect(
	'f8800000-0000-5000-8000-000000000001',
	'f8300000-0000-4000-8000-000000000001',
	'f8400000-0000-4000-8000-000000000001',
	'f8500000-0000-4000-8000-000000000001',
	1,
	repeat('a', 64),
	'mutation-tool-call-1'
);
SELECT public.reconcile_agentic_chat_effect(
	'f8800000-0000-5000-8000-000000000001',
	'f8300000-0000-4000-8000-000000000001',
	'f8400000-0000-4000-8000-000000000001',
	'f8500000-0000-4000-8000-000000000001',
	1,
	repeat('a', 64),
	'succeeded',
	'{"task":{"id":"dc000000-0000-4000-8000-000000000001","state_key":"done"}}'::jsonb,
	NULL
);

SELECT public.persist_agentic_chat_mutation_tool_execution(
	'f8300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'f8400000-0000-4000-8000-000000000001',
	'f8500000-0000-4000-8000-000000000001',
	1,
	'f8800000-0000-5000-8000-000000000001',
	repeat('a', 64),
	'f8900000-0000-5000-8000-000000000001',
	1,
	'mutation-tool-call-1',
	'update_onto_task',
	'onto.task.update',
	'{"task_id":"dc000000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb,
	12,
	NULL,
	false,
	'[{"id":"dc000000-0000-4000-8000-000000000001","type":"task"}]'::jsonb
) AS receipt \gset mutation_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'mutation_receipt'::jsonb->>'outcome' = 'persisted'
		AND :'mutation_receipt'::jsonb->>'effect_id' = 'f8800000-0000-5000-8000-000000000001',
	'effect-linked mutation row persisted'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1 AND bool_and(
			message_id IS NULL
			AND effect_id = 'f8800000-0000-5000-8000-000000000001'
			AND provider_tool_call_id = 'mutation-tool-call-1'
			AND tool_name = 'update_onto_task'
			AND tool_category = 'write'
			AND gateway_op = 'onto.task.update'
			AND sequence_index = 1
			AND arguments = '{"task_id":"dc000000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb
			AND result = '{"task":{"id":"dc000000-0000-4000-8000-000000000001","state_key":"done"}}'::jsonb
			AND success
		)
		FROM public.chat_tool_executions
		WHERE id = 'f8900000-0000-5000-8000-000000000001'
	),
	'exact mutation receipt is durable and linked to its effect'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_mutation_tool_execution(
	'f8300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'f8400000-0000-4000-8000-000000000001',
	'f8500000-0000-4000-8000-000000000001',
	1,
	'f8800000-0000-5000-8000-000000000001',
	repeat('a', 64),
	'f8900000-0000-5000-8000-000000000001',
	1,
	'mutation-tool-call-1',
	'update_onto_task',
	'onto.task.update',
	'{"task_id":"dc000000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb,
	12,
	NULL,
	false,
	'[{"id":"dc000000-0000-4000-8000-000000000001","type":"task"}]'::jsonb
) AS receipt \gset mutation_replay_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'mutation_replay_receipt'::jsonb->>'outcome' = 'already_persisted',
	'exact lost-response replay resolves the existing mutation row'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.persist_agentic_chat_mutation_tool_execution(
				'f8300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'f8400000-0000-4000-8000-000000000001',
				'f8500000-0000-4000-8000-000000000001', 1,
				'f8800000-0000-5000-8000-000000000001', repeat('b', 64),
				'f8900000-0000-5000-8000-000000000001', 1,
				'mutation-tool-call-1', 'update_onto_task', 'onto.task.update',
				'{"task_id":"dc000000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb,
				12, NULL, false, '[]'::jsonb
			)
		$statement$,
		'agentic_chat_mutation_tool_execution_effect_conflict'
	),
	'a changed canonical argument hash cannot alias a succeeded effect'
);
RESET ROLE;

-- A reservation is not a receipt. No tool row may be synthesized until the
-- effect itself has durably reached succeeded.
SELECT pg_temp.seed_timing_turn(
	'f7300000-0000-4000-8000-000000000001',
	'f7400000-0000-4000-8000-000000000001',
	'f7500000-0000-4000-8000-000000000001',
	'f7600000-0000-4000-8000-000000000001',
	'f7700000-0000-4000-8000-000000000001',
	'mutation-tool-not-succeeded',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.reserve_agentic_chat_effect(
	'f7800000-0000-5000-8000-000000000001',
	'f7300000-0000-4000-8000-000000000001',
	'f7400000-0000-4000-8000-000000000001',
	'f7500000-0000-4000-8000-000000000001',
	1, 'update_onto_task', 'onto.task.update', repeat('d', 64), false,
	'mutation-tool-call-reserved'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.persist_agentic_chat_mutation_tool_execution(
				'f7300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'f7400000-0000-4000-8000-000000000001',
				'f7500000-0000-4000-8000-000000000001', 1,
				'f7800000-0000-5000-8000-000000000001', repeat('d', 64),
				'f7900000-0000-5000-8000-000000000001', 1,
				'mutation-tool-call-reserved', 'update_onto_task', 'onto.task.update',
				'{"task_id":"dc000000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb,
				NULL, NULL, false, '[]'::jsonb
			)
		$statement$,
		'agentic_chat_mutation_tool_execution_effect_not_succeeded'
	),
	'a reserved effect cannot manufacture successful mutation telemetry'
);
RESET ROLE;

-- Cancellation accepted after the irreversible effect succeeded cannot hide
-- its telemetry. New mutation execution is still fenced by the live queue owner.
SELECT pg_temp.seed_timing_turn(
	'f9300000-0000-4000-8000-000000000001',
	'f9400000-0000-4000-8000-000000000001',
	'f9500000-0000-4000-8000-000000000001',
	'f9600000-0000-4000-8000-000000000001',
	'f9700000-0000-4000-8000-000000000001',
	'mutation-tool-cancel-after-commit',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.reserve_agentic_chat_effect(
	'f9800000-0000-5000-8000-000000000001',
	'f9300000-0000-4000-8000-000000000001',
	'f9400000-0000-4000-8000-000000000001',
	'f9500000-0000-4000-8000-000000000001',
	1, 'update_onto_task', 'onto.task.update', repeat('c', 64), false,
	'mutation-tool-call-cancelled'
);
SELECT public.begin_agentic_chat_effect(
	'f9800000-0000-5000-8000-000000000001',
	'f9300000-0000-4000-8000-000000000001',
	'f9400000-0000-4000-8000-000000000001',
	'f9500000-0000-4000-8000-000000000001',
	1, repeat('c', 64), 'mutation-tool-call-cancelled'
);
SELECT public.reconcile_agentic_chat_effect(
	'f9800000-0000-5000-8000-000000000001',
	'f9300000-0000-4000-8000-000000000001',
	'f9400000-0000-4000-8000-000000000001',
	'f9500000-0000-4000-8000-000000000001',
	1, repeat('c', 64), 'succeeded', '{"task":{"state_key":"done"}}'::jsonb, NULL
);
RESET ROLE;

UPDATE public.chat_turn_runs
SET cancel_requested_at = clock_timestamp(), cancel_reason = 'user_cancelled'
WHERE id = 'f9300000-0000-4000-8000-000000000001';

SET ROLE service_role;
SELECT public.persist_agentic_chat_mutation_tool_execution(
	'f9300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'f9400000-0000-4000-8000-000000000001',
	'f9500000-0000-4000-8000-000000000001',
	1,
	'f9800000-0000-5000-8000-000000000001',
	repeat('c', 64),
	'f9900000-0000-5000-8000-000000000001',
	1,
	'mutation-tool-call-cancelled',
	'update_onto_task',
	'onto.task.update',
	'{"task_id":"dc000000-0000-4000-8000-000000000001","state_key":"done"}'::jsonb,
	NULL, NULL, false, '[]'::jsonb
) AS receipt \gset mutation_cancelled_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'mutation_cancelled_receipt'::jsonb->>'outcome' = 'persisted'
		AND EXISTS (
			SELECT 1 FROM public.chat_tool_executions
			WHERE id = 'f9900000-0000-5000-8000-000000000001'
				AND effect_id = 'f9800000-0000-5000-8000-000000000001'
		),
	'post-commit cancellation does not hide the mutation receipt'
);

SELECT 'phase4_p2_slice1_mutation_tool_execution_ledger_ok' AS result;
