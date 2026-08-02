-- supabase/tests/20260802020100_agentic_chat_worker_claim_fencing.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2B Slice 3B.
-- Prerequisite: apply 20260802020100_agentic_chat_worker_claim_fencing.sql
-- after the Slice 3A proof has left its disposable fixture rows in place.

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

DO $$
DECLARE
	v_claim regprocedure := to_regprocedure(
		'public.claim_agentic_chat_turn(uuid,uuid,uuid)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_claim IS NOT NULL, 'worker claim RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_claim, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_claim, 'EXECUTE')
			AND has_function_privilege('service_role', v_claim, 'EXECUTE'),
		'worker claim grants are not service-only'
	);
END;
$$;

-- Move one atomically admitted queue envelope into the generic queue-owned
-- processing state. The domain turn remains queued until the fenced bridge wins.
UPDATE public.queue_jobs jobs
SET status = 'processing',
	processing_token = 'd9000000-0000-4000-8000-000000000001',
	started_at = now(),
	updated_at = now()
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000001'
	AND jobs.id = turns.queue_job_id;

SET ROLE service_role;

CREATE TEMP TABLE claim_results (name text PRIMARY KEY, result jsonb);
INSERT INTO claim_results
SELECT
	'first_claim',
	public.claim_agentic_chat_turn(
		turns.id,
		turns.queue_job_id,
		'd9000000-0000-4000-8000-000000000001'
	)
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'claimed'
		AND (result->>'execution_may_start')::boolean
		AND (result->>'execution_generation')::integer = 1
	FROM claim_results WHERE name = 'first_claim'),
	'first queue/domain claim did not win generation 1'
);
SELECT pg_temp.assert_true(
	(
		SELECT turns.status = 'running'
			AND turns.execution_generation = 1
			AND turns.worker_started_at IS NOT NULL
			AND turns.execution_started_at IS NULL
			AND turns.last_event_sequence = 0
			AND streams.execution_generation = 1
			AND streams.snapshot_sequence = 0
			AND streams.durable_through_sequence = 0
			AND streams.projection_durable_sequence = 0
			AND streams.assistant_text = ''
			AND streams.projection = '{}'::jsonb
			AND NOT streams.reconcile_required
		FROM public.chat_turn_runs turns
		JOIN public.chat_turn_stream_state streams ON streams.turn_run_id = turns.id
		WHERE turns.id = 'd4000000-0000-4000-8000-000000000001'
	),
	'claim did not atomically establish/reset the current generation'
);

-- A lost claim response can be retried with the same live queue token without
-- incrementing the generation again.
INSERT INTO claim_results
SELECT
	'repeated_claim',
	public.claim_agentic_chat_turn(
		turns.id,
		turns.queue_job_id,
		'd9000000-0000-4000-8000-000000000001'
	)
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'matching_current_claim'
		AND (result->>'execution_may_start')::boolean
		AND (result->>'execution_generation')::integer = 1
	FROM claim_results WHERE name = 'repeated_claim')
		AND (SELECT execution_generation = 1 FROM public.chat_turn_runs WHERE id = 'd4000000-0000-4000-8000-000000000001'),
	'repeated current-token claim incremented or lost generation ownership'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.claim_agentic_chat_turn(
				turns.id, turns.queue_job_id,
				'd9000000-0000-4000-8000-000000000099'
			)
			FROM public.chat_turn_runs turns
			WHERE turns.id = 'd4000000-0000-4000-8000-000000000001'
		$test$,
		'agentic_chat_claim_ownership_lost'
	),
	'stale processing token retained claim authority'
);

-- A transaction rollback proves the turn/generation/stream reset is one unit.
RESET ROLE;
UPDATE public.queue_jobs jobs
SET status = 'processing',
	processing_token = 'd9000000-0000-4000-8000-000000000003',
	started_at = now(),
	updated_at = now()
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000003'
	AND jobs.id = turns.queue_job_id;

BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(
	(
		SELECT (public.claim_agentic_chat_turn(
			turns.id,
			turns.queue_job_id,
			'd9000000-0000-4000-8000-000000000003'
		)->>'execution_generation')::integer = 1
		FROM public.chat_turn_runs turns
		WHERE turns.id = 'd4000000-0000-4000-8000-000000000003'
	),
	'rollback fixture did not claim inside its transaction'
);
ROLLBACK;
SELECT pg_temp.assert_true(
	(SELECT status = 'queued' AND execution_generation = 0 FROM public.chat_turn_runs WHERE id = 'd4000000-0000-4000-8000-000000000003')
		AND NOT EXISTS (SELECT 1 FROM public.chat_turn_stream_state WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000003'),
	'claim rollback left a partial turn or stream generation'
);

-- Queue metadata, not possession of a job id/token alone, is part of ownership.
UPDATE public.queue_jobs jobs
SET metadata = jsonb_set(metadata, '{turnRunId}', '"d4000000-0000-4000-8000-000000000099"'::jsonb)
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000003'
	AND jobs.id = turns.queue_job_id;
SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.claim_agentic_chat_turn(
				turns.id, turns.queue_job_id,
				'd9000000-0000-4000-8000-000000000003'
			)
			FROM public.chat_turn_runs turns
			WHERE turns.id = 'd4000000-0000-4000-8000-000000000003'
		$test$,
		'agentic_chat_claim_ownership_lost'
	),
	'forged queue metadata retained claim authority'
);
RESET ROLE;
UPDATE public.queue_jobs jobs
SET metadata = jsonb_set(metadata, '{turnRunId}', to_jsonb(turns.id::text))
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000003'
	AND jobs.id = turns.queue_job_id;

-- A cancellation accepted while queued wins before claim and does not advance
-- the domain generation.
UPDATE public.chat_turn_runs
SET cancel_requested_at = now(), cancel_reason = 'user_cancelled'
WHERE id = 'd4000000-0000-4000-8000-000000000003';
SET ROLE service_role;
INSERT INTO claim_results
SELECT
	'queued_cancel',
	public.claim_agentic_chat_turn(
		turns.id,
		turns.queue_job_id,
		'd9000000-0000-4000-8000-000000000003'
	)
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'cancel_requested'
		AND NOT (result->>'execution_may_start')::boolean
		AND (result->>'execution_generation')::integer = 0
	FROM claim_results WHERE name = 'queued_cancel')
		AND (SELECT status = 'queued' AND execution_generation = 0 FROM public.chat_turn_runs WHERE id = 'd4000000-0000-4000-8000-000000000003'),
	'queued cancellation lost to claim'
);
RESET ROLE;

-- Simulate the future safe-recovery predecessor: a running turn is put back in
-- queued state without crossing execution/effect boundaries. The next claim
-- must advance exactly once and reset every old-generation stream field.
UPDATE public.chat_turn_stream_state
SET snapshot_sequence = 3,
	durable_through_sequence = 3,
	projection_durable_sequence = 2,
	assistant_text = 'old generation text',
	projection = '{"old":true}'::jsonb,
	reconcile_required = true
WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001';
UPDATE public.chat_turn_runs turns
SET status = 'queued'
WHERE turns.id = 'd4000000-0000-4000-8000-000000000001';
UPDATE public.queue_jobs jobs
SET status = 'processing',
	processing_token = 'd9000000-0000-4000-8000-000000000002',
	started_at = now(),
	updated_at = now()
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000001'
	AND jobs.id = turns.queue_job_id;

SET ROLE service_role;
INSERT INTO claim_results
SELECT
	'generation_two',
	public.claim_agentic_chat_turn(
		turns.id,
		turns.queue_job_id,
		'd9000000-0000-4000-8000-000000000002'
	)
FROM public.chat_turn_runs turns
WHERE turns.id = 'd4000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'claimed' AND (result->>'execution_generation')::integer = 2 FROM claim_results WHERE name = 'generation_two')
		AND (
			SELECT turns.execution_generation = 2
				AND streams.execution_generation = 2
				AND streams.snapshot_sequence = 0
				AND streams.durable_through_sequence = 0
				AND streams.projection_durable_sequence = 0
				AND streams.assistant_text = ''
				AND streams.projection = '{}'::jsonb
				AND NOT streams.reconcile_required
			FROM public.chat_turn_runs turns
			JOIN public.chat_turn_stream_state streams ON streams.turn_run_id = turns.id
			WHERE turns.id = 'd4000000-0000-4000-8000-000000000001'
		),
	'new claim did not advance/reset the current generation exactly once'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			UPDATE public.chat_turn_stream_state
			SET execution_generation = 1
			WHERE turn_run_id = 'd4000000-0000-4000-8000-000000000001'
		$test$,
		'agentic_chat_stream_state_generation_mismatch'
	),
	'stale generation could rewrite current stream state'
);

-- Genuine two-connection contention: one call advances the queued turn and one
-- resolves the already-current claim; generation remains one.
DO $$
DECLARE
	v_turn_id uuid;
	v_job_id uuid;
BEGIN
	SELECT turns.id, turns.queue_job_id
	INTO v_turn_id, v_job_id
	FROM public.chat_turn_runs turns
	WHERE turns.client_turn_id = 'concurrent-inline-50';

	UPDATE public.queue_jobs
	SET status = 'processing',
		processing_token = 'd9000000-0000-4000-8000-000000000050',
		started_at = now(),
		updated_at = now()
	WHERE id = v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_pause_worker_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.client_turn_id = 'concurrent-inline-50'
		AND OLD.status = 'queued' AND NEW.status = 'running' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_worker_claim
BEFORE UPDATE ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_pause_worker_claim();

SELECT dblink_connect('worker_claim_a', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_connect('worker_claim_b', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));

SELECT dblink_send_query('worker_claim_a', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.claim_agentic_chat_turn(
		turns.id, turns.queue_job_id,
		'd9000000-0000-4000-8000-000000000050'
	)
	FROM public.chat_turn_runs turns, trusted
	WHERE turns.client_turn_id = 'concurrent-inline-50'
$query$);
SELECT dblink_send_query('worker_claim_b', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.claim_agentic_chat_turn(
		turns.id, turns.queue_job_id,
		'd9000000-0000-4000-8000-000000000050'
	)
	FROM public.chat_turn_runs turns, trusted
	WHERE turns.client_turn_id = 'concurrent-inline-50'
$query$);

CREATE TEMP TABLE concurrent_claim_results (result jsonb);
INSERT INTO concurrent_claim_results
SELECT result FROM dblink_get_result('worker_claim_a', false) AS response(result jsonb);
INSERT INTO concurrent_claim_results
SELECT result FROM dblink_get_result('worker_claim_b', false) AS response(result jsonb);
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM concurrent_claim_results WHERE result->>'outcome' = 'claimed') = 1
		AND (SELECT count(*) FROM concurrent_claim_results WHERE result->>'outcome' = 'matching_current_claim') = 1
		AND (SELECT count(DISTINCT (result->>'execution_generation')::integer) FROM concurrent_claim_results) = 1
		AND (SELECT execution_generation = 1 FROM public.chat_turn_runs WHERE client_turn_id = 'concurrent-inline-50'),
	'concurrent claim did not produce one generation winner'
);

SELECT dblink_disconnect('worker_claim_a');
SELECT dblink_disconnect('worker_claim_b');
DROP TRIGGER test_pause_worker_claim ON public.chat_turn_runs;
DROP FUNCTION public.test_pause_worker_claim();

-- Signed request-role validation also survives a definer wrapper.
CREATE OR REPLACE FUNCTION public.test_worker_claim_wrapper(
	p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.claim_agentic_chat_turn(p_turn_run_id, p_queue_job_id, p_processing_token)
$$;
GRANT EXECUTE ON FUNCTION public.test_worker_claim_wrapper(uuid, uuid, uuid) TO authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.test_worker_claim_wrapper(
				'd4000000-0000-4000-8000-000000000001',
				(SELECT queue_job_id FROM public.chat_turn_runs WHERE id = 'd4000000-0000-4000-8000-000000000001'),
				'd9000000-0000-4000-8000-000000000002'
			)
		$test$,
		'agentic_chat_claim_service_role_required'
	),
	'definer wrapper bypassed the claim request-role check'
);
RESET ROLE;
RESET request.jwt.claims;
DROP FUNCTION public.test_worker_claim_wrapper(uuid, uuid, uuid);

-- Package-only rollback removes claim while leaving admission and every prior
-- control/effect package intact.
BEGIN;
DROP FUNCTION public.claim_agentic_chat_turn(uuid, uuid, uuid);
SELECT pg_temp.assert_true(
	to_regprocedure('public.claim_agentic_chat_turn(uuid,uuid,uuid)') IS NULL
		AND to_regprocedure('public.create_agentic_chat_turn_with_job(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,uuid,uuid,text,boolean,text,jsonb,text,text,jsonb,integer,text,jsonb,jsonb,text,integer,integer,uuid,text,text,jsonb,boolean)') IS NOT NULL
		AND to_regprocedure('public.reserve_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,text,boolean,text)') IS NOT NULL
		AND to_regclass('public.chat_turn_stream_state') IS NOT NULL,
	'claim rollback removed or depended on an earlier package'
);
ROLLBACK;

SELECT 'phase2b_claim_fencing_ok' AS result;
