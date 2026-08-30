-- supabase/tests/20260830155952_agentic_chat_stale_legacy_turn_reaper.test.sql
-- D4b stale legacy-turn reaper contract.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked, staging,
-- or production database.

\set ON_ERROR_STOP on
\ir fixtures/agentic_chat_stale_legacy_turn_reaper_base.sql
\ir ../migrations/20260830155952_agentic_chat_stale_legacy_turn_reaper.sql

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

BEGIN;

DO $$
DECLARE
	v_function regprocedure :=
		'public.reap_stale_legacy_agentic_chat_turns(integer,integer)'::regprocedure;
BEGIN
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_function, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
			AND has_function_privilege('service_role', v_function, 'EXECUTE'),
		'reaper privileges are not service-only'
	);
	PERFORM pg_temp.assert_true(
		EXISTS (
			SELECT 1
			FROM pg_catalog.pg_proc procedures
			WHERE procedures.oid = v_function
				AND procedures.prosecdef
				AND procedures.proconfig @> ARRAY['search_path=""']::text[]
		),
		'reaper is not a locked-down security definer'
	);
END;
$$;

INSERT INTO public.users (id)
VALUES ('a1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id)
SELECT
	('a2000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
	'a1000000-0000-4000-8000-000000000001'::uuid
FROM generate_series(1, 6) series;

INSERT INTO public.chat_turn_runs (
	id,
	session_id,
	user_id,
	stream_run_id,
	request_message,
	status,
	execution_mode,
	started_at,
	last_progress_at
)
VALUES
	(
		'a3000000-0000-4000-8000-000000000001',
		'a2000000-0000-4000-8000-000000000001',
		'a1000000-0000-4000-8000-000000000001',
		'stale-heartbeat', 'stale legacy turn', 'running', 'legacy_sse',
		clock_timestamp() - interval '11 minutes',
		clock_timestamp() - interval '10 minutes'
	),
	(
		'a3000000-0000-4000-8000-000000000002',
		'a2000000-0000-4000-8000-000000000002',
		'a1000000-0000-4000-8000-000000000001',
		'stale-start', 'stale legacy turn without heartbeat', 'running', 'legacy_sse',
		clock_timestamp() - interval '10 minutes', NULL
	),
	(
		'a3000000-0000-4000-8000-000000000003',
		'a2000000-0000-4000-8000-000000000003',
		'a1000000-0000-4000-8000-000000000001',
		'fresh-heartbeat', 'fresh legacy heartbeat', 'running', 'legacy_sse',
		clock_timestamp() - interval '10 minutes',
		clock_timestamp() - interval '30 seconds'
	),
	(
		'a3000000-0000-4000-8000-000000000004',
		'a2000000-0000-4000-8000-000000000004',
		'a1000000-0000-4000-8000-000000000001',
		'fresh-start', 'fresh legacy turn', 'running', 'legacy_sse',
		clock_timestamp() - interval '30 seconds', NULL
	),
	(
		'a3000000-0000-4000-8000-000000000005',
		'a2000000-0000-4000-8000-000000000005',
		'a1000000-0000-4000-8000-000000000001',
		'stale-worker', 'stale worker turn', 'running', 'worker_realtime',
		clock_timestamp() - interval '11 minutes',
		clock_timestamp() - interval '10 minutes'
	),
	(
		'a3000000-0000-4000-8000-000000000006',
		'a2000000-0000-4000-8000-000000000006',
		'a1000000-0000-4000-8000-000000000001',
		'terminal-legacy', 'already terminal legacy turn', 'completed', 'legacy_sse',
		clock_timestamp() - interval '11 minutes',
		clock_timestamp() - interval '10 minutes'
	);

DO $$
DECLARE
	v_result jsonb;
BEGIN
	SET LOCAL ROLE service_role;
	v_result := public.reap_stale_legacy_agentic_chat_turns(1, 1);
	RESET ROLE;

	PERFORM pg_temp.assert_true(
		(v_result->>'reaped_count')::integer = 1
			AND (v_result->>'has_more')::boolean
			AND (v_result->>'progress_stale_after_seconds')::integer = 120
			AND (v_result->>'batch_size')::integer = 1,
		'reaper did not enforce its age floor and batch bound'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM public.chat_turn_runs WHERE status = 'cancelled') = 1,
		'reaper exceeded the requested batch size'
	);
END;
$$;

DO $$
DECLARE
	v_result jsonb;
BEGIN
	SET LOCAL ROLE service_role;
	v_result := public.reap_stale_legacy_agentic_chat_turns(150, 100);
	RESET ROLE;

	PERFORM pg_temp.assert_true(
		(v_result->>'reaped_count')::integer = 1
			AND NOT (v_result->>'has_more')::boolean,
		'reaper did not drain the remaining stale legacy turn'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1
			FROM public.chat_turn_runs
			WHERE stream_run_id IN ('fresh-heartbeat', 'fresh-start', 'stale-worker')
				AND status <> 'running'
		),
		'reaper touched a fresh legacy or worker turn'
	);
	PERFORM pg_temp.assert_true(
		(SELECT status FROM public.chat_turn_runs WHERE stream_run_id = 'terminal-legacy')
			= 'completed',
		'reaper changed an already terminal turn'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1
			FROM public.chat_turn_runs
			WHERE stream_run_id IN ('stale-heartbeat', 'stale-start')
				AND (
					status <> 'cancelled'
					OR finished_reason <> 'stale_running_turn_reaper'
					OR finished_at IS NULL
				)
		),
		'reaper did not apply the expected terminal state'
	);
END;
$$;

DO $$
DECLARE
	v_result jsonb;
BEGIN
	SET LOCAL ROLE service_role;
	v_result := public.reap_stale_legacy_agentic_chat_turns(150, 100);
	RESET ROLE;
	PERFORM pg_temp.assert_true(
		(v_result->>'reaped_count')::integer = 0,
		'reaper was not idempotent after the stale set drained'
	);
END;
$$;

SELECT 'agentic_chat_stale_legacy_turn_reaper_ok' AS result;

ROLLBACK;
