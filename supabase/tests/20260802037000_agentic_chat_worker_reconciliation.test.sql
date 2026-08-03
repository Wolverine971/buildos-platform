-- supabase/tests/20260802037000_agentic_chat_worker_reconciliation.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2C Slice 5.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS dblink;

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

CREATE OR REPLACE FUNCTION pg_temp.seed_reconcile_turn(
	p_suffix integer,
	p_status text DEFAULT 'running',
	p_execution_mode text DEFAULT 'worker_realtime',
	p_generation integer DEFAULT 1,
	p_with_stream boolean DEFAULT true
)
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
BEGIN
	INSERT INTO public.users (id) VALUES (v_user_id);
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (v_session_id, v_user_id, 'global', 'active');
	INSERT INTO public.chat_messages (
		id, session_id, user_id, role, content, metadata
	) VALUES (
		v_message_id, v_session_id, v_user_id, 'user', 'reconcile fixture',
		jsonb_build_object('idempotency_key', 'reconcile-fixture:' || p_suffix::text)
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
		CASE WHEN p_status = 'queued' THEN 'pending'::queue_status ELSE 'processing'::queue_status END,
		'agentic_chat_reconcile_' || p_suffix::text,
		CASE
			WHEN p_status = 'queued' THEN NULL
			ELSE ('d9000000-0000-4000-8000-' || v_suffix)::uuid
		END,
		CASE WHEN p_status = 'queued' THEN NULL ELSE now() END,
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
		'reconcile-stream-' || p_suffix::text,
		'reconcile-client-' || p_suffix::text,
		'global',
		'reconcile fixture',
		p_status,
		p_execution_mode,
		v_job_id,
		v_correlation_id,
		p_generation,
		CASE WHEN p_status = 'queued' THEN NULL ELSE now() END,
		now(),
		0,
		v_message_id
	);
	IF p_with_stream THEN
		INSERT INTO public.chat_turn_stream_state (
			turn_run_id, session_id, user_id, execution_generation
		) VALUES (v_turn_id, v_session_id, v_user_id, p_generation);
	END IF;
END;
$$;

-- Current worker turn begins at generation one so a retained prior-generation
-- event can be created before the realistic claim/reset to generation two.
SELECT pg_temp.seed_reconcile_turn(1);
INSERT INTO public.chat_turn_events (
	turn_run_id, session_id, user_id, stream_run_id, execution_generation,
	sequence_index, event_id, phase, event_type, payload
) VALUES (
	'd4000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	'reconcile-stream-1', 1, 1,
	'd4000000-0000-4000-8000-000000000001:1:1',
	'llm', 'timing', '{"type":"timing","generation":1}'
);
UPDATE public.chat_turn_runs
SET execution_generation = 2, last_event_sequence = 0
WHERE id = 'd4000000-0000-4000-8000-000000000001';
UPDATE public.chat_turn_stream_state
SET execution_generation = 2,
	snapshot_sequence = 0,
	durable_through_sequence = 0,
	projection_durable_sequence = 0,
	assistant_text = '',
	projection = '{}',
	reconcile_required = false
WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001';
INSERT INTO public.chat_turn_events (
	turn_run_id, session_id, user_id, stream_run_id, execution_generation,
	sequence_index, event_id, phase, event_type, payload
) VALUES
	(
		'd4000000-0000-4000-8000-000000000001',
		'd2000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001',
		'reconcile-stream-1', 2, 2,
		'd4000000-0000-4000-8000-000000000001:2:2',
		'tool', 'tool_call', '{"type":"tool_call","tool_name":"read_project"}'
	),
	(
		'd4000000-0000-4000-8000-000000000001',
		'd2000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001',
		'reconcile-stream-1', 2, 3,
		'd4000000-0000-4000-8000-000000000001:2:3',
		'tool', 'tool_result', '{"type":"tool_result","ok":true}'
	);
UPDATE public.chat_turn_runs
SET last_event_sequence = 4
WHERE id = 'd4000000-0000-4000-8000-000000000001';
UPDATE public.chat_turn_stream_state
SET snapshot_sequence = 4,
	durable_through_sequence = 4,
	projection_durable_sequence = 2,
	assistant_text = 'Hello',
	projection = '{"phase":"tool","historyThrough":2}',
	reconcile_required = true
WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001';

-- Empty queued snapshot, legacy-mode rejection, terminal snapshot, event-window
-- corruption case, and the generation-reset concurrency fixture.
SELECT pg_temp.seed_reconcile_turn(2, 'queued', 'worker_realtime', 0, false);
SELECT pg_temp.seed_reconcile_turn(3, 'running', 'legacy_sse', 0, false);
SELECT pg_temp.seed_reconcile_turn(4);
SELECT pg_temp.seed_reconcile_turn(5);
SELECT pg_temp.seed_reconcile_turn(6);
SELECT pg_temp.seed_reconcile_turn(7);

INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, metadata,
	prompt_tokens, completion_tokens, total_tokens
) VALUES (
	'd6000000-0000-4000-8000-000000000004',
	'd2000000-0000-4000-8000-000000000004',
	'd1000000-0000-4000-8000-000000000004',
	'assistant', 'Complete answer',
	'{"turn_run_id":"d4000000-0000-4000-8000-000000000004","execution_generation":1}',
	10, 5, 15
);
INSERT INTO public.chat_turn_events (
	turn_run_id, session_id, user_id, stream_run_id, execution_generation,
	sequence_index, event_id, phase, event_type, payload
) VALUES (
	'd4000000-0000-4000-8000-000000000004',
	'd2000000-0000-4000-8000-000000000004',
	'd1000000-0000-4000-8000-000000000004',
	'reconcile-stream-4', 1, 1,
	'd4000000-0000-4000-8000-000000000004:1:1',
	'finalize', 'done', '{"type":"done","status":"completed"}'
);
UPDATE public.chat_turn_stream_state
SET snapshot_sequence = 1,
	durable_through_sequence = 1,
	projection_durable_sequence = 1,
	assistant_text = 'Complete answer',
	projection = '{"terminal":{"status":"completed"}}',
	reconcile_required = true
WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000004';
UPDATE public.chat_turn_runs
SET status = 'completed',
	assistant_message_id = 'd6000000-0000-4000-8000-000000000004',
	finished_reason = 'stop',
	finished_at = now(),
	terminal_event_id = 'd4000000-0000-4000-8000-000000000004:1:1',
	terminalized_at = now(),
	last_event_sequence = 1
WHERE id = 'd4000000-0000-4000-8000-000000000004';

INSERT INTO public.chat_turn_events (
	turn_run_id, session_id, user_id, stream_run_id, execution_generation,
	sequence_index, event_id, phase, event_type, payload
)
SELECT
	'd4000000-0000-4000-8000-000000000005',
	'd2000000-0000-4000-8000-000000000005',
	'd1000000-0000-4000-8000-000000000005',
	'reconcile-stream-5', 1, sequence_index,
	'd4000000-0000-4000-8000-000000000005:1:' || sequence_index::text,
	'llm', 'timing', jsonb_build_object('type', 'timing', 'index', sequence_index)
FROM generate_series(1, 65) AS sequence_index;
UPDATE public.chat_turn_runs
SET last_event_sequence = 65
WHERE id = 'd4000000-0000-4000-8000-000000000005';
UPDATE public.chat_turn_stream_state
SET snapshot_sequence = 65,
	durable_through_sequence = 65,
	projection_durable_sequence = 0,
	reconcile_required = true
WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000005';

UPDATE public.chat_turn_runs
SET last_event_sequence = 1
WHERE id = 'd4000000-0000-4000-8000-000000000006';
UPDATE public.chat_turn_stream_state
SET snapshot_sequence = 1,
	durable_through_sequence = 1,
	assistant_text = 'old generation',
	reconcile_required = true
WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000006';

DO $$
DECLARE
	v_reconcile regprocedure := to_regprocedure(
		'public.reconcile_agentic_chat_turn(uuid,uuid,integer,integer)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_reconcile IS NOT NULL, 'reconciliation RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_reconcile, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_reconcile, 'EXECUTE')
			AND has_function_privilege('service_role', v_reconcile, 'EXECUTE'),
		'reconciliation RPC grants are not service-only'
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_authenticated_reconcile_wrapper()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001',
		2,
		0
	);
$$;
GRANT EXECUTE ON FUNCTION public.test_authenticated_reconcile_wrapper() TO authenticated;

SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.test_authenticated_reconcile_wrapper()',
		'agentic_chat_reconcile_service_role_required'
	),
	'signed-definer authenticated reconciliation bypassed the role fence'
);
RESET request.jwt.claims;
RESET ROLE;

SET ROLE service_role;
CREATE TEMP TABLE reconcile_results (label text PRIMARY KEY, result jsonb);
INSERT INTO reconcile_results VALUES
	('current', public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001', 2, 0
	)),
	('current_after_three', public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001', 2, 3
	)),
	('stale_generation', public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001', 1, 999
	)),
	('queued', public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000002',
		'd1000000-0000-4000-8000-000000000002', 0, 0
	)),
	('legacy', public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000003',
		'd1000000-0000-4000-8000-000000000003', 0, 0
	)),
	('terminal', public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000004',
		'd1000000-0000-4000-8000-000000000004', 1, 0
	)),
	('missing', public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000099',
		'd1000000-0000-4000-8000-000000000001', NULL, 0
	)),
	('foreign', public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000002', NULL, 0
	));

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'reconciled'
		AND (result->>'execution_generation')::integer = 2
		AND NOT (result->>'generation_changed')::boolean
		AND result->>'text' = 'Hello'
		AND result->'projection'->>'historyThrough' = '2'
		AND (result->>'snapshot_sequence')::integer = 4
		AND (result->>'durable_through_sequence')::integer = 4
		AND (result->>'projection_durable_sequence')::integer = 2
		AND (result->>'response_watermark')::integer = 4
		AND jsonb_array_length(result->'durable_events') = 1
		AND result->'durable_events'->0->>'event_id'
			= 'd4000000-0000-4000-8000-000000000001:2:3'
		AND result->'durable_events'->0->>'contract_version' = 'agentic_chat_worker_v1'
		AND result->'durable_events'->0->>'type' = 'tool_result'
		FROM reconcile_results WHERE label = 'current'),
	'current reconciliation did not return the complete snapshot and post-projection event'
);
SELECT pg_temp.assert_true(
	(SELECT jsonb_array_length(result->'durable_events') = 0
		AND (result->>'response_watermark')::integer = 4
		FROM reconcile_results WHERE label = 'current_after_three'),
	'caller durable cursor was ignored'
);
SELECT pg_temp.assert_true(
	(SELECT (result->>'generation_changed')::boolean
		AND (result->>'execution_generation')::integer = 2
		AND jsonb_array_length(result->'durable_events') = 1
		FROM reconcile_results WHERE label = 'stale_generation'),
	'stale generation did not ignore its cursor and return current truth'
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'reconciled'
		AND result->>'status' = 'queued'
		AND result->>'text' = ''
		AND (result->>'snapshot_sequence')::integer = 0
		AND result->'projection' = '{}'::jsonb
		FROM reconcile_results WHERE label = 'queued'),
	'queued worker turn did not produce an empty generation-zero snapshot'
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'not_worker_turn'
		FROM reconcile_results WHERE label = 'legacy'),
	'legacy turn entered the worker reconciliation contract'
);
SELECT pg_temp.assert_true(
	(SELECT result->>'status' = 'completed'
		AND result->>'terminal_event_id'
			= 'd4000000-0000-4000-8000-000000000004:1:1'
		AND result->'assistant_message'->>'id'
			= 'd6000000-0000-4000-8000-000000000004'
		AND result->'assistant_message'->>'content' = 'Complete answer'
		FROM reconcile_results WHERE label = 'terminal'),
	'terminal reconciliation omitted immutable terminal message truth'
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'not_found' FROM reconcile_results WHERE label = 'missing')
		AND (SELECT result->>'outcome' = 'not_found'
			FROM reconcile_results WHERE label = 'foreign'),
	'missing and foreign-owned turns were distinguishable'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.reconcile_agentic_chat_turn(
			'd4000000-0000-4000-8000-000000000001',
			'd1000000-0000-4000-8000-000000000001', 2, 5
		)$$,
		'agentic_chat_reconcile_cursor_ahead'
	),
	'same-generation cursor ahead of durable truth was accepted'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.reconcile_agentic_chat_turn(
			'd4000000-0000-4000-8000-000000000001',
			'd1000000-0000-4000-8000-000000000001', NULL, 1
		)$$,
		'agentic_chat_reconcile_invalid_cursor'
	),
	'cursor without an execution generation was accepted'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.reconcile_agentic_chat_turn(
			'd4000000-0000-4000-8000-000000000005',
			'd1000000-0000-4000-8000-000000000005', 1, 0
		)$$,
		'agentic_chat_reconcile_event_window_exceeded'
	),
	'over-bound durable event window was returned'
);

UPDATE public.chat_turn_runs
SET last_event_sequence = 1
WHERE id = 'd4000000-0000-4000-8000-000000000007';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.reconcile_agentic_chat_turn(
			'd4000000-0000-4000-8000-000000000007',
			'd1000000-0000-4000-8000-000000000007', 1, 0
		)$$,
		'agentic_chat_reconcile_stream_state_corrupt'
	),
	'turn/stream cursor mismatch was returned as a valid snapshot'
);
RESET ROLE;

-- Genuine two-connection race: a claim-like generation reset owns the turn
-- lock while reconciliation begins. Reconciliation must wait, then return only
-- the new generation and its reset stream state.
CREATE OR REPLACE FUNCTION public.test_advance_reconcile_generation()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	UPDATE public.chat_turn_runs
	SET execution_generation = 2,
		last_event_sequence = 0,
		updated_at = clock_timestamp()
	WHERE id = 'd4000000-0000-4000-8000-000000000006';
	PERFORM pg_sleep(0.5);
	UPDATE public.chat_turn_stream_state
	SET execution_generation = 2,
		snapshot_sequence = 0,
		durable_through_sequence = 0,
		projection_durable_sequence = 0,
		assistant_text = '',
		projection = '{}',
		reconcile_required = false
	WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000006';
END;
$$;

SELECT dblink_connect('reconcile_writer', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_connect('reconcile_reader', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_send_query('reconcile_writer',
	'SELECT public.test_advance_reconcile_generation()');
SELECT pg_sleep(0.1);
SELECT dblink_send_query('reconcile_reader', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.reconcile_agentic_chat_turn(
		'd4000000-0000-4000-8000-000000000006',
		'd1000000-0000-4000-8000-000000000006', 1, 1
	) FROM trusted
$query$);
CREATE TEMP TABLE concurrent_reconcile_result (result jsonb);
SELECT result FROM dblink_get_result('reconcile_writer', false) AS response(result text);
INSERT INTO concurrent_reconcile_result
SELECT result FROM dblink_get_result('reconcile_reader', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'reconciled'
		AND (result->>'generation_changed')::boolean
		AND (result->>'execution_generation')::integer = 2
		AND result->>'text' = ''
		AND (result->>'snapshot_sequence')::integer = 0
		FROM concurrent_reconcile_result),
	'concurrent reconciliation mixed the new generation with old stream state'
);
SELECT dblink_disconnect('reconcile_writer');
SELECT dblink_disconnect('reconcile_reader');
DROP FUNCTION public.test_advance_reconcile_generation();

-- Package-only rollback proof.
BEGIN;
DROP FUNCTION public.reconcile_agentic_chat_turn(uuid, uuid, integer, integer);
SELECT pg_temp.assert_true(
	to_regprocedure('public.reconcile_agentic_chat_turn(uuid,uuid,integer,integer)') IS NULL,
	'reconciliation RPC remained during rollback proof'
);
ROLLBACK;
SELECT pg_temp.assert_true(
	to_regprocedure('public.reconcile_agentic_chat_turn(uuid,uuid,integer,integer)') IS NOT NULL,
	'rollback did not restore reconciliation RPC'
);

SELECT 'phase2c_reconciliation_ok' AS proof;
