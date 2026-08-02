-- Disposable PostgreSQL verification for Agentic Chat Phase 2C Slice 3.
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

CREATE OR REPLACE FUNCTION pg_temp.seed_observer_turn(p_suffix integer, p_generation integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_suffix text := lpad(p_suffix::text, 12, '0');
	v_user_id uuid := ('e1000000-0000-4000-8000-' || v_suffix)::uuid;
	v_session_id uuid := ('e2000000-0000-4000-8000-' || v_suffix)::uuid;
	v_job_id uuid := ('e3000000-0000-4000-8000-' || v_suffix)::uuid;
	v_turn_id uuid := ('e4000000-0000-4000-8000-' || v_suffix)::uuid;
	v_message_id uuid := ('e5000000-0000-4000-8000-' || v_suffix)::uuid;
	v_correlation_id uuid := ('e8000000-0000-4000-8000-' || v_suffix)::uuid;
	v_processing_token uuid := ('e9000000-0000-4000-8000-' || v_suffix)::uuid;
BEGIN
	INSERT INTO public.users (id) VALUES (v_user_id);
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (v_session_id, v_user_id, 'global', 'active');
	INSERT INTO public.chat_messages (
		id, session_id, user_id, role, content, metadata
	) VALUES (
		v_message_id, v_session_id, v_user_id, 'user', 'observer fixture',
		jsonb_build_object('idempotency_key', 'observer-fixture:' || p_suffix::text)
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
		'agentic_chat_observer_' || p_suffix::text,
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
		'observer-fixture-' || p_suffix::text,
		'observer-client-' || p_suffix::text,
		'global',
		'observer fixture',
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

SELECT pg_temp.seed_observer_turn(1, 1);
SELECT pg_temp.seed_observer_turn(2, 2);
SELECT pg_temp.seed_observer_turn(3, 1);
SELECT pg_temp.seed_observer_turn(4, 1);
SELECT pg_temp.seed_observer_turn(5, 1);

DO $$
DECLARE
	v_observer regprocedure := to_regprocedure(
		'public.observe_agentic_chat_turn_cancellations(jsonb)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_observer IS NOT NULL, 'cancellation observer RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_observer, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_observer, 'EXECUTE')
			AND has_function_privilege('service_role', v_observer, 'EXECUTE'),
		'cancellation observer grants are not service-only'
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_authenticated_cancel_observer_wrapper()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.observe_agentic_chat_turn_cancellations('[]'::jsonb);
$$;
GRANT EXECUTE ON FUNCTION public.test_authenticated_cancel_observer_wrapper() TO authenticated;

SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.test_authenticated_cancel_observer_wrapper()',
		'agentic_chat_cancel_observation_service_role_required'
	),
	'signed-definer authenticated cancellation observation bypassed the role fence'
);
RESET request.jwt.claims;
RESET ROLE;

SET ROLE service_role;

SELECT pg_temp.assert_true(
	public.observe_agentic_chat_turn_cancellations('[]'::jsonb) = '[]'::jsonb,
	'empty cancellation observation batch was not an empty no-op'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.observe_agentic_chat_turn_cancellations('{}'::jsonb)$$,
		'agentic_chat_cancel_observation_invalid_batch'
	),
	'non-array cancellation observation input was accepted'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.observe_agentic_chat_turn_cancellations(
			'[{
				"turn_run_id":"e4000000-0000-4000-8000-000000000001",
				"execution_generation":1,
				"extra":true
			}]'::jsonb
		)$$,
		'agentic_chat_cancel_observation_invalid_pair'
	),
	'cancellation observation pair with extra content was accepted'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.observe_agentic_chat_turn_cancellations(
			'[{
				"turn_run_id":"e4000000-0000-4000-8000-000000000001",
				"execution_generation":1.5
			}]'::jsonb
		)$$,
		'agentic_chat_cancel_observation_invalid_pair'
	),
	'fractional execution generation was coerced and accepted'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.observe_agentic_chat_turn_cancellations(
			'[
				{"turn_run_id":"e4000000-0000-4000-8000-000000000001","execution_generation":1},
				{"turn_run_id":"e4000000-0000-4000-8000-000000000001","execution_generation":2}
			]'::jsonb
		)$$,
		'agentic_chat_cancel_observation_duplicate_turn'
	),
	'duplicate turn identities were accepted in one observation batch'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			'SELECT public.observe_agentic_chat_turn_cancellations(%L::jsonb)',
			(
				SELECT jsonb_agg(jsonb_build_object(
					'turn_run_id', gen_random_uuid(),
					'execution_generation', 1
				))
				FROM generate_series(1, 129)
			)::text
		),
		'agentic_chat_cancel_observation_batch_too_large'
	),
	'over-bound cancellation observation batch was accepted'
);

SELECT public.request_agentic_chat_turn_cancel(
	'e4000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'user_cancelled',
	'browser'
);
SELECT public.request_agentic_chat_turn_cancel(
	'e4000000-0000-4000-8000-000000000002',
	'e1000000-0000-4000-8000-000000000002',
	'superseded',
	'browser'
);
SELECT public.request_agentic_chat_turn_cancel(
	'e4000000-0000-4000-8000-000000000004',
	'e1000000-0000-4000-8000-000000000004',
	'operator_cancelled',
	'operator'
);
UPDATE public.chat_turn_runs
SET status = 'cancelled'
WHERE id = 'e4000000-0000-4000-8000-000000000004';

CREATE TEMP TABLE observation_results (label text PRIMARY KEY, result jsonb NOT NULL);
INSERT INTO observation_results VALUES (
	'first',
	public.observe_agentic_chat_turn_cancellations(
		'[
			{"turn_run_id":"e4000000-0000-4000-8000-000000000001","execution_generation":1},
			{"turn_run_id":"e4000000-0000-4000-8000-000000000002","execution_generation":1},
			{"turn_run_id":"e4000000-0000-4000-8000-000000000003","execution_generation":1},
			{"turn_run_id":"e4000000-0000-4000-8000-000000000004","execution_generation":1},
			{"turn_run_id":"e4000000-0000-4000-8000-000000000099","execution_generation":1}
		]'::jsonb
	)
);

SELECT pg_temp.assert_true(
	jsonb_array_length((SELECT result FROM observation_results WHERE label = 'first')) = 1
		AND (SELECT result->0->>'turn_run_id' = 'e4000000-0000-4000-8000-000000000001'
			FROM observation_results WHERE label = 'first')
		AND (SELECT (result->0->>'execution_generation')::integer = 1
			FROM observation_results WHERE label = 'first')
		AND (SELECT result->0->>'cancel_reason' = 'user_cancelled'
			FROM observation_results WHERE label = 'first'),
	'mixed cancellation observation returned a stale, uncancelled, terminal, or unknown turn'
);
SELECT pg_temp.assert_true(
	(SELECT consumed_at IS NOT NULL AND consumed_by_generation = 1
		FROM public.chat_turn_signals
		WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000001')
		AND (SELECT consumed_at IS NULL AND consumed_by_generation IS NULL
			FROM public.chat_turn_signals
			WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000002')
		AND (SELECT consumed_at IS NULL AND consumed_by_generation IS NULL
			FROM public.chat_turn_signals
			WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000004'),
	'observer consumed a stale-generation or terminal signal'
);

SELECT pg_sleep(0.01);
INSERT INTO observation_results VALUES (
	'replay',
	public.observe_agentic_chat_turn_cancellations(
		'[{"turn_run_id":"e4000000-0000-4000-8000-000000000001","execution_generation":1}]'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result FROM observation_results WHERE label = 'replay')
		= (SELECT result FROM observation_results WHERE label = 'first'),
	'lost-response replay changed or hid the durable cancellation observation'
);

BEGIN;
UPDATE public.chat_turn_runs
SET cancel_requested_at = clock_timestamp(), cancel_reason = 'timeout'
WHERE id = 'e4000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT public.observe_agentic_chat_turn_cancellations(
			'[{"turn_run_id":"e4000000-0000-4000-8000-000000000003","execution_generation":1}]'::jsonb
		)$$,
		'agentic_chat_cancel_observation_signal_corrupt'
	),
	'missing durable cancellation signal was silently ignored'
);
ROLLBACK;

RESET ROLE;

-- A cancellation transaction pauses after updating the turn while retaining
-- its turn lock. The concurrent observer must wait, then see the fully
-- committed signal instead of returning a mixed state.
CREATE OR REPLACE FUNCTION public.test_pause_cancel_signal_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.turn_run_id = 'e4000000-0000-4000-8000-000000000005' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_cancel_signal_insert
BEFORE INSERT ON public.chat_turn_signals
FOR EACH ROW EXECUTE FUNCTION public.test_pause_cancel_signal_insert();

SELECT dblink_connect('cancel_writer', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_connect('cancel_observer', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_send_query('cancel_writer', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.request_agentic_chat_turn_cancel(
		'e4000000-0000-4000-8000-000000000005',
		'e1000000-0000-4000-8000-000000000005',
		'timeout',
		'worker'
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('cancel_observer', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.observe_agentic_chat_turn_cancellations(
		'[{"turn_run_id":"e4000000-0000-4000-8000-000000000005","execution_generation":1}]'::jsonb
	) FROM trusted
$query$);
CREATE TEMP TABLE concurrent_cancel_result (result jsonb);
CREATE TEMP TABLE concurrent_observer_result (result jsonb);
INSERT INTO concurrent_cancel_result
SELECT result FROM dblink_get_result('cancel_writer', false) AS response(result jsonb);
INSERT INTO concurrent_observer_result
SELECT result FROM dblink_get_result('cancel_observer', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'cancel_requested' FROM concurrent_cancel_result)
		AND (SELECT jsonb_array_length(result) = 1
			AND result->0->>'turn_run_id' = 'e4000000-0000-4000-8000-000000000005'
			FROM concurrent_observer_result)
		AND (SELECT consumed_by_generation = 1 AND consumed_at IS NOT NULL
			FROM public.chat_turn_signals
			WHERE turn_run_id = 'e4000000-0000-4000-8000-000000000005'),
	'concurrent observer returned before committed cancellation truth was complete'
);
SELECT dblink_disconnect('cancel_writer');
SELECT dblink_disconnect('cancel_observer');
DROP TRIGGER test_pause_cancel_signal_insert ON public.chat_turn_signals;
DROP FUNCTION public.test_pause_cancel_signal_insert();

-- Package-only rollback proof.
BEGIN;
DROP FUNCTION public.observe_agentic_chat_turn_cancellations(jsonb);
SELECT pg_temp.assert_true(
	to_regprocedure('public.observe_agentic_chat_turn_cancellations(jsonb)') IS NULL,
	'cancellation observation RPC remained during rollback proof'
);
ROLLBACK;
SELECT pg_temp.assert_true(
	to_regprocedure('public.observe_agentic_chat_turn_cancellations(jsonb)') IS NOT NULL,
	'rollback did not restore cancellation observation RPC'
);

DROP FUNCTION public.test_authenticated_cancel_observer_wrapper();

SELECT 'phase2c_cancel_observation_ok' AS proof;
