-- supabase/tests/20260802034000_agentic_chat_worker_stream_delivery_ack.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2C Slice 2.
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

CREATE OR REPLACE FUNCTION pg_temp.seed_ack_turn(p_suffix integer, p_generation integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_suffix text := lpad(p_suffix::text, 12, '0');
	v_user_id uuid := ('d1000000-0000-4000-8000-' || v_suffix)::uuid;
	v_session_id uuid := ('d2000000-0000-4000-8000-' || v_suffix)::uuid;
	v_job_id uuid := ('d3000000-0000-4000-8000-' || v_suffix)::uuid;
	v_turn_id uuid := ('d4000000-0000-4000-8000-' || v_suffix)::uuid;
	v_message_id uuid := ('d5000000-0000-4000-8000-' || v_suffix)::uuid;
	v_correlation_id uuid := ('d8000000-0000-4000-8000-' || v_suffix)::uuid;
	v_processing_token uuid := ('d9000000-0000-4000-8000-' || v_suffix)::uuid;
BEGIN
	INSERT INTO public.users (id) VALUES (v_user_id);
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (v_session_id, v_user_id, 'global', 'active');
	INSERT INTO public.chat_messages (
		id, session_id, user_id, role, content, metadata
	) VALUES (
		v_message_id, v_session_id, v_user_id, 'user', 'ack fixture',
		jsonb_build_object('idempotency_key', 'ack-fixture:' || p_suffix::text)
	);
	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status,
		queue_job_id, processing_token, started_at, attempts, max_attempts
	) VALUES (
		v_job_id,
		v_user_id,
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', v_turn_id::text,
			'correlationId', v_correlation_id::text
		),
		now(),
		'agentic-chat-turn:' || v_turn_id::text,
		'processing',
		'agentic_chat_ack_' || p_suffix::text,
		v_processing_token,
		now(),
		0,
		3
	);
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, worker_started_at, last_progress_at,
		last_event_sequence, user_message_id
	) VALUES (
		v_turn_id,
		v_session_id,
		v_user_id,
		'ack-fixture-' || p_suffix::text,
		'ack-client-' || p_suffix::text,
		'global',
		'ack fixture',
		'running',
		'worker_realtime',
		v_job_id,
		v_correlation_id,
		p_generation,
		now(),
		now(),
		0,
		v_message_id
	);
	INSERT INTO public.chat_turn_stream_state (
		turn_run_id, session_id, user_id, execution_generation
	) VALUES (v_turn_id, v_session_id, v_user_id, p_generation);
END;
$$;

SELECT pg_temp.seed_ack_turn(1, 1);
SELECT pg_temp.seed_ack_turn(2, 2);

DO $$
DECLARE
	v_ack regprocedure := to_regprocedure(
		'public.acknowledge_agentic_chat_stream_delivery(uuid,uuid,uuid,integer,integer)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_ack IS NOT NULL, 'delivery acknowledgement RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_ack, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_ack, 'EXECUTE')
			AND has_function_privilege('service_role', v_ack, 'EXECUTE'),
		'delivery acknowledgement grants are not service-only'
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_authenticated_stream_ack_wrapper()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.acknowledge_agentic_chat_stream_delivery(
		'd4000000-0000-4000-8000-000000000001',
		'd3000000-0000-4000-8000-000000000001',
		'd9000000-0000-4000-8000-000000000001',
		1,
		1
	);
$$;
GRANT EXECUTE ON FUNCTION public.test_authenticated_stream_ack_wrapper() TO authenticated;

SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.test_authenticated_stream_ack_wrapper()',
		'agentic_chat_stream_ack_service_role_required'
	),
	'signed-definer authenticated delivery acknowledgement bypassed the role fence'
);
RESET request.jwt.claims;
RESET ROLE;

SET ROLE service_role;

CREATE TEMP TABLE ack_results (label text PRIMARY KEY, result jsonb NOT NULL);

-- Persist sequence 1, acknowledge it exactly, and prove lost-response replay is
-- idempotent without reintroducing reconciliation state.
SELECT public.persist_agentic_chat_text_batch(
	'd4000000-0000-4000-8000-000000000001',
	'd3000000-0000-4000-8000-000000000001',
	'd9000000-0000-4000-8000-000000000001',
	1,
	'd6000000-0000-4000-8000-000000000001',
	'Hello',
	'Hello'
);
INSERT INTO ack_results VALUES (
	'exact',
	public.acknowledge_agentic_chat_stream_delivery(
		'd4000000-0000-4000-8000-000000000001',
		'd3000000-0000-4000-8000-000000000001',
		'd9000000-0000-4000-8000-000000000001',
		1,
		1
	)
);
INSERT INTO ack_results VALUES (
	'replay',
	public.acknowledge_agentic_chat_stream_delivery(
		'd4000000-0000-4000-8000-000000000001',
		'd3000000-0000-4000-8000-000000000001',
		'd9000000-0000-4000-8000-000000000001',
		1,
		1
	)
);

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'acknowledged' FROM ack_results WHERE label = 'exact')
		AND (SELECT result->>'outcome' = 'already_acknowledged' FROM ack_results WHERE label = 'replay')
		AND NOT (SELECT reconcile_required FROM public.chat_turn_stream_state WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001'),
	'exact acknowledgement or its replay did not clear idempotently'
);

-- A newer durable sequence must keep reconciliation set when an older send
-- finally reports success.
SELECT public.persist_agentic_chat_semantic_event(
	'd4000000-0000-4000-8000-000000000001',
	'd3000000-0000-4000-8000-000000000001',
	'd9000000-0000-4000-8000-000000000001',
	1,
	'd7000000-0000-4000-8000-000000000001',
	'Hello',
	'tool',
	'tool_call',
	'{"phase":"tool"}'::jsonb,
	'{"type":"tool_call","tool_name":"onto_project_read"}'::jsonb
);
INSERT INTO ack_results VALUES (
	'older',
	public.acknowledge_agentic_chat_stream_delivery(
		'd4000000-0000-4000-8000-000000000001',
		'd3000000-0000-4000-8000-000000000001',
		'd9000000-0000-4000-8000-000000000001',
		1,
		1
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'newer_snapshot' FROM ack_results WHERE label = 'older')
		AND (SELECT reconcile_required FROM public.chat_turn_stream_state WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001'),
	'an older acknowledgement cleared a newer durable snapshot'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.acknowledge_agentic_chat_stream_delivery(
			'd4000000-0000-4000-8000-000000000001',
			'd3000000-0000-4000-8000-000000000001',
			'd9000000-0000-4000-8000-000000000099',
			1,
			2
		)$$,
		'agentic_chat_stream_ack_ownership_lost'
	),
	'forged processing token acknowledged delivery'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.acknowledge_agentic_chat_stream_delivery(
			'd4000000-0000-4000-8000-000000000001',
			'd3000000-0000-4000-8000-000000000001',
			'd9000000-0000-4000-8000-000000000001',
			1,
			3
		)$$,
		'agentic_chat_stream_ack_future_sequence'
	),
	'a future sequence acknowledgement did not fail closed'
);

-- Seed current generation 2 at sequence 1 and prove a generation-1
-- acknowledgement is a typed no-op that leaves reconciliation required.
UPDATE public.chat_turn_runs
SET last_event_sequence = 1
WHERE id = 'd4000000-0000-4000-8000-000000000002';
UPDATE public.chat_turn_stream_state
SET snapshot_sequence = 1,
	durable_through_sequence = 1,
	reconcile_required = true
WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000002';
INSERT INTO ack_results VALUES (
	'stale',
	public.acknowledge_agentic_chat_stream_delivery(
		'd4000000-0000-4000-8000-000000000002',
		'd3000000-0000-4000-8000-000000000002',
		'd9000000-0000-4000-8000-000000000002',
		1,
		1
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'stale_generation' FROM ack_results WHERE label = 'stale')
		AND (SELECT reconcile_required FROM public.chat_turn_stream_state WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000002'),
	'stale-generation acknowledgement changed current reconciliation state'
);

RESET ROLE;

-- Package-only rollback proof.
BEGIN;
DROP FUNCTION public.acknowledge_agentic_chat_stream_delivery(uuid, uuid, uuid, integer, integer);
SELECT pg_temp.assert_true(
	to_regprocedure(
		'public.acknowledge_agentic_chat_stream_delivery(uuid,uuid,uuid,integer,integer)'
	) IS NULL,
	'acknowledgement RPC remained during rollback proof'
);
ROLLBACK;
SELECT pg_temp.assert_true(
	to_regprocedure(
		'public.acknowledge_agentic_chat_stream_delivery(uuid,uuid,uuid,integer,integer)'
	) IS NOT NULL,
	'rollback did not restore acknowledgement RPC'
);

DROP FUNCTION public.test_authenticated_stream_ack_wrapper();

SELECT 'phase2c_stream_delivery_ack_ok' AS proof;
