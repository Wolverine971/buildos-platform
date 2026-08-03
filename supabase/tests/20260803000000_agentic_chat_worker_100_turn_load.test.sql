-- Disposable PostgreSQL measurement for the Agentic Chat Phase 2D 100-turn
-- synthetic fixture. PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against
-- a linked database. Seed cost is deliberately outside the measured window.

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

CREATE OR REPLACE FUNCTION pg_temp.seed_load_turn(p_suffix integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_suffix text := lpad(p_suffix::text, 12, '0');
	v_user_id uuid := ('f1000000-0000-4000-8000-' || v_suffix)::uuid;
	v_session_id uuid := ('f2000000-0000-4000-8000-' || v_suffix)::uuid;
	v_job_id uuid := ('f3000000-0000-4000-8000-' || v_suffix)::uuid;
	v_turn_id uuid := ('f4000000-0000-4000-8000-' || v_suffix)::uuid;
	v_message_id uuid := ('f5000000-0000-4000-8000-' || v_suffix)::uuid;
	v_correlation_id uuid := ('f8000000-0000-4000-8000-' || v_suffix)::uuid;
	v_processing_token uuid := ('f9000000-0000-4000-8000-' || v_suffix)::uuid;
BEGIN
	INSERT INTO public.users (id) VALUES (v_user_id);
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (v_session_id, v_user_id, 'global', 'active');
	INSERT INTO public.chat_messages (
		id, session_id, user_id, role, content, metadata
	) VALUES (
		v_message_id,
		v_session_id,
		v_user_id,
		'user',
		'100-turn load fixture',
		jsonb_build_object('idempotency_key', 'load-fixture:' || p_suffix::text)
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
		'agentic_chat_load_' || p_suffix::text,
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
		'load-stream-' || p_suffix::text,
		'load-client-' || p_suffix::text,
		'global',
		'100-turn load fixture',
		'running',
		'worker_realtime',
		v_job_id,
		v_correlation_id,
		1,
		now(),
		now(),
		0,
		v_message_id
	);
	INSERT INTO public.chat_turn_stream_state (
		turn_run_id, session_id, user_id, execution_generation
	) VALUES (v_turn_id, v_session_id, v_user_id, 1);
END;
$$;

SELECT pg_temp.seed_load_turn(suffix)
FROM generate_series(1, 100) AS suffix;

CREATE TEMP TABLE load_batch AS
SELECT jsonb_agg(
	jsonb_build_object(
		'turn_run_id', ('f4000000-0000-4000-8000-' || lpad(suffix::text, 12, '0'))::uuid,
		'queue_job_id', ('f3000000-0000-4000-8000-' || lpad(suffix::text, 12, '0'))::uuid,
		'processing_token', ('f9000000-0000-4000-8000-' || lpad(suffix::text, 12, '0'))::uuid,
		'execution_generation', 1,
		'batch_id', ('f6000000-0000-4000-8000-' || lpad(suffix::text, 12, '0'))::uuid,
		'text_delta', repeat('x', 1024),
		'assistant_text', repeat('x', 1024)
	)
	ORDER BY suffix
) AS payload
FROM generate_series(1, 100) AS suffix;

CREATE TEMP TABLE cancel_batch AS
SELECT jsonb_agg(
	jsonb_build_object(
		'turn_run_id', ('f4000000-0000-4000-8000-' || lpad(suffix::text, 12, '0'))::uuid,
		'execution_generation', 1
	)
	ORDER BY suffix
) AS payload
FROM generate_series(1, 100) AS suffix;

GRANT SELECT ON load_batch, cancel_batch TO service_role;

CREATE TEMP TABLE load_measurement (
	before_lsn pg_lsn NOT NULL,
	started_at timestamptz NOT NULL,
	flush_finished_at timestamptz,
	ack_finished_at timestamptz,
	finished_at timestamptz,
	after_lsn pg_lsn
);
INSERT INTO load_measurement (before_lsn, started_at)
VALUES (pg_current_wal_insert_lsn(), clock_timestamp());

SET ROLE service_role;
CREATE TEMP TABLE load_flush_result AS
SELECT public.flush_agentic_chat_text_batches(payload) AS result
FROM load_batch;
RESET ROLE;
UPDATE load_measurement SET flush_finished_at = clock_timestamp();

SET ROLE service_role;
DO $$
DECLARE
	v_index integer;
	v_suffix text;
	v_result jsonb;
BEGIN
	FOR v_index IN 1..100 LOOP
		v_suffix := lpad(v_index::text, 12, '0');
		v_result := public.acknowledge_agentic_chat_stream_delivery(
			('f4000000-0000-4000-8000-' || v_suffix)::uuid,
			('f3000000-0000-4000-8000-' || v_suffix)::uuid,
			('f9000000-0000-4000-8000-' || v_suffix)::uuid,
			1,
			1
		);
		IF v_result->>'outcome' <> 'acknowledged' THEN
			RAISE EXCEPTION 'load_ack_failed: %', v_result;
		END IF;
	END LOOP;
END;
$$;
RESET ROLE;
UPDATE load_measurement SET ack_finished_at = clock_timestamp();

SET ROLE service_role;
CREATE TEMP TABLE load_cancel_result AS
SELECT public.observe_agentic_chat_turn_cancellations(payload) AS result
FROM cancel_batch;
RESET ROLE;
UPDATE load_measurement
SET finished_at = clock_timestamp(),
	after_lsn = pg_current_wal_insert_lsn();

SELECT pg_temp.assert_true(
	(SELECT (result->>'input_count')::integer = 100
		AND (result->>'persisted_count')::integer = 100
		AND (result->>'rejected_count')::integer = 0
		AND jsonb_array_length(result->'results') = 100
	 FROM load_flush_result),
	'100-turn text flush did not persist every exact input'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 100
		AND bool_and(last_event_sequence = 1)
	 FROM public.chat_turn_runs
	 WHERE id::text LIKE 'f4000000-0000-4000-8000-%'),
	'100-turn text flush did not advance every turn exactly once'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 100
		AND bool_and(snapshot_sequence = 1)
		AND bool_and(durable_through_sequence = 1)
		AND bool_and(last_text_sequence = 1)
		AND bool_and(octet_length(assistant_text) = 1024)
		AND bool_and(NOT reconcile_required)
	 FROM public.chat_turn_stream_state
	 WHERE turn_run_id::text LIKE 'f4000000-0000-4000-8000-%'),
	'100-turn snapshots or exact delivery acknowledgements diverged'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0
	 FROM public.chat_turn_events
	 WHERE turn_run_id::text LIKE 'f4000000-0000-4000-8000-%'),
	'text-only load unexpectedly created semantic event rows'
);
SELECT pg_temp.assert_true(
	(SELECT result = '[]'::jsonb FROM load_cancel_result),
	'one 100-turn cancellation observation returned a false cancellation'
);

-- Fixture thresholds are deliberately explicit and conservative. They gate
-- this synthetic control-plane cadence, not hosted capacity or Phase 3.
SELECT pg_temp.assert_true(
	(SELECT pg_wal_lsn_diff(after_lsn, before_lsn) > 0
		AND pg_wal_lsn_diff(after_lsn, before_lsn) <= 6553600
		AND extract(epoch FROM (finished_at - started_at)) < 5
		AND extract(epoch FROM (flush_finished_at - started_at)) < 2
	 FROM load_measurement),
	'100-turn WAL or latency exceeded the Phase 2 fixture budget'
);

SELECT 'agentic_chat_100_turn_load_metrics=' || jsonb_build_object(
	'turns', 100,
	'rpc_statements', 102,
	'affected_rows', 300,
	'flush_payload_bytes', octet_length((SELECT payload::text FROM load_batch)),
	'cancel_payload_bytes', octet_length((SELECT payload::text FROM cancel_batch)),
	'wal_bytes', pg_wal_lsn_diff(after_lsn, before_lsn)::bigint,
	'wal_bytes_per_turn', round(pg_wal_lsn_diff(after_lsn, before_lsn) / 100, 2),
	'flush_ms', round(extract(epoch FROM (flush_finished_at - started_at)) * 1000, 2),
	'ack_ms', round(extract(epoch FROM (ack_finished_at - flush_finished_at)) * 1000, 2),
	'total_ms', round(extract(epoch FROM (finished_at - started_at)) * 1000, 2),
	'write_rows_per_second', round(
		300 / extract(epoch FROM (finished_at - started_at)),
		2
	),
	'wal_bytes_per_second', round(
		pg_wal_lsn_diff(after_lsn, before_lsn) /
		extract(epoch FROM (finished_at - started_at)),
		2
	)
)::text AS load_metric_line
FROM load_measurement
\gset

\warn :load_metric_line
SELECT :'load_metric_line' AS result;

SELECT 'phase2d_100_turn_database_load_ok' AS result;
