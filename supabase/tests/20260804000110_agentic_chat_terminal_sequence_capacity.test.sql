-- supabase/tests/20260804000110_agentic_chat_terminal_sequence_capacity.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 5 hardening.
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

INSERT INTO public.users (id)
VALUES ('e1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'global',
	'active'
);

INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
VALUES (
	'e5000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'user',
	'sequence capacity fixture',
	'{"idempotency_key":"last-context-sequence-capacity-user"}'::jsonb
);

INSERT INTO public.queue_jobs (
	id, user_id, job_type, metadata, scheduled_for, dedup_key, status,
	queue_job_id, processing_token, started_at, attempts, max_attempts
) VALUES (
	'e3000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'agentic_chat_turn',
	'{"turnRunId":"e4000000-0000-4000-8000-000000000001","correlationId":"e8000000-0000-4000-8000-000000000001"}'::jsonb,
	now(),
	'agentic-chat-turn:e4000000-0000-4000-8000-000000000001',
	'processing',
	'agentic_chat_turn_sequence_capacity',
	'e9000000-0000-4000-8000-000000000001',
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
	'e4000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'sequence-capacity-stream',
	'sequence-capacity-client',
	'global',
	'sequence capacity fixture',
	'running',
	'worker_realtime',
	'e3000000-0000-4000-8000-000000000001',
	'e8000000-0000-4000-8000-000000000001',
	1,
	now(),
	now(),
	2147483646,
	'e5000000-0000-4000-8000-000000000001'
);

INSERT INTO public.chat_turn_stream_state (
	turn_run_id, session_id, user_id, execution_generation,
	snapshot_sequence, durable_through_sequence, projection_durable_sequence
) VALUES (
	'e4000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	1,
	2147483646,
	2147483646,
	2147483646
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.finalize_agentic_chat_turn_with_last_context(
			'e4000000-0000-4000-8000-000000000001',
			'e1000000-0000-4000-8000-000000000001',
			'e3000000-0000-4000-8000-000000000001',
			'e9000000-0000-4000-8000-000000000001',
			1, 'completed', 'stop', NULL,
			'e6000000-0000-4000-8000-000000000001',
			'sequence capacity fixture', '{}'::jsonb,
			1, 1, 2,
			'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
			'{"type":"done"}'::jsonb,
			'{"summary":"sequence capacity fixture","entities":{},"context_type":"global","data_accessed":[]}'::jsonb,
			'e7000000-0000-4000-8000-000000000001'
		)$$,
		'agentic_chat_last_context_finalize_sequence_exhausted'
	),
	'last-context completion did not reserve both terminal sequence slots'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'running' AND last_event_sequence = 2147483646
		FROM public.chat_turn_runs
		WHERE id = 'e4000000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_turn_events
		WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_messages
		WHERE id = 'e6000000-0000-4000-8000-000000000001'
	),
	'sequence-capacity rejection wrote partial terminal state'
);

SELECT 'phase4_slice5_sequence_capacity_ok' AS result;
