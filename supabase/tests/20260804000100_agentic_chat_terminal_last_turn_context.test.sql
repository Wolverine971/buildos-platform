-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 5.
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

CREATE OR REPLACE FUNCTION pg_temp.seed_last_context_turn(p_suffix integer)
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
	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (
		v_message_id,
		v_session_id,
		v_user_id,
		'user',
		'last context fixture',
		jsonb_build_object('idempotency_key', 'last-context-user:' || p_suffix::text)
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
		'agentic_chat_turn_' || p_suffix::text,
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
		'last-context-stream-' || p_suffix::text,
		'last-context-client-' || p_suffix::text,
		'global',
		'last context fixture',
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

CREATE OR REPLACE FUNCTION pg_temp.complete_last_context_turn(
	p_suffix integer,
	p_total_tokens integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_suffix text := lpad(p_suffix::text, 12, '0');
BEGIN
	RETURN public.finalize_agentic_chat_turn_with_last_context(
		('d4000000-0000-4000-8000-' || v_suffix)::uuid,
		('d1000000-0000-4000-8000-' || v_suffix)::uuid,
		('d3000000-0000-4000-8000-' || v_suffix)::uuid,
		('d9000000-0000-4000-8000-' || v_suffix)::uuid,
		1,
		'completed',
		'stop',
		NULL,
		('d6000000-0000-4000-8000-' || v_suffix)::uuid,
		'Completed the durable continuity fixture.',
		'{"completion_status":"completed","answer_source":"model"}'::jsonb,
		2,
		3,
		p_total_tokens,
		'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
		'{"type":"done","status":"completed","finished_reason":"stop","failure_code":null}'::jsonb,
		'{"summary":"Completed the durable continuity fixture.","entities":{"tasks":[{"id":"da000000-0000-4000-8000-000000000001","name":"Fixture task"}]},"context_type":"global","data_accessed":["onto_task_read"]}'::jsonb,
		('d7000000-0000-4000-8000-' || v_suffix)::uuid
	);
END;
$$;

SELECT pg_temp.seed_last_context_turn(1);
SELECT pg_temp.seed_last_context_turn(2);

DO $$
DECLARE
	v_rpc regprocedure := to_regprocedure(
		'public.finalize_agentic_chat_turn_with_last_context(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,jsonb,uuid)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_rpc IS NOT NULL, 'last-context terminal RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_rpc, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_rpc, 'EXECUTE')
			AND has_function_privilege('service_role', v_rpc, 'EXECUTE'),
		'last-context terminal RPC grants are not service-only'
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_authenticated_last_context_finalize_wrapper()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT pg_temp.complete_last_context_turn(1, 5);
$$;
GRANT EXECUTE ON FUNCTION public.test_authenticated_last_context_finalize_wrapper()
	TO authenticated;

SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.test_authenticated_last_context_finalize_wrapper()',
		'agentic_chat_last_context_finalize_service_role_required'
	),
	'signed-definer authenticated caller bypassed the last-context role fence'
);
RESET request.jwt.claims;
RESET ROLE;

SET ROLE service_role;
CREATE TEMP TABLE last_context_receipts AS
SELECT pg_temp.complete_last_context_turn(1, 5) AS receipt;
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT receipt->>'outcome' = 'finalized'
			AND receipt->'preterminal_event'->>'outcome' = 'persisted'
			AND (receipt->'preterminal_event'->>'publish_allowed')::boolean
			AND (receipt->'preterminal_event'->>'sequence_index')::integer = 1
			AND (receipt->>'terminal_sequence_index')::integer = 2
		FROM last_context_receipts
	),
	'completion did not return ordered publication receipts'
);

SELECT pg_temp.assert_true(
	(
		SELECT array_agg(event_type ORDER BY sequence_index)
			= ARRAY['last_turn_context', 'done']::text[]
		FROM public.chat_turn_events
		WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001'
	)
	AND (
		SELECT last_event_sequence = 2 AND status = 'completed'
		FROM public.chat_turn_runs
		WHERE id = 'd4000000-0000-4000-8000-000000000001'
	)
	AND (
		SELECT snapshot_sequence = 2
			AND durable_through_sequence = 2
			AND projection_durable_sequence = 2
			AND jsonb_array_length(projection->'semantic_events') = 1
			AND projection->'semantic_events'->0->>'event_type' = 'last_turn_context'
		FROM public.chat_turn_stream_state
		WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001'
	),
	'last-turn context was not durable immediately before done'
);

SELECT pg_temp.assert_true(
	(
		SELECT (event.payload->'context'->>'timestamp')::timestamptz
			IS NOT DISTINCT FROM message.created_at
		FROM public.chat_turn_events event
		JOIN public.chat_turn_runs turn_run ON turn_run.id = event.turn_run_id
		JOIN public.chat_messages message ON message.id = turn_run.assistant_message_id
		WHERE event.turn_run_id = 'd4000000-0000-4000-8000-000000000001'
			AND event.event_type = 'last_turn_context'
	)
	AND (
		SELECT stream.projection->'semantic_events'->0->'context'->>'timestamp'
			= event.payload->'context'->>'timestamp'
		FROM public.chat_turn_stream_state stream
		JOIN public.chat_turn_events event ON event.turn_run_id = stream.turn_run_id
		WHERE stream.turn_run_id = 'd4000000-0000-4000-8000-000000000001'
			AND event.event_type = 'last_turn_context'
	),
	'last-turn context timestamp does not match the committed assistant message'
);

-- A lost-response replay returns terminal truth and cannot duplicate context.
SET ROLE service_role;
CREATE TEMP TABLE replay_receipts AS
SELECT pg_temp.complete_last_context_turn(1, 5) AS receipt;
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT receipt->>'outcome' = 'already_terminal' FROM replay_receipts)
	AND (
		SELECT count(*) = 2
		FROM public.chat_turn_events
		WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001'
	),
	'last-context completion replay duplicated durable state'
);

-- Missing required nested JSON must fail closed instead of relying on SQL NULL
-- boolean behavior.
SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.finalize_agentic_chat_turn_with_last_context(
			'd4000000-0000-4000-8000-000000000002',
			'd1000000-0000-4000-8000-000000000002',
			'd3000000-0000-4000-8000-000000000002',
			'd9000000-0000-4000-8000-000000000002',
			1, 'completed', 'stop', NULL,
			'd6000000-0000-4000-8000-000000000002', 'invalid context', '{}'::jsonb,
			2, 3, 5,
			'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
			'{"type":"done"}'::jsonb,
			'{"summary":"Missing nested fields","context_type":"global"}'::jsonb,
			'd7000000-0000-4000-8000-000000000002'
		)$$,
		'agentic_chat_last_context_finalize_invalid_payload'
	),
	'missing required last-context fields did not fail closed'
);
RESET ROLE;

-- A failure in the delegated finalizer rolls back the preceding semantic write.
SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT pg_temp.complete_last_context_turn(2, 99)',
		'agentic_chat_finalize_invalid_token_usage'
	),
	'invalid terminal payload unexpectedly committed'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT status = 'running' AND last_event_sequence = 0
		FROM public.chat_turn_runs
		WHERE id = 'd4000000-0000-4000-8000-000000000002'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_turn_events
		WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000002'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM public.chat_messages
		WHERE id = 'd6000000-0000-4000-8000-000000000002'
	),
	'failed terminal delegation did not roll back the context write'
);

DROP FUNCTION public.test_authenticated_last_context_finalize_wrapper();

SELECT 'phase4_slice5_terminal_last_turn_context_ok' AS result;
