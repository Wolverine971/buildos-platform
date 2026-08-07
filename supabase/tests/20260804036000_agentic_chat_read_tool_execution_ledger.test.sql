-- supabase/tests/20260804036000_agentic_chat_read_tool_execution_ledger.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 10.
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
		'public.persist_agentic_chat_read_tool_execution(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text,jsonb,jsonb,integer,boolean,integer,integer,boolean,jsonb)',
		'EXECUTE'
	),
	'service role can persist worker read-tool rows'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.persist_agentic_chat_read_tool_execution(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text,jsonb,jsonb,integer,boolean,integer,integer,boolean,jsonb)',
		'EXECUTE'
	),
	'anon cannot persist worker read-tool rows'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_read_tool_execution(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text,jsonb,jsonb,integer,boolean,integer,integer,boolean,jsonb)',
		'EXECUTE'
	),
	'authenticated cannot persist worker read-tool rows'
);

SELECT pg_temp.seed_timing_turn(
	'fb310000-0000-4000-8000-000000000001',
	'fb410000-0000-4000-8000-000000000001',
	'fb510000-0000-4000-8000-000000000001',
	'fb610000-0000-4000-8000-000000000001',
	'fb710000-0000-4000-8000-000000000001',
	'read-tool-stale',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_read_tool_execution(
	'fb310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fb410000-0000-4000-8000-000000000001',
	'fb510000-0000-4000-8000-000000000001',
	2,
	'fb810000-0000-5000-8000-000000000001',
	1,
	'read-tool-stale-1',
	'fixture_project_read',
	NULL,
	'{}'::jsonb,
	'{}'::jsonb,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	'[]'::jsonb
) AS receipt \gset read_tool_stale_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'read_tool_stale_receipt'::jsonb->>'outcome' = 'stale_generation',
	'a stale generation receives no read-tool write authority'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.chat_tool_executions
		WHERE turn_run_id = 'fb310000-0000-4000-8000-000000000001'
	),
	'stale generation created no tool row'
);

SELECT pg_temp.seed_timing_turn(
	'fb320000-0000-4000-8000-000000000001',
	'fb420000-0000-4000-8000-000000000001',
	'fb520000-0000-4000-8000-000000000001',
	'fb620000-0000-4000-8000-000000000001',
	'fb720000-0000-4000-8000-000000000001',
	'read-tool-cancelled',
	1,
	false,
	true
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_read_tool_execution(
	'fb320000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fb420000-0000-4000-8000-000000000001',
	'fb520000-0000-4000-8000-000000000001',
	1,
	'fb820000-0000-5000-8000-000000000001',
	1,
	'read-tool-cancelled-1',
	'fixture_project_read',
	NULL,
	'{}'::jsonb,
	'{}'::jsonb,
	NULL,
	NULL,
	NULL,
	NULL,
	NULL,
	'[]'::jsonb
) AS receipt \gset read_tool_cancelled_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'read_tool_cancelled_receipt'::jsonb->>'outcome' = 'cancel_requested',
	'an accepted cancellation receives no read-tool write authority'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.chat_tool_executions
		WHERE turn_run_id = 'fb320000-0000-4000-8000-000000000001'
	),
	'cancelled generation created no tool row'
);

SELECT pg_temp.seed_timing_turn(
	'fb300000-0000-4000-8000-000000000001',
	'fb400000-0000-4000-8000-000000000001',
	'fb500000-0000-4000-8000-000000000001',
	'fb600000-0000-4000-8000-000000000001',
	'fb700000-0000-4000-8000-000000000001',
	'read-tool-ledger',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_read_tool_execution(
	'fb300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fb400000-0000-4000-8000-000000000001',
	'fb500000-0000-4000-8000-000000000001',
	1,
	'fb800000-0000-5000-8000-000000000001',
	1,
	'read-tool-call-1',
	'fixture_project_read',
	'utility',
	'{"projectId":"da000000-0000-4000-8000-000000000001"}'::jsonb,
	'{"note":"Fixture project is ready."}'::jsonb,
	NULL,
	NULL,
	12,
	9,
	NULL,
	'[]'::jsonb
) AS receipt \gset read_tool_
RESET ROLE;

SELECT pg_temp.assert_true(:'read_tool_receipt'::jsonb->>'outcome' = 'persisted', 'read row persisted');
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1 AND bool_and(
			message_id IS NULL
			AND provider_tool_call_id = 'read-tool-call-1'
			AND tool_name = 'fixture_project_read'
			AND tool_category = 'utility'
			AND sequence_index = 1
			AND arguments = '{"projectId":"da000000-0000-4000-8000-000000000001"}'::jsonb
			AND result = '{"note":"Fixture project is ready."}'::jsonb
			AND execution_time_ms = 12
			AND tokens_consumed = 9
			AND success
		)
		FROM public.chat_tool_executions
		WHERE id = 'fb800000-0000-5000-8000-000000000001'
	),
	'exact unattached worker read row is durable'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_read_tool_execution(
	'fb300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fb400000-0000-4000-8000-000000000001',
	'fb500000-0000-4000-8000-000000000001',
	1,
	'fb800000-0000-5000-8000-000000000001',
	1,
	'read-tool-call-1',
	'fixture_project_read',
	'utility',
	'{"projectId":"da000000-0000-4000-8000-000000000001"}'::jsonb,
	'{"note":"Fixture project is ready."}'::jsonb,
	NULL,
	NULL,
	12,
	9,
	NULL,
	'[]'::jsonb
) AS receipt \gset read_tool_replay_
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.assert_true(
	:'read_tool_replay_receipt'::jsonb->>'outcome' = 'already_persisted',
	'exact lost-response replay resolves the existing row'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.persist_agentic_chat_read_tool_execution(
				'fb300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fb400000-0000-4000-8000-000000000001',
				'fb500000-0000-4000-8000-000000000001', 1,
				'fb800000-0000-5000-8000-000000000002', 1,
				'read-tool-call-1', 'fixture_project_read', 'utility',
				'{"projectId":"da000000-0000-4000-8000-000000000001"}'::jsonb,
				'{"note":"conflict"}'::jsonb, NULL, NULL, 12, 9, NULL, '[]'::jsonb
			)
		$statement$,
		'agentic_chat_read_tool_execution_replay_conflict'
	),
	'provider-call replay cannot alias a different deterministic execution'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.persist_agentic_chat_read_tool_execution(
				'fb300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fb400000-0000-4000-8000-000000000001',
				'fb500000-0000-4000-8000-000000000001', 1,
				'fb800000-0000-5000-8000-000000000003', 2,
				'read-tool-call-2', 'fixture_project_read', NULL,
				NULL::jsonb, '{}'::jsonb, 1, false, 1, 1, false, '[]'::jsonb
			)
		$statement$,
		'agentic_chat_read_tool_execution_invalid_payload'
	),
	'null arguments cannot create a partially canonical tool row'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.chat_tool_executions
		WHERE id = 'fb800000-0000-5000-8000-000000000003'
	),
	'invalid tool payload rolled back without a ledger row'
);
RESET ROLE;

-- Phase 4 Slice 18 S1: the ledger accepts a second provider round on the same
-- turn — sequence_index 2 under a distinct stable id, prod-compatible category.
SET ROLE service_role;
SELECT public.persist_agentic_chat_read_tool_execution(
	'fb300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fb400000-0000-4000-8000-000000000001',
	'fb500000-0000-4000-8000-000000000001',
	1,
	'fb800000-0000-5000-8000-000000000004',
	2,
	'read-tool-call-2',
	'fixture_task_read',
	'utility',
	'{"taskId":"db000000-0000-4000-8000-000000000002"}'::jsonb,
	'{"note":"Fixture task is ready."}'::jsonb,
	NULL,
	NULL,
	8,
	5,
	NULL,
	'[]'::jsonb
) AS receipt \gset read_tool_round2_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'read_tool_round2_receipt'::jsonb->>'outcome' = 'persisted',
	'second-round read row persisted'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2
			AND count(DISTINCT id) = 2
			AND array_agg(sequence_index ORDER BY sequence_index) = ARRAY[1, 2]
		FROM public.chat_tool_executions
		WHERE turn_run_id = 'fb300000-0000-4000-8000-000000000001'
	),
	'two-round turn holds two rows with distinct stable ids and sequence 1,2'
);

SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'fb300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fb400000-0000-4000-8000-000000000001',
	'fb500000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'fb900000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":2,"tool_call_count":2}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
) AS receipt \gset read_tool_final_
RESET ROLE;

SELECT pg_temp.assert_true(:'read_tool_final_receipt'::jsonb->>'outcome' = 'finalized', 'turn finalized');
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2 AND bool_and(message_id = 'fb900000-0000-4000-8000-000000000001')
		FROM public.chat_tool_executions
		WHERE turn_run_id = 'fb300000-0000-4000-8000-000000000001'
	),
	'terminal transaction attaches the assistant message to every round row'
);
-- tool_call_count is derived from the ledger; tool_round_count derivation still
-- caps at 1 because rounds are not recorded on ledger rows — recorded as a known
-- S1 divergence, owned by Slice 18 S5 finalization semantics.
SELECT pg_temp.assert_true(
	(
		SELECT tool_round_count = 1 AND tool_call_count = 2
		FROM public.chat_turn_runs
		WHERE id = 'fb300000-0000-4000-8000-000000000001'
	) AND (
		SELECT metadata->>'tool_round_count' = '1'
			AND metadata->>'tool_call_count' = '2'
		FROM public.chat_messages
		WHERE id = 'fb900000-0000-4000-8000-000000000001'
	),
	'database-derived read-tool counters override caller metadata on turn and message'
);

SELECT 'phase4_slice10_read_tool_execution_ledger_ok' AS result;
