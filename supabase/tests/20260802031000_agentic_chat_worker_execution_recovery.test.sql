-- supabase/tests/20260802031000_agentic_chat_worker_execution_recovery.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2B Slice 5.
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

CREATE OR REPLACE FUNCTION pg_temp.seed_recovery_turn(
	p_turn_id uuid,
	p_user_id uuid,
	p_session_id uuid,
	p_job_id uuid,
	p_correlation_id uuid,
	p_processing_token uuid,
	p_attempts integer DEFAULT 0,
	p_queue_age interval DEFAULT interval '0 seconds',
	p_artifact_retention interval DEFAULT interval '7 days'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_message_id uuid := gen_random_uuid();
	v_artifact_id uuid := gen_random_uuid();
BEGIN
	INSERT INTO public.users (id) VALUES (p_user_id);
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (p_session_id, p_user_id, 'global', 'active');
	INSERT INTO public.chat_messages (
		id, session_id, user_id, role, content, metadata
	) VALUES (
		v_message_id, p_session_id, p_user_id, 'user', 'recovery fixture',
		jsonb_build_object('idempotency_key', 'recovery:' || p_turn_id::text || ':user')
	);
	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, created_at, updated_at,
		dedup_key, status, queue_job_id, processing_token, started_at,
		attempts, max_attempts
	) VALUES (
		p_job_id,
		p_user_id,
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', p_turn_id::text,
			'correlationId', p_correlation_id::text
		),
		now(),
		now() - p_queue_age,
		now(),
		'agentic-chat-turn:' || p_turn_id::text,
		'processing',
		'agentic_chat_turn_' || p_turn_id::text,
		p_processing_token,
		now(),
		p_attempts,
		3
	);
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, worker_started_at, last_progress_at,
		last_event_sequence, user_message_id
	) VALUES (
		p_turn_id, p_session_id, p_user_id,
		'recovery-stream-' || p_turn_id::text,
		'recovery-client-' || p_turn_id::text,
		'global', 'recovery fixture', 'running', 'worker_realtime', p_job_id,
		p_correlation_id, 1, now(), now(), 0, v_message_id
	);
	INSERT INTO public.chat_turn_input_artifacts (
		id, turn_run_id, session_id, user_id, artifact_version, history_source,
		history, prepared, content_hash, history_bytes, content_bytes, created_at,
		retain_until
	) VALUES (
		v_artifact_id, p_turn_id, p_session_id, p_user_id,
		'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb,
		repeat('a', 64), 2, 4,
		now() + p_artifact_retention - interval '7 days',
		now() + p_artifact_retention
	);
	UPDATE public.chat_turn_runs
	SET input_artifact_id = v_artifact_id
	WHERE id = p_turn_id;
END;
$$;

SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	'f2000000-0000-4000-8000-000000000001',
	'f3000000-0000-4000-8000-000000000001',
	'f8000000-0000-4000-8000-000000000001',
	'f9000000-0000-4000-8000-000000000001'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000002',
	'f1000000-0000-4000-8000-000000000002',
	'f2000000-0000-4000-8000-000000000002',
	'f3000000-0000-4000-8000-000000000002',
	'f8000000-0000-4000-8000-000000000002',
	'f9000000-0000-4000-8000-000000000002'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000003',
	'f1000000-0000-4000-8000-000000000003',
	'f2000000-0000-4000-8000-000000000003',
	'f3000000-0000-4000-8000-000000000003',
	'f8000000-0000-4000-8000-000000000003',
	'f9000000-0000-4000-8000-000000000003', 1
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000004',
	'f1000000-0000-4000-8000-000000000004',
	'f2000000-0000-4000-8000-000000000004',
	'f3000000-0000-4000-8000-000000000004',
	'f8000000-0000-4000-8000-000000000004',
	'f9000000-0000-4000-8000-000000000004', 0, interval '301 seconds',
	interval '-1 second'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000005',
	'f1000000-0000-4000-8000-000000000005',
	'f2000000-0000-4000-8000-000000000005',
	'f3000000-0000-4000-8000-000000000005',
	'f8000000-0000-4000-8000-000000000005',
	'f9000000-0000-4000-8000-000000000005'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000006',
	'f1000000-0000-4000-8000-000000000006',
	'f2000000-0000-4000-8000-000000000006',
	'f3000000-0000-4000-8000-000000000006',
	'f8000000-0000-4000-8000-000000000006',
	'f9000000-0000-4000-8000-000000000006'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000007',
	'f1000000-0000-4000-8000-000000000007',
	'f2000000-0000-4000-8000-000000000007',
	'f3000000-0000-4000-8000-000000000007',
	'f8000000-0000-4000-8000-000000000007',
	'f9000000-0000-4000-8000-000000000007'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000008',
	'f1000000-0000-4000-8000-000000000008',
	'f2000000-0000-4000-8000-000000000008',
	'f3000000-0000-4000-8000-000000000008',
	'f8000000-0000-4000-8000-000000000008',
	'f9000000-0000-4000-8000-000000000008'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000009',
	'f1000000-0000-4000-8000-000000000009',
	'f2000000-0000-4000-8000-000000000009',
	'f3000000-0000-4000-8000-000000000009',
	'f8000000-0000-4000-8000-000000000009',
	'f9000000-0000-4000-8000-000000000009'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000010',
	'f1000000-0000-4000-8000-000000000010',
	'f2000000-0000-4000-8000-000000000010',
	'f3000000-0000-4000-8000-000000000010',
	'f8000000-0000-4000-8000-000000000010',
	'f9000000-0000-4000-8000-000000000010'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000011',
	'f1000000-0000-4000-8000-000000000011',
	'f2000000-0000-4000-8000-000000000011',
	'f3000000-0000-4000-8000-000000000011',
	'f8000000-0000-4000-8000-000000000011',
	'f9000000-0000-4000-8000-000000000011'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000012',
	'f1000000-0000-4000-8000-000000000012',
	'f2000000-0000-4000-8000-000000000012',
	'f3000000-0000-4000-8000-000000000012',
	'f8000000-0000-4000-8000-000000000012',
	'f9000000-0000-4000-8000-000000000012'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000013',
	'f1000000-0000-4000-8000-000000000013',
	'f2000000-0000-4000-8000-000000000013',
	'f3000000-0000-4000-8000-000000000013',
	'f8000000-0000-4000-8000-000000000013',
	'f9000000-0000-4000-8000-000000000013'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000014',
	'f1000000-0000-4000-8000-000000000014',
	'f2000000-0000-4000-8000-000000000014',
	'f3000000-0000-4000-8000-000000000014',
	'f8000000-0000-4000-8000-000000000014',
	'f9000000-0000-4000-8000-000000000014', 0, interval '301 seconds',
	interval '-1 second'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000015',
	'f1000000-0000-4000-8000-000000000015',
	'f2000000-0000-4000-8000-000000000015',
	'f3000000-0000-4000-8000-000000000015',
	'f8000000-0000-4000-8000-000000000015',
	'f9000000-0000-4000-8000-000000000015'
);
SELECT pg_temp.seed_recovery_turn(
	'f4000000-0000-4000-8000-000000000016',
	'f1000000-0000-4000-8000-000000000016',
	'f2000000-0000-4000-8000-000000000016',
	'f3000000-0000-4000-8000-000000000016',
	'f8000000-0000-4000-8000-000000000016',
	'f9000000-0000-4000-8000-000000000016', 0, interval '301 seconds'
);

CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
DECLARE
	v_begin regprocedure := to_regprocedure(
		'public.begin_agentic_chat_turn_execution(uuid,uuid,uuid,integer)'
	);
	v_recover regprocedure := to_regprocedure(
		'public.recover_agentic_chat_turn(uuid,uuid,uuid,integer,text,text)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_begin IS NOT NULL, 'execution-start RPC is missing');
	PERFORM pg_temp.assert_true(v_recover IS NOT NULL, 'recovery RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_begin, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_begin, 'EXECUTE')
			AND has_function_privilege('service_role', v_begin, 'EXECUTE'),
		'execution-start grants are not service-only'
	);
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_recover, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_recover, 'EXECUTE')
			AND has_function_privilege('service_role', v_recover, 'EXECUTE'),
		'recovery grants are not service-only'
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_authenticated_execution_wrapper()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000001',
		'f3000000-0000-4000-8000-000000000001',
		'f9000000-0000-4000-8000-000000000001', 1
	);
$$;
GRANT EXECUTE ON FUNCTION public.test_authenticated_execution_wrapper() TO authenticated;
CREATE OR REPLACE FUNCTION public.test_authenticated_recovery_wrapper()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000002',
		'f3000000-0000-4000-8000-000000000002',
		'f9000000-0000-4000-8000-000000000002', 1,
		'transient_infra', NULL
	);
$$;
GRANT EXECUTE ON FUNCTION public.test_authenticated_recovery_wrapper() TO authenticated;

SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.test_authenticated_execution_wrapper()',
		'agentic_chat_execution_start_service_role_required'
	)
		AND pg_temp.expect_error(
			'SELECT public.test_authenticated_recovery_wrapper()',
			'agentic_chat_recovery_service_role_required'
		),
	'signed authenticated caller crossed an execution/recovery definer wrapper'
);
RESET ROLE;
RESET request.jwt.claims;
DROP FUNCTION public.test_authenticated_execution_wrapper();
DROP FUNCTION public.test_authenticated_recovery_wrapper();

SET ROLE service_role;
CREATE TEMP TABLE execution_recovery_results (name text PRIMARY KEY, result jsonb);

INSERT INTO execution_recovery_results VALUES (
	'first_start',
	public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000001',
		'f3000000-0000-4000-8000-000000000001',
		'f9000000-0000-4000-8000-000000000001', 1
	)
), (
	'lost_response_start',
	public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000001',
		'f3000000-0000-4000-8000-000000000001',
		'f9000000-0000-4000-8000-000000000001', 1
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'started'
		AND (result->>'invoke_provider')::boolean
	 FROM execution_recovery_results WHERE name = 'first_start')
		AND (SELECT result->>'outcome' = 'already_started'
			AND NOT (result->>'invoke_provider')::boolean
		 FROM execution_recovery_results WHERE name = 'lost_response_start')
		AND (SELECT execution_started_at IS NOT NULL
			FROM public.chat_turn_runs
			WHERE id = 'f4000000-0000-4000-8000-000000000001'),
	'provider-start receipt replay authorized duplicate invocation'
);
INSERT INTO execution_recovery_results VALUES (
	'stale_start',
	public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000014',
		'f3000000-0000-4000-8000-000000000014',
		'f9000000-0000-4000-8000-000000000014', 1
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'stale_context'
		AND NOT (result->>'invoke_provider')::boolean
	 FROM execution_recovery_results WHERE name = 'stale_start')
		AND (SELECT execution_started_at IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'f4000000-0000-4000-8000-000000000014'),
	'stale input crossed the provider-start fence'
);
INSERT INTO execution_recovery_results VALUES (
	'long_queue_wait_start',
	public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000016',
		'f3000000-0000-4000-8000-000000000016',
		'f9000000-0000-4000-8000-000000000016', 1
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'started'
		AND (result->>'invoke_provider')::boolean
	 FROM execution_recovery_results WHERE name = 'long_queue_wait_start'),
	'a valid frozen input was rejected after waiting more than five minutes'
);

-- Two current owners can race the same durable fence, but exactly one response
-- may authorize provider invocation. The loser observes the committed receipt.
RESET ROLE;
CREATE OR REPLACE FUNCTION public.test_pause_execution_start()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.id IN (
		'f4000000-0000-4000-8000-000000000010',
		'f4000000-0000-4000-8000-000000000011'
	)
		AND OLD.execution_started_at IS NULL
		AND NEW.execution_started_at IS NOT NULL THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_execution_start
BEFORE UPDATE OF execution_started_at ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_pause_execution_start();

SELECT dblink_connect('execution_start_a', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_connect('execution_start_b', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_send_query('execution_start_a', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000010',
		'f3000000-0000-4000-8000-000000000010',
		'f9000000-0000-4000-8000-000000000010', 1
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('execution_start_b', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000010',
		'f3000000-0000-4000-8000-000000000010',
		'f9000000-0000-4000-8000-000000000010', 1
	) FROM trusted
$query$);
CREATE TEMP TABLE execution_start_race_results (result jsonb);
INSERT INTO execution_start_race_results
SELECT result FROM dblink_get_result('execution_start_a', false) AS response(result jsonb);
INSERT INTO execution_start_race_results
SELECT result FROM dblink_get_result('execution_start_b', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM execution_start_race_results
		WHERE result->>'outcome' = 'started'
			AND (result->>'invoke_provider')::boolean)
		AND (SELECT count(*) = 1 FROM execution_start_race_results
			WHERE result->>'outcome' = 'already_started'
				AND NOT (result->>'invoke_provider')::boolean),
	'concurrent provider-start fence produced zero or multiple invocation winners'
);
SELECT dblink_disconnect('execution_start_a');
SELECT dblink_disconnect('execution_start_b');

-- Start-first serializes recovery behind the provider boundary, so even a
-- nominally transient failure cannot requeue the whole turn.
SELECT dblink_connect('start_recovery_start', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_connect('start_recovery_recover', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_send_query('start_recovery_start', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000011',
		'f3000000-0000-4000-8000-000000000011',
		'f9000000-0000-4000-8000-000000000011', 1
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('start_recovery_recover', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000011',
		'f3000000-0000-4000-8000-000000000011',
		'f9000000-0000-4000-8000-000000000011', 1,
		'transient_infra', NULL
	) FROM trusted
$query$);
CREATE TEMP TABLE start_first_race_results (name text, result jsonb);
INSERT INTO start_first_race_results
SELECT 'start', result
FROM dblink_get_result('start_recovery_start', false) AS response(result jsonb);
INSERT INTO start_first_race_results
SELECT 'recovery', result
FROM dblink_get_result('start_recovery_recover', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'started' FROM start_first_race_results WHERE name = 'start')
		AND (SELECT result->>'outcome' = 'finalize_failed'
			AND NOT (result->>'execution_may_retry')::boolean
			FROM start_first_race_results WHERE name = 'recovery')
		AND (SELECT status = 'running' AND execution_started_at IS NOT NULL
			FROM public.chat_turn_runs
			WHERE id = 'f4000000-0000-4000-8000-000000000011'),
	'start-first race allowed post-start whole-turn retry'
);
SELECT dblink_disconnect('start_recovery_start');
SELECT dblink_disconnect('start_recovery_recover');

-- Recovery-first atomically returns the turn/job to queued/pending. A late
-- start caller loses the predecessor state and never receives permission.
CREATE OR REPLACE FUNCTION public.test_pause_execution_recovery()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.id = 'f4000000-0000-4000-8000-000000000012'
		AND OLD.status = 'running'
		AND NEW.status = 'queued' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_execution_recovery
BEFORE UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_pause_execution_recovery();
CREATE OR REPLACE FUNCTION public.test_start_after_recovery_result()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
	RETURN public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000012',
		'f3000000-0000-4000-8000-000000000012',
		'f9000000-0000-4000-8000-000000000012', 1
	);
EXCEPTION WHEN OTHERS THEN
	RETURN jsonb_build_object('error', SQLERRM, 'invoke_provider', false);
END;
$$;
SELECT dblink_connect('recovery_start_recover', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_connect('recovery_start_start', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_send_query('recovery_start_recover', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000012',
		'f3000000-0000-4000-8000-000000000012',
		'f9000000-0000-4000-8000-000000000012', 1,
		'transient_infra', NULL
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('recovery_start_start', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.test_start_after_recovery_result() FROM trusted
$query$);
CREATE TEMP TABLE recovery_first_race_results (name text, result jsonb);
INSERT INTO recovery_first_race_results
SELECT 'recovery', result
FROM dblink_get_result('recovery_start_recover', false) AS response(result jsonb);
INSERT INTO recovery_first_race_results
SELECT 'start', result
FROM dblink_get_result('recovery_start_start', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'retry_scheduled'
		FROM recovery_first_race_results WHERE name = 'recovery')
		AND (SELECT result->>'error' LIKE '%agentic_chat_execution_start_invalid_status%'
			AND NOT (result->>'invoke_provider')::boolean
			FROM recovery_first_race_results WHERE name = 'start')
		AND (
			SELECT turns.status = 'queued'
				AND turns.execution_started_at IS NULL
				AND jobs.status::text = 'pending'
				AND jobs.processing_token IS NULL
			FROM public.chat_turn_runs turns
			JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
			WHERE turns.id = 'f4000000-0000-4000-8000-000000000012'
		),
	'recovery-first race authorized provider start or split queue/domain state'
);
SELECT dblink_disconnect('recovery_start_recover');
SELECT dblink_disconnect('recovery_start_start');
DROP TRIGGER test_pause_execution_recovery ON public.chat_turn_runs;
DROP FUNCTION public.test_pause_execution_recovery();
DROP FUNCTION public.test_start_after_recovery_result();

-- execution_started_at is captured after the queue lock, not before waiting.
SELECT dblink_connect('execution_clock_lock', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_connect('execution_clock_start', format(
	'dbname=%L host=%L port=%L', current_database(),
	current_setting('unix_socket_directories'), current_setting('port')
));
SELECT dblink_exec('execution_clock_lock', 'BEGIN');
SELECT id
FROM dblink(
	'execution_clock_lock',
	$lock$SELECT id FROM public.queue_jobs
		WHERE id = 'f3000000-0000-4000-8000-000000000013' FOR UPDATE$lock$
) AS locked(id uuid);
SELECT dblink_send_query('execution_clock_start', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.begin_agentic_chat_turn_execution(
		'f4000000-0000-4000-8000-000000000013',
		'f3000000-0000-4000-8000-000000000013',
		'f9000000-0000-4000-8000-000000000013', 1
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
CREATE TEMP TABLE execution_clock_threshold AS
SELECT clock_timestamp() AS released_after;
SELECT dblink_exec('execution_clock_lock', 'COMMIT');
CREATE TEMP TABLE execution_clock_result (result jsonb);
INSERT INTO execution_clock_result
SELECT result
FROM dblink_get_result('execution_clock_start', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'started' FROM execution_clock_result)
		AND (
			SELECT turns.execution_started_at >= threshold.released_after
			FROM public.chat_turn_runs turns
			CROSS JOIN execution_clock_threshold threshold
			WHERE turns.id = 'f4000000-0000-4000-8000-000000000013'
		),
	'execution-start timestamp was captured before the governing queue lock'
);
SELECT dblink_disconnect('execution_clock_lock');
SELECT dblink_disconnect('execution_clock_start');
DROP TRIGGER test_pause_execution_start ON public.chat_turn_runs;
DROP FUNCTION public.test_pause_execution_start();

SET ROLE service_role;

INSERT INTO execution_recovery_results VALUES (
	'prestart_transient',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000002',
		'f3000000-0000-4000-8000-000000000002',
		'f9000000-0000-4000-8000-000000000002', 1,
		'transient_infra', 'fixture transient'
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'retry_scheduled'
		AND (result->>'execution_may_retry')::boolean
	 FROM execution_recovery_results WHERE name = 'prestart_transient')
		AND (
			SELECT turns.status = 'queued'
				AND turns.execution_started_at IS NULL
				AND jobs.status::text = 'pending'
				AND jobs.processing_token IS NULL
				AND jobs.attempts = 1
				AND jobs.scheduled_for > jobs.updated_at
			FROM public.chat_turn_runs turns
			JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
			WHERE turns.id = 'f4000000-0000-4000-8000-000000000002'
		),
	'safe pre-start recovery did not atomically requeue turn and queue'
);
INSERT INTO execution_recovery_results VALUES (
	'prestart_transient_replay',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000002',
		'f3000000-0000-4000-8000-000000000002',
		'f9000000-0000-4000-8000-000000000002', 1,
		'transient_infra', 'replayed'
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'already_requeued'
		AND NOT (result->>'execution_may_retry')::boolean
	 FROM execution_recovery_results WHERE name = 'prestart_transient_replay')
		AND (SELECT attempts = 1 FROM public.queue_jobs
			WHERE id = 'f3000000-0000-4000-8000-000000000002'),
	'recovery replay consumed another attempt'
);

INSERT INTO execution_recovery_results VALUES (
	'timeout_retry_exhausted',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000003',
		'f3000000-0000-4000-8000-000000000003',
		'f9000000-0000-4000-8000-000000000003', 1,
		'timeout_pre_start', NULL
	)
), (
	'stale_context',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000004',
		'f3000000-0000-4000-8000-000000000004',
		'f9000000-0000-4000-8000-000000000004', 1,
		'transient_infra', NULL
	)
), (
	'unknown',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000005',
		'f3000000-0000-4000-8000-000000000005',
		'f9000000-0000-4000-8000-000000000005', 1,
		'unknown', NULL
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalize_failed'
		AND (result->>'retry_exhausted')::boolean
	 FROM execution_recovery_results WHERE name = 'timeout_retry_exhausted')
		AND (SELECT result->>'outcome' = 'finalize_failed'
			AND result->>'failure_code' = 'stale_context'
		 FROM execution_recovery_results WHERE name = 'stale_context')
		AND (SELECT result->>'outcome' = 'finalize_failed'
			AND result->>'failure_code' = 'unknown'
		 FROM execution_recovery_results WHERE name = 'unknown')
		AND (SELECT bool_and(status = 'running') FROM public.chat_turn_runs
			WHERE id IN (
				'f4000000-0000-4000-8000-000000000003',
				'f4000000-0000-4000-8000-000000000004',
				'f4000000-0000-4000-8000-000000000005'
			)),
	'nonretry recovery class changed active state or returned the wrong decision'
);

UPDATE public.chat_turn_runs
SET execution_started_at = clock_timestamp()
WHERE id = 'f4000000-0000-4000-8000-000000000006';
INSERT INTO execution_recovery_results VALUES (
	'post_start_transient',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000006',
		'f3000000-0000-4000-8000-000000000006',
		'f9000000-0000-4000-8000-000000000006', 1,
		'transient_infra', NULL
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalize_failed'
		AND NOT (result->>'execution_may_retry')::boolean
	 FROM execution_recovery_results WHERE name = 'post_start_transient')
		AND (SELECT status = 'running' FROM public.chat_turn_runs
			WHERE id = 'f4000000-0000-4000-8000-000000000006'),
	'post-start transient failure was requeued'
);

UPDATE public.chat_turn_runs
SET cancel_requested_at = clock_timestamp(), cancel_reason = 'user_cancelled'
WHERE id = 'f4000000-0000-4000-8000-000000000007';
INSERT INTO execution_recovery_results VALUES (
	'accepted_cancel',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000007',
		'f3000000-0000-4000-8000-000000000007',
		'f9000000-0000-4000-8000-000000000007', 1,
		'transient_infra', NULL
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalize_cancelled'
		AND result->>'failure_code' = 'cancelled'
	 FROM execution_recovery_results WHERE name = 'accepted_cancel'),
	'accepted cancellation did not take precedence over retry'
);

RESET ROLE;
INSERT INTO public.chat_turn_effects (
	id, turn_run_id, session_id, user_id, execution_generation,
	tool_name, operation_name, canonical_argument_hash,
	downstream_idempotency_supported
) SELECT
	'f5000000-0000-4000-8000-000000000008', turns.id, turns.session_id,
	turns.user_id, 1, 'task_update', 'update_task', repeat('b', 64), false
FROM public.chat_turn_runs turns
WHERE turns.id = 'f4000000-0000-4000-8000-000000000008';
UPDATE public.chat_turn_runs
SET execution_started_at = clock_timestamp(), mutation_reserved_at = clock_timestamp()
WHERE id = 'f4000000-0000-4000-8000-000000000008';
SET ROLE service_role;
INSERT INTO execution_recovery_results VALUES (
	'blocking_effect',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000008',
		'f3000000-0000-4000-8000-000000000008',
		'f9000000-0000-4000-8000-000000000008', 1,
		'transient_infra', NULL
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'effect_reconciliation_required'
		AND (result->>'blocking_effect_count')::integer = 1
	 FROM execution_recovery_results WHERE name = 'blocking_effect')
		AND (SELECT status = 'running' FROM public.chat_turn_runs
			WHERE id = 'f4000000-0000-4000-8000-000000000008'),
	'blocking effect permitted whole-turn recovery'
);

-- Even a terminal effect forbids whole-turn replay if defensive boundary
-- metadata were ever missing or corrupted. It needs no further effect
-- reconciliation, but recovery must still fail closed.
RESET ROLE;
INSERT INTO public.chat_turn_effects (
	id, turn_run_id, session_id, user_id, execution_generation,
	tool_name, operation_name, canonical_argument_hash,
	downstream_idempotency_supported
) SELECT
	'f5000000-0000-4000-8000-000000000015', turns.id, turns.session_id,
	turns.user_id, 1, 'task_update', 'update_task', repeat('c', 64), true
FROM public.chat_turn_runs turns
WHERE turns.id = 'f4000000-0000-4000-8000-000000000015';
UPDATE public.chat_turn_effects
SET state = 'started', started_at = clock_timestamp()
WHERE id = 'f5000000-0000-4000-8000-000000000015';
UPDATE public.chat_turn_effects
SET state = 'succeeded', finished_at = clock_timestamp()
WHERE id = 'f5000000-0000-4000-8000-000000000015';
SET ROLE service_role;
INSERT INTO execution_recovery_results VALUES (
	'terminal_effect_no_boundary',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000015',
		'f3000000-0000-4000-8000-000000000015',
		'f9000000-0000-4000-8000-000000000015', 1,
		'transient_infra', NULL
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalize_failed'
		AND NOT (result->>'execution_may_retry')::boolean
	 FROM execution_recovery_results WHERE name = 'terminal_effect_no_boundary')
		AND (SELECT status = 'running' FROM public.chat_turn_runs
			WHERE id = 'f4000000-0000-4000-8000-000000000015'),
	'terminal effect with missing boundary metadata permitted whole-turn replay'
);

RESET ROLE;
UPDATE public.chat_turn_runs
SET status = 'completed', finished_reason = 'stop', finished_at = clock_timestamp(),
	terminalized_at = clock_timestamp()
WHERE id = 'f4000000-0000-4000-8000-000000000009';
SET ROLE service_role;
INSERT INTO execution_recovery_results VALUES (
	'terminal_queue',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000009',
		'f3000000-0000-4000-8000-000000000009',
		'f9000000-0000-4000-8000-000000000009', 1,
		'unknown', NULL
	)
), (
	'terminal_queue_replay',
	public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000009',
		'f3000000-0000-4000-8000-000000000009',
		'f9000000-0000-4000-8000-000000000009', 1,
		'unknown', NULL
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'queue_reconciled'
	 FROM execution_recovery_results WHERE name = 'terminal_queue')
		AND (SELECT result->>'outcome' = 'already_reconciled'
		 FROM execution_recovery_results WHERE name = 'terminal_queue_replay')
		AND (SELECT status::text = 'completed' AND processing_token IS NULL
			FROM public.queue_jobs
			WHERE id = 'f3000000-0000-4000-8000-000000000009'),
	'terminal domain queue reconciliation was not idempotent'
);

SELECT pg_temp.assert_true(
	(public.recover_agentic_chat_turn(
		'f4000000-0000-4000-8000-000000000005',
		'f3000000-0000-4000-8000-000000000005',
		'f9000000-0000-4000-8000-000000000005', 2,
		'unknown', NULL
	)->>'outcome') = 'stale_generation',
	'stale recovery generation was not a typed no-op'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.recover_agentic_chat_turn(
				'f4000000-0000-4000-8000-000000000005',
				'f3000000-0000-4000-8000-000000000005',
				'f9000000-0000-4000-8000-000000000099', 1,
				'transient_infra', NULL
			)
		$test$,
		'agentic_chat_recovery_ownership_lost'
	),
	'forged recovery token retained authority'
);

RESET ROLE;
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.recover_agentic_chat_turn(
	'f4000000-0000-4000-8000-000000000005',
	'f3000000-0000-4000-8000-000000000005',
	'f9000000-0000-4000-8000-000000000005', 1,
	'transient_infra', 'rollback fixture'
);
ROLLBACK;
SELECT pg_temp.assert_true(
	(SELECT turns.status = 'running'
		AND jobs.status::text = 'processing'
		AND jobs.processing_token = 'f9000000-0000-4000-8000-000000000005'
	 FROM public.chat_turn_runs turns
	 JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
	 WHERE turns.id = 'f4000000-0000-4000-8000-000000000005'),
	'recovery rollback left split turn/queue state'
);

DROP FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text);
DROP FUNCTION public.begin_agentic_chat_turn_execution(uuid, uuid, uuid, integer);
SELECT pg_temp.assert_true(
	to_regprocedure('public.recover_agentic_chat_turn(uuid,uuid,uuid,integer,text,text)') IS NULL
		AND to_regprocedure(
			'public.begin_agentic_chat_turn_execution(uuid,uuid,uuid,integer)'
		) IS NULL
		AND to_regprocedure(
			'public.finalize_agentic_chat_turn(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb)'
		) IS NOT NULL,
	'slice-only rollback removed an earlier terminal primitive'
);

SELECT 'phase2b_execution_recovery_ok' AS result;
