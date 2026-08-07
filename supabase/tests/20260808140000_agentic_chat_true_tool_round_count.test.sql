-- supabase/tests/20260808140000_agentic_chat_true_tool_round_count.test.sql
-- Disposable PostgreSQL verification for Slice 18 S5 true tool-round counts.
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
	pg_get_functiondef(
		'public.finalize_agentic_chat_turn(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb)'::regprocedure
	) LIKE '%v_tool_round_count > v_tool_call_count%',
	'installed finalizer carries the true round-count fence'
);

SELECT pg_temp.seed_timing_turn(
	'fd310000-0000-4000-8000-000000000001',
	'fd410000-0000-4000-8000-000000000001',
	'fd510000-0000-4000-8000-000000000001',
	'fd610000-0000-4000-8000-000000000001',
	'fd710000-0000-4000-8000-000000000001',
	'true-round-count-two-reads',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_read_tool_execution(
	'fd310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fd410000-0000-4000-8000-000000000001',
	'fd510000-0000-4000-8000-000000000001',
	1,
	'fd810000-0000-5000-8000-000000000001',
	1,
	'true-round-call-1',
	'get_workspace_overview',
	'read',
	'{}'::jsonb,
	'{"scope":"workspace"}'::jsonb,
	NULL,
	NULL,
	5,
	NULL,
	NULL,
	'[]'::jsonb
);
SELECT public.persist_agentic_chat_read_tool_execution(
	'fd310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fd410000-0000-4000-8000-000000000001',
	'fd510000-0000-4000-8000-000000000001',
	1,
	'fd810000-0000-5000-8000-000000000002',
	2,
	'true-round-call-2',
	'get_project_overview',
	'read',
	'{"project_id":"da000000-0000-4000-8000-000000000001"}'::jsonb,
	'{"scope":"project"}'::jsonb,
	NULL,
	NULL,
	7,
	NULL,
	NULL,
	'[]'::jsonb
);
SELECT public.finalize_agentic_chat_turn(
	'fd310000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fd410000-0000-4000-8000-000000000001',
	'fd510000-0000-4000-8000-000000000001',
	1,
	'completed',
	'stop',
	NULL,
	'fd910000-0000-4000-8000-000000000001',
	'fixture answer',
	'{"completion_status":"completed","answer_source":"model","tool_round_count":2,"tool_call_count":2}'::jsonb,
	10,
	6,
	16,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","finished_reason":"stop"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT tool_round_count = 2 AND tool_call_count = 2
		FROM public.chat_turn_runs
		WHERE id = 'fd310000-0000-4000-8000-000000000001'
	) AND (
		SELECT metadata->>'tool_round_count' = '2'
			AND metadata->>'tool_call_count' = '2'
		FROM public.chat_messages
		WHERE id = 'fd910000-0000-4000-8000-000000000001'
	),
	'two durable calls across two rounds retain the executor-owned round count'
);

-- If an interrupted worker loses the successful ledger-RPC response, the row
-- is authoritative but the in-memory counter can still be zero. Failed turns
-- use a conservative one-round floor instead of deadlocking terminal recovery.
SELECT pg_temp.seed_timing_turn(
	'fd320000-0000-4000-8000-000000000001',
	'fd420000-0000-4000-8000-000000000001',
	'fd520000-0000-4000-8000-000000000001',
	'fd620000-0000-4000-8000-000000000001',
	'fd720000-0000-4000-8000-000000000001',
	'true-round-count-interrupted',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_read_tool_execution(
	'fd320000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fd420000-0000-4000-8000-000000000001',
	'fd520000-0000-4000-8000-000000000001',
	1,
	'fd820000-0000-5000-8000-000000000001',
	1,
	'interrupted-round-call-1',
	'get_workspace_overview',
	'read',
	'{}'::jsonb,
	'{"scope":"workspace"}'::jsonb,
	NULL,
	NULL,
	5,
	NULL,
	NULL,
	'[]'::jsonb
);
SELECT public.finalize_agentic_chat_turn(
	'fd320000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fd420000-0000-4000-8000-000000000001',
	'fd520000-0000-4000-8000-000000000001',
	1,
	'failed',
	'worker_interrupted',
	'worker_interrupted',
	NULL,
	'fixture answer',
	'{"tool_round_count":0,"tool_call_count":0}'::jsonb,
	NULL,
	NULL,
	NULL,
	'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
	'{"type":"done","status":"failed","finished_reason":"worker_interrupted","failure_code":"worker_interrupted","usage":{"total_tokens":0}}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'failed' AND tool_round_count = 1 AND tool_call_count = 1
		FROM public.chat_turn_runs
		WHERE id = 'fd320000-0000-4000-8000-000000000001'
	),
	'interrupted terminal recovery floors a committed unknown round to one'
);

SELECT pg_temp.seed_timing_turn(
	'fd300000-0000-4000-8000-000000000001',
	'fd400000-0000-4000-8000-000000000001',
	'fd500000-0000-4000-8000-000000000001',
	'fd600000-0000-4000-8000-000000000001',
	'fd700000-0000-4000-8000-000000000001',
	'true-round-count',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.finalize_agentic_chat_turn(
				'fd300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fd400000-0000-4000-8000-000000000001',
				'fd500000-0000-4000-8000-000000000001',
				1,
				'completed',
				'stop',
				NULL,
				'fd900000-0000-4000-8000-000000000001',
				'fixture answer',
				'{"completion_status":"completed","answer_source":"model","tool_round_count":1,"tool_call_count":0}'::jsonb,
				10,
				6,
				16,
				'{"version":"agentic_chat_ui_projection_v1","semantic_events":[]}'::jsonb,
				'{"type":"done","finished_reason":"stop"}'::jsonb
			)
		$statement$,
		'agentic_chat_finalize_invalid_tool_counts'
	),
	'a no-tool turn cannot claim a positive tool-round count'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'running' AND assistant_message_id IS NULL
		FROM public.chat_turn_runs
		WHERE id = 'fd300000-0000-4000-8000-000000000001'
	) AND NOT EXISTS (
		SELECT 1
		FROM public.chat_messages
		WHERE id = 'fd900000-0000-4000-8000-000000000001'
	),
	'invalid round metadata rolls back the terminal transaction'
);

SELECT 'phase4_slice18_true_tool_round_count_ok' AS result;
