-- supabase/tests/20260802033200_agentic_chat_worker_stream_write_rpcs.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2C Slice 1.
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

CREATE OR REPLACE FUNCTION pg_temp.seed_stream_turn(p_suffix integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_suffix text := lpad(p_suffix::text, 12, '0');
	v_user_id uuid := ('c1000000-0000-4000-8000-' || v_suffix)::uuid;
	v_session_id uuid := ('c2000000-0000-4000-8000-' || v_suffix)::uuid;
	v_job_id uuid := ('c3000000-0000-4000-8000-' || v_suffix)::uuid;
	v_turn_id uuid := ('c4000000-0000-4000-8000-' || v_suffix)::uuid;
	v_message_id uuid := ('c5000000-0000-4000-8000-' || v_suffix)::uuid;
	v_correlation_id uuid := ('c8000000-0000-4000-8000-' || v_suffix)::uuid;
	v_processing_token uuid := ('c9000000-0000-4000-8000-' || v_suffix)::uuid;
BEGIN
	INSERT INTO public.users (id) VALUES (v_user_id);
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (v_session_id, v_user_id, 'global', 'active');
	INSERT INTO public.chat_messages (
		id, session_id, user_id, role, content, metadata
	) VALUES (
		v_message_id, v_session_id, v_user_id, 'user', 'stream fixture',
		jsonb_build_object('idempotency_key', 'stream-fixture:' || p_suffix::text)
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
		'stream-fixture-' || p_suffix::text,
		'client-fixture-' || p_suffix::text,
		'global',
		'stream fixture',
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

SELECT pg_temp.seed_stream_turn(suffix)
FROM generate_series(1, 8) AS suffix;

DO $$
DECLARE
	v_text regprocedure := to_regprocedure(
		'public.persist_agentic_chat_text_batch(uuid,uuid,uuid,integer,uuid,text,text)'
	);
	v_semantic regprocedure := to_regprocedure(
		'public.persist_agentic_chat_semantic_event(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb,jsonb)'
	);
	v_flush regprocedure := to_regprocedure(
		'public.flush_agentic_chat_text_batches(jsonb)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_text IS NOT NULL, 'text persistence RPC is missing');
	PERFORM pg_temp.assert_true(v_semantic IS NOT NULL, 'semantic persistence RPC is missing');
	PERFORM pg_temp.assert_true(v_flush IS NOT NULL, 'text batch flush RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_text, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_text, 'EXECUTE')
			AND has_function_privilege('service_role', v_text, 'EXECUTE')
			AND NOT has_function_privilege('anon', v_semantic, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_semantic, 'EXECUTE')
			AND has_function_privilege('service_role', v_semantic, 'EXECUTE')
			AND NOT has_function_privilege('anon', v_flush, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_flush, 'EXECUTE')
			AND has_function_privilege('service_role', v_flush, 'EXECUTE'),
		'stream persistence grants are not service-only'
	);
	PERFORM pg_temp.assert_true(
		EXISTS (
			SELECT 1
			FROM pg_index indexes
			WHERE indexes.indexrelid = 'public.uq_chat_turn_events_worker_transition'::regclass
				AND indexes.indisvalid
				AND indexes.indisunique
		),
		'worker transition index is not valid and unique'
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_authenticated_stream_write_wrapper()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.persist_agentic_chat_text_batch(
		'c4000000-0000-4000-8000-000000000001',
		'c3000000-0000-4000-8000-000000000001',
		'c9000000-0000-4000-8000-000000000001',
		1,
		'c6000000-0000-4000-8000-000000000001',
		'forbidden',
		'forbidden'
	);
$$;
GRANT EXECUTE ON FUNCTION public.test_authenticated_stream_write_wrapper() TO authenticated;

SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.test_authenticated_stream_write_wrapper()',
		'agentic_chat_text_write_service_role_required'
	),
	'signed-definer authenticated stream write bypassed the role fence'
);
RESET request.jwt.claims;
RESET ROLE;

-- The first text flush followed by three semantic transitions models the
-- single per-turn writer slot required by the publisher. Every write receives
-- a gap-free database-allocated sequence and text creates no token/event row.
SET ROLE service_role;
CREATE TEMP TABLE interleaving_results (result jsonb);
INSERT INTO interleaving_results
SELECT public.persist_agentic_chat_text_batch(
	'c4000000-0000-4000-8000-000000000001',
	'c3000000-0000-4000-8000-000000000001',
	'c9000000-0000-4000-8000-000000000001',
	1,
	'c6000000-0000-4000-8000-000000000001',
	'Hello',
	'Hello'
);
INSERT INTO interleaving_results
SELECT public.persist_agentic_chat_semantic_event(
	'c4000000-0000-4000-8000-000000000001',
	'c3000000-0000-4000-8000-000000000001',
	'c9000000-0000-4000-8000-000000000001',
	1,
	'c7000000-0000-4000-8000-000000000001',
	'Hello',
	'tool',
	'tool_call',
	'{"phase":"tool","activeTool":"onto_project_read"}'::jsonb,
	'{"type":"tool_call","tool_name":"onto_project_read"}'::jsonb
);
INSERT INTO interleaving_results
SELECT public.persist_agentic_chat_semantic_event(
	'c4000000-0000-4000-8000-000000000001',
	'c3000000-0000-4000-8000-000000000001',
	'c9000000-0000-4000-8000-000000000001',
	1,
	'c7000000-0000-4000-8000-000000000002',
	'Hello',
	'tool',
	'tool_result',
	'{"phase":"tool","activeTool":null,"lastResult":"ok"}'::jsonb,
	'{"type":"tool_result","tool_name":"onto_project_read","ok":true}'::jsonb
);
INSERT INTO interleaving_results
SELECT public.persist_agentic_chat_semantic_event(
	'c4000000-0000-4000-8000-000000000001',
	'c3000000-0000-4000-8000-000000000001',
	'c9000000-0000-4000-8000-000000000001',
	1,
	'c7000000-0000-4000-8000-000000000003',
	'Hello',
	'llm',
	'timing',
	'{"phase":"llm","lastResult":"ok"}'::jsonb,
	'{"type":"timing","elapsed_ms":25}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 4 FROM interleaving_results
		WHERE result->>'outcome' = 'persisted'
			AND (result->>'publish_allowed')::boolean)
		AND (
			SELECT array_agg((result->>'sequence_index')::integer ORDER BY (result->>'sequence_index')::integer)
			FROM interleaving_results
		) = ARRAY[1, 2, 3, 4]
		AND (
			SELECT last_event_sequence = 4
			FROM public.chat_turn_runs
			WHERE id = 'c4000000-0000-4000-8000-000000000001'
		)
		AND (
			SELECT snapshot_sequence = 4
				AND durable_through_sequence = 4
				AND projection_durable_sequence = 4
				AND assistant_text = 'Hello'
				AND last_text_sequence = 1
				AND reconcile_required
			FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000001'
		)
		AND (
			SELECT count(*) = 3
				AND min(sequence_index) = 2
				AND max(sequence_index) = 4
			FROM public.chat_turn_events
			WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000001'
		),
	'immediate text plus semantic interleaving was not gap-free and durable'
);

-- Lost-response replays expose the committed receipt but never authorize a
-- second Broadcast. Conflicting identities fail closed.
SET ROLE service_role;
CREATE TEMP TABLE replay_results (result jsonb);
INSERT INTO replay_results
SELECT public.persist_agentic_chat_text_batch(
	'c4000000-0000-4000-8000-000000000001',
	'c3000000-0000-4000-8000-000000000001',
	'c9000000-0000-4000-8000-000000000001',
	1,
	'c6000000-0000-4000-8000-000000000001',
	'Hello',
	'Hello'
);
INSERT INTO replay_results
SELECT public.persist_agentic_chat_semantic_event(
	'c4000000-0000-4000-8000-000000000001',
	'c3000000-0000-4000-8000-000000000001',
	'c9000000-0000-4000-8000-000000000001',
	1,
	'c7000000-0000-4000-8000-000000000001',
	'Hello',
	'tool',
	'tool_call',
	'{"ignoredOnReplay":true}'::jsonb,
	'{"type":"tool_call","tool_name":"onto_project_read"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM replay_results
		WHERE result->>'outcome' = 'already_persisted'
			AND NOT (result->>'publish_allowed')::boolean)
		AND (SELECT last_event_sequence = 4 FROM public.chat_turn_runs
			WHERE id = 'c4000000-0000-4000-8000-000000000001')
		AND (SELECT count(*) = 3 FROM public.chat_turn_events
			WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000001'),
	'lost-response replay changed durable state or authorized publication'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.persist_agentic_chat_semantic_event(
			'c4000000-0000-4000-8000-000000000001',
			'c3000000-0000-4000-8000-000000000001',
			'c9000000-0000-4000-8000-000000000001', 1,
			'c7000000-0000-4000-8000-000000000001', 'Hello', 'tool',
			'tool_call', '{}'::jsonb,
			'{"type":"tool_call","tool_name":"different"}'::jsonb
		)$$,
		'agentic_chat_semantic_write_transition_conflict'
	),
	'conflicting semantic transition replay was accepted'
);
RESET ROLE;

-- One invalid batch item rolls back only its subtransaction. The accepted item
-- remains committed and is the only result allowed to publish.
SET ROLE service_role;
CREATE TEMP TABLE batch_flush_result AS
SELECT public.flush_agentic_chat_text_batches(
	jsonb_build_array(
		jsonb_build_object(
			'turn_run_id', 'c4000000-0000-4000-8000-000000000002',
			'queue_job_id', 'c3000000-0000-4000-8000-000000000002',
			'processing_token', 'c9000000-0000-4000-8000-000000000002',
			'execution_generation', 1,
			'batch_id', 'c6000000-0000-4000-8000-000000000002',
			'text_delta', 'A',
			'assistant_text', 'A'
		),
		jsonb_build_object(
			'turn_run_id', 'c4000000-0000-4000-8000-000000000002',
			'queue_job_id', 'c3000000-0000-4000-8000-000000000002',
			'processing_token', 'c9000000-0000-4000-8000-000000000002',
			'execution_generation', 1,
			'batch_id', 'c6000000-0000-4000-8000-000000000003',
			'text_delta', 'B',
			'assistant_text', 'wrong-prefix'
		)
	)
) AS result;
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT (result->>'input_count')::integer = 2
		AND (result->>'persisted_count')::integer = 1
		AND (result->>'rejected_count')::integer = 1
		AND result#>>'{results,0,outcome}' = 'persisted'
		AND (result#>>'{results,0,publish_allowed}')::boolean
		AND result#>>'{results,1,outcome}' = 'rejected'
		AND NOT (result#>>'{results,1,publish_allowed}')::boolean
	 FROM batch_flush_result)
		AND (SELECT last_event_sequence = 1 FROM public.chat_turn_runs
			WHERE id = 'c4000000-0000-4000-8000-000000000002')
		AND (SELECT assistant_text = 'A' AND snapshot_sequence = 1
			FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000002'),
	'mixed text batch did not isolate the rejected item'
);

-- Stale generations and cancellation are typed no-write/no-publish outcomes.
SET ROLE service_role;
CREATE TEMP TABLE blocked_results (result jsonb);
INSERT INTO blocked_results
SELECT public.persist_agentic_chat_text_batch(
	'c4000000-0000-4000-8000-000000000002',
	'c3000000-0000-4000-8000-000000000002',
	'c9000000-0000-4000-8000-000000000002',
	2,
	'c6000000-0000-4000-8000-000000000004',
	'B',
	'AB'
);
RESET ROLE;
UPDATE public.chat_turn_runs
SET cancel_requested_at = now(), cancel_reason = 'user_cancelled'
WHERE id = 'c4000000-0000-4000-8000-000000000003';
SET ROLE service_role;
INSERT INTO blocked_results
SELECT public.persist_agentic_chat_semantic_event(
	'c4000000-0000-4000-8000-000000000003',
	'c3000000-0000-4000-8000-000000000003',
	'c9000000-0000-4000-8000-000000000003',
	1,
	'c7000000-0000-4000-8000-000000000004',
	'',
	'llm',
	'timing',
	'{}'::jsonb,
	'{"type":"timing"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM blocked_results
		WHERE result->>'outcome' IN ('stale_generation', 'cancel_requested')
			AND NOT (result->>'publish_allowed')::boolean)
		AND (SELECT last_event_sequence = 1 FROM public.chat_turn_runs
			WHERE id = 'c4000000-0000-4000-8000-000000000002')
		AND (SELECT last_event_sequence = 0 FROM public.chat_turn_runs
			WHERE id = 'c4000000-0000-4000-8000-000000000003'),
	'stale or cancelled stream write changed durable state'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.persist_agentic_chat_text_batch(
			'c4000000-0000-4000-8000-000000000002',
			'c3000000-0000-4000-8000-000000000002',
			'c9000000-0000-4000-8000-000000000099', 1,
			'c6000000-0000-4000-8000-000000000099', 'B', 'AB'
		)$$,
		'agentic_chat_text_write_ownership_lost'
	)
		AND pg_temp.expect_error(
			$$SELECT public.persist_agentic_chat_semantic_event(
				'c4000000-0000-4000-8000-000000000002',
				'c3000000-0000-4000-8000-000000000002',
				'c9000000-0000-4000-8000-000000000002', 1,
				'c7000000-0000-4000-8000-000000000099', 'A', 'finalize',
				'done', '{}'::jsonb, '{"type":"done"}'::jsonb
			)$$,
			'agentic_chat_semantic_write_invalid_event'
		),
	'forged owner or ordinary done writer retained authority'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT last_event_sequence = 1 FROM public.chat_turn_runs
	 WHERE id = 'c4000000-0000-4000-8000-000000000002'),
	'ownership/event validation failure advanced a turn cursor'
);

-- Terminal truth wins over every ordinary writer.
SET ROLE service_role;
SELECT public.finalize_agentic_chat_turn(
	'c4000000-0000-4000-8000-000000000004',
	'c1000000-0000-4000-8000-000000000004',
	'c3000000-0000-4000-8000-000000000004',
	'c9000000-0000-4000-8000-000000000004',
	1, 'completed', 'stop', NULL,
	'ca000000-0000-4000-8000-000000000004', '', '{}'::jsonb,
	NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb
);
CREATE TEMP TABLE terminal_write_result AS
SELECT public.persist_agentic_chat_text_batch(
	'c4000000-0000-4000-8000-000000000004',
	'c3000000-0000-4000-8000-000000000004',
	'c9000000-0000-4000-8000-000000000004',
	1,
	'c6000000-0000-4000-8000-000000000005',
	'late',
	'late'
) AS result;
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'already_terminal'
		AND NOT (result->>'publish_allowed')::boolean FROM terminal_write_result)
		AND (SELECT last_event_sequence = 1 AND status = 'completed'
			FROM public.chat_turn_runs
			WHERE id = 'c4000000-0000-4000-8000-000000000004'),
	'ordinary writer escaped terminal truth'
);

-- Inject a failure after semantic event insertion. The function transaction
-- must roll the event back together with the projection and turn cursor.
CREATE OR REPLACE FUNCTION public.test_reject_stream_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.turn_run_id = 'c4000000-0000-4000-8000-000000000005'
		AND NEW.projection_durable_sequence > OLD.projection_durable_sequence THEN
		RAISE EXCEPTION 'test_projection_failure';
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_reject_stream_projection
BEFORE UPDATE ON public.chat_turn_stream_state
FOR EACH ROW EXECUTE FUNCTION public.test_reject_stream_projection();

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.persist_agentic_chat_semantic_event(
			'c4000000-0000-4000-8000-000000000005',
			'c3000000-0000-4000-8000-000000000005',
			'c9000000-0000-4000-8000-000000000005', 1,
			'c7000000-0000-4000-8000-000000000005', '', 'llm', 'timing',
			'{}'::jsonb, '{"type":"timing"}'::jsonb
		)$$,
		'test_projection_failure'
	),
	'semantic projection failure did not surface'
);
RESET ROLE;
DROP TRIGGER test_reject_stream_projection ON public.chat_turn_stream_state;
DROP FUNCTION public.test_reject_stream_projection();
SELECT pg_temp.assert_true(
	(SELECT last_event_sequence = 0 FROM public.chat_turn_runs
		WHERE id = 'c4000000-0000-4000-8000-000000000005')
		AND (SELECT snapshot_sequence = 0 AND projection_durable_sequence = 0
			FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000005')
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_turn_events
			WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000005'
		),
	'semantic failure left a partial event, stream projection, or turn cursor'
);

-- Two genuine connections contend on one turn. The turn row serializes both
-- independently identified semantic transitions into adjacent sequences.
CREATE OR REPLACE FUNCTION public.test_pause_stream_event_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.turn_run_id = 'c4000000-0000-4000-8000-000000000006'
		AND NEW.worker_transition_id = 'c7000000-0000-4000-8000-000000000006' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_stream_event_insert
BEFORE INSERT ON public.chat_turn_events
FOR EACH ROW EXECUTE FUNCTION public.test_pause_stream_event_insert();

SELECT dblink_connect('stream_write_a', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_connect('stream_write_b', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_send_query('stream_write_a', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.persist_agentic_chat_semantic_event(
		'c4000000-0000-4000-8000-000000000006',
		'c3000000-0000-4000-8000-000000000006',
		'c9000000-0000-4000-8000-000000000006', 1,
		'c7000000-0000-4000-8000-000000000006', '', 'llm', 'timing',
		'{"writer":"a"}'::jsonb,
		'{"type":"timing","writer":"a"}'::jsonb
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('stream_write_b', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.persist_agentic_chat_semantic_event(
		'c4000000-0000-4000-8000-000000000006',
		'c3000000-0000-4000-8000-000000000006',
		'c9000000-0000-4000-8000-000000000006', 1,
		'c7000000-0000-4000-8000-000000000007', '', 'llm', 'timing',
		'{"writer":"b"}'::jsonb,
		'{"type":"timing","writer":"b"}'::jsonb
	) FROM trusted
$query$);
CREATE TEMP TABLE concurrent_stream_results (result jsonb);
INSERT INTO concurrent_stream_results
SELECT result FROM dblink_get_result('stream_write_a', false) AS response(result jsonb);
INSERT INTO concurrent_stream_results
SELECT result FROM dblink_get_result('stream_write_b', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM concurrent_stream_results
		WHERE result->>'outcome' = 'persisted'
			AND (result->>'publish_allowed')::boolean)
		AND (
			SELECT array_agg(sequence_index ORDER BY sequence_index) = ARRAY[1, 2]
			FROM public.chat_turn_events
			WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000006'
		)
		AND (SELECT last_event_sequence = 2 FROM public.chat_turn_runs
			WHERE id = 'c4000000-0000-4000-8000-000000000006')
		AND (SELECT snapshot_sequence = 2 AND durable_through_sequence = 2
			FROM public.chat_turn_stream_state
			WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000006'),
	'concurrent semantic writes did not serialize into adjacent sequences'
);
SELECT dblink_disconnect('stream_write_a');
SELECT dblink_disconnect('stream_write_b');
DROP TRIGGER test_pause_stream_event_insert ON public.chat_turn_events;
DROP FUNCTION public.test_pause_stream_event_insert();

-- A generation transition clears the additive text receipt fields even though
-- the already-hosted claim upsert does not name them.
UPDATE public.chat_turn_runs
SET execution_generation = 2, last_event_sequence = 0
WHERE id = 'c4000000-0000-4000-8000-000000000001';
UPDATE public.chat_turn_stream_state
SET execution_generation = 2,
	snapshot_sequence = 0,
	durable_through_sequence = 0,
	projection_durable_sequence = 0,
	assistant_text = '',
	projection = '{}'::jsonb,
	reconcile_required = false
WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT execution_generation = 2
		AND last_text_batch_id IS NULL
		AND last_text_sequence IS NULL
		AND last_text_end_bytes IS NULL
	 FROM public.chat_turn_stream_state
	 WHERE turn_run_id = 'c4000000-0000-4000-8000-000000000001'),
	'generation reset retained a prior text-batch receipt'
);

-- Package-only rollback removes Phase 2C Slice 1 while preserving every Phase
-- 2B ownership and terminal primitive. The transaction is rolled back so this
-- proof cannot affect later assertions.
BEGIN;
DROP FUNCTION public.flush_agentic_chat_text_batches(jsonb);
DROP FUNCTION public.persist_agentic_chat_semantic_event(
	uuid, uuid, uuid, integer, uuid, text, text, text, jsonb, jsonb
);
DROP FUNCTION public.persist_agentic_chat_text_batch(
	uuid, uuid, uuid, integer, uuid, text, text
);
DROP INDEX public.uq_chat_turn_events_worker_transition;
ALTER TABLE public.chat_turn_events
	DROP COLUMN worker_transition_id;
ALTER TABLE public.chat_turn_stream_state
	DROP CONSTRAINT chk_chat_turn_stream_state_last_text_receipt,
	DROP COLUMN last_text_batch_id,
	DROP COLUMN last_text_sequence,
	DROP COLUMN last_text_end_bytes;
SELECT pg_temp.assert_true(
	to_regprocedure(
		'public.persist_agentic_chat_text_batch(uuid,uuid,uuid,integer,uuid,text,text)'
	) IS NULL
		AND to_regprocedure(
			'public.persist_agentic_chat_semantic_event(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb,jsonb)'
		) IS NULL
		AND to_regprocedure('public.flush_agentic_chat_text_batches(jsonb)') IS NULL
		AND to_regprocedure('public.claim_agentic_chat_turn(uuid,uuid,uuid)') IS NOT NULL
		AND to_regprocedure(
			'public.finalize_agentic_chat_turn(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb)'
		) IS NOT NULL,
	'slice-only rollback removed or depended on an earlier Phase 2B primitive'
);
ROLLBACK;

DROP FUNCTION public.test_authenticated_stream_write_wrapper();

SELECT 'phase2c_stream_write_rpcs_ok' AS result;
