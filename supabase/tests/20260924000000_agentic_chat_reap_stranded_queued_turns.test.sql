-- supabase/tests/20260924000000_agentic_chat_reap_stranded_queued_turns.test.sql
-- Stranded queued-turn sweeper contract: only unclaimed worker turns queued past
-- the cutoff are finalized, through the real queued-cancel path (timeout /
-- sweeper), with a done event, a cancelled queue job, and no way for a returning
-- worker to claim them. Claimed, running, fresh, and terminal turns are untouched.
-- Also proves reconciliation accepts a generation-0 cancelled (queued-cancel)
-- terminal, which is how the browser learns about the timeout.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked, staging,
-- or production database.

\set ON_ERROR_STOP on
\ir fixtures/agentic_chat_workflow_v1_base.sql
\ir ../migrations/20260924000000_agentic_chat_reap_stranded_queued_turns.sql
-- Re-applying is a no-op (idempotent reaper and reconcile patch).
\ir ../migrations/20260924000000_agentic_chat_reap_stranded_queued_turns.sql

SET client_min_messages = warning;

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

CREATE OR REPLACE FUNCTION pg_temp.id(p_prefix text, p_n integer)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT (p_prefix || '000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- Seeds one worker turn in its own session. p_job_status is the queue row the
-- turn points at; a 'processing' job carries a worker lease token.
CREATE OR REPLACE FUNCTION pg_temp.seed_turn(
	p_n integer,
	p_turn_status text,
	p_job_status public.queue_status,
	p_generation integer,
	p_admitted_ago interval
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_user uuid := pg_temp.id('b1', 1);
	v_turn uuid := pg_temp.id('b4', p_n);
	v_admitted_at timestamptz := clock_timestamp() - p_admitted_ago;
BEGIN
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (pg_temp.id('b2', p_n), v_user, 'global', 'active');
	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status, queue_job_id,
		processing_token, started_at, attempts, max_attempts, created_at
	) VALUES (
		pg_temp.id('b5', p_n), v_user, 'agentic_chat_turn',
		jsonb_build_object('turnRunId', v_turn, 'correlationId', pg_temp.id('b6', p_n)),
		v_admitted_at, 'agentic-chat-turn:' || v_turn, p_job_status, 'reaper_' || p_n,
		CASE WHEN p_job_status = 'processing' THEN pg_temp.id('b7', p_n) END,
		CASE WHEN p_job_status = 'processing' THEN clock_timestamp() END,
		CASE WHEN p_generation > 0 THEN 1 ELSE 0 END, 3, v_admitted_at
	);
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, worker_started_at, last_event_sequence,
		started_at, created_at
	) VALUES (
		v_turn, pg_temp.id('b2', p_n), v_user,
		'reaper-stream-' || p_n, 'reaper-client-' || p_n,
		'global', 'reaper fixture ' || p_n, p_turn_status, 'worker_realtime',
		pg_temp.id('b5', p_n), pg_temp.id('b6', p_n), p_generation,
		CASE WHEN p_generation > 0 THEN v_admitted_at END,
		0, v_admitted_at, v_admitted_at
	);
	IF p_generation > 0 THEN
		INSERT INTO public.chat_turn_stream_state (
			turn_run_id, session_id, user_id, execution_generation
		) VALUES (v_turn, pg_temp.id('b2', p_n), v_user, p_generation);
	END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Static contract: service-only invoker with the worker RPC search_path
-- ---------------------------------------------------------------------------

DO $$
DECLARE
	v_function regprocedure :=
		'public.reap_stranded_queued_agentic_chat_turns(integer,integer)'::regprocedure;
BEGIN
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_function, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
			AND has_function_privilege('service_role', v_function, 'EXECUTE'),
		'queued reaper privileges are not service-only'
	);
	PERFORM pg_temp.assert_true(
		EXISTS (
			SELECT 1
			FROM pg_catalog.pg_proc procedures
			WHERE procedures.oid = v_function
				AND NOT procedures.prosecdef
				AND procedures.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
		),
		'queued reaper is not a pinned-search-path security invoker'
	);
	PERFORM pg_temp.assert_true(
		position('FOR UPDATE OF turns, jobs SKIP LOCKED' IN pg_get_functiondef(v_function)) > 0,
		'queued reaper does not lock candidates with SKIP LOCKED'
	);
END;
$$;

INSERT INTO public.users (id) VALUES ('b1000000-0000-4000-8000-000000000001');
INSERT INTO auth.users (id) VALUES ('b1000000-0000-4000-8000-000000000001');

-- 1, 2: stranded never-claimed turns (eligible). 3: fresh queued turn.
-- 4: queued turn whose job a worker already claimed. 5: running turn.
-- 6: requeued pre-start turn (generation 1, retry pending; eligible).
-- 7: long-queued turn that is already terminal.
SELECT pg_temp.seed_turn(1, 'queued', 'pending', 0, interval '12 minutes');
SELECT pg_temp.seed_turn(2, 'queued', 'pending', 0, interval '11 minutes');
SELECT pg_temp.seed_turn(3, 'queued', 'pending', 0, interval '4 minutes');
SELECT pg_temp.seed_turn(4, 'queued', 'processing', 0, interval '15 minutes');
SELECT pg_temp.seed_turn(5, 'running', 'processing', 1, interval '15 minutes');
SELECT pg_temp.seed_turn(6, 'queued', 'pending', 1, interval '10 minutes 30 seconds');
SELECT pg_temp.seed_turn(7, 'queued', 'pending', 0, interval '20 minutes');

SET ROLE service_role;
SELECT public.request_agentic_chat_turn_cancel(
	pg_temp.id('b4', 7), pg_temp.id('b1', 1), 'user_cancelled', 'browser'
);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------

SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.reap_stranded_queued_agentic_chat_turns(600, 100)',
		'permission denied'
	),
	'authenticated callers can run the queued reaper'
);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Floor + batch bound: a 1-second request still waits five minutes, and one
-- row per call drains oldest-first.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
	v_result jsonb;
BEGIN
	SET LOCAL ROLE service_role;
	v_result := public.reap_stranded_queued_agentic_chat_turns(1, 1);
	RESET ROLE;

	PERFORM pg_temp.assert_true(
		(v_result->>'reaped_count')::integer = 1
			AND (v_result->>'failed_count')::integer = 0
			AND (v_result->>'has_more')::boolean
			AND (v_result->>'queued_before_seconds')::integer = 300
			AND (v_result->>'batch_size')::integer = 1,
		'queued reaper did not enforce its age floor and batch bound: ' || v_result::text
	);
	PERFORM pg_temp.assert_true(
		(SELECT status FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 1)) = 'cancelled'
			AND (SELECT status FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 2)) = 'queued',
		'queued reaper did not drain the oldest stranded turn first'
	);
END;
$$;

DO $$
DECLARE
	v_result jsonb;
BEGIN
	SET LOCAL ROLE service_role;
	v_result := public.reap_stranded_queued_agentic_chat_turns(600, 100);
	RESET ROLE;

	PERFORM pg_temp.assert_true(
		(v_result->>'reaped_count')::integer = 2
			AND (v_result->>'failed_count')::integer = 0
			AND NOT (v_result->>'has_more')::boolean
			AND (v_result->>'queued_before_seconds')::integer = 600,
		'queued reaper did not drain the remaining stranded turns: ' || v_result::text
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- Terminal truth for every reaped turn: the same receipt a queued Stop writes.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
	v_n integer;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_event public.chat_turn_events%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
BEGIN
	FOREACH v_n IN ARRAY ARRAY[1, 2, 6] LOOP
		SELECT * INTO v_turn FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', v_n);
		SELECT * INTO v_job FROM public.queue_jobs WHERE id = pg_temp.id('b5', v_n);
		SELECT * INTO v_event FROM public.chat_turn_events
		WHERE turn_run_id = v_turn.id AND event_id = v_turn.terminal_event_id;
		SELECT * INTO v_stream FROM public.chat_turn_stream_state WHERE turn_run_id = v_turn.id;

		PERFORM pg_temp.assert_true(
			v_turn.status = 'cancelled'
				AND v_turn.finished_reason = 'timeout'
				AND v_turn.cancel_reason = 'timeout'
				AND v_turn.cancel_requested_at IS NOT NULL
				AND v_turn.failure_code IS NULL
				AND v_turn.assistant_message_id IS NULL
				AND v_turn.terminal_event_id IS NOT NULL
				AND v_turn.terminalized_at IS NOT NULL,
			'reaped turn ' || v_n || ' has the wrong terminal receipt'
		);
		PERFORM pg_temp.assert_true(
			v_job.status = 'cancelled'
				AND v_job.processing_token IS NULL
				AND v_job.completed_at IS NOT NULL,
			'reaped turn ' || v_n || ' left a claimable queue job'
		);
		PERFORM pg_temp.assert_true(
			v_event.event_type = 'done'
				AND v_event.payload->>'status' = 'cancelled'
				AND v_event.payload->>'finished_reason' = 'timeout'
				AND v_event.payload->>'cancel_reason' = 'timeout'
				AND v_event.payload->>'cancel_source' = 'sweeper',
			'reaped turn ' || v_n || ' has no sweeper done event'
		);
		PERFORM pg_temp.assert_true(
			v_stream.projection->'terminal'->>'status' = 'cancelled'
				AND v_stream.projection->'terminal'->>'finishedReason' = 'timeout'
				AND v_stream.execution_generation = v_turn.execution_generation,
			'reaped turn ' || v_n || ' has no terminal stream projection'
		);
	END LOOP;
END;
$$;

-- What the browser reconciles (its watchdog polls a queued turn every ~5s):
-- status cancelled with finished_reason timeout, which web renders as a
-- "couldn't start" failure rather than a Stop. Before this migration a
-- generation-0 terminal raised agentic_chat_reconcile_turn_relationship_corrupt.
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	SET LOCAL ROLE service_role;
	v_receipt := public.reconcile_agentic_chat_turn(pg_temp.id('b4', 1), pg_temp.id('b1', 1), NULL, 0);
	RESET ROLE;
	PERFORM pg_temp.assert_true(
		v_receipt->>'outcome' = 'reconciled'
			AND v_receipt->>'status' = 'cancelled'
			AND v_receipt->>'finished_reason' = 'timeout'
			AND v_receipt->>'failure_code' IS NULL
			AND v_receipt->>'terminal_event_id' IS NOT NULL
			AND v_receipt->'projection'->'terminal'->>'finishedReason' = 'timeout',
		'reconciliation does not expose the sweeper timeout: ' || v_receipt::text
	);
END;
$$;

-- A returning worker that tries to run a reaped turn is refused before any
-- generation starts; nothing is left in the claimable queue.
SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			'SELECT public.claim_agentic_chat_turn(%L::uuid, %L::uuid, %L::uuid)',
			pg_temp.id('b4', 1), pg_temp.id('b5', 1), gen_random_uuid()
		),
		'agentic_chat_claim_ownership_lost'
	),
	'a returning worker could claim a reaped turn'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.queue_jobs jobs
		WHERE jobs.id IN (pg_temp.id('b5', 1), pg_temp.id('b5', 2), pg_temp.id('b5', 6))
			AND jobs.status IN ('pending', 'retrying', 'processing')
	)
		AND (SELECT execution_generation FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 1)) = 0,
	'a reaped turn is still claimable or gained a generation'
);

-- ---------------------------------------------------------------------------
-- Untouched: fresh, worker-claimed, running, and already-terminal turns.
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
	(SELECT status FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 3)) = 'queued'
		AND (SELECT status FROM public.queue_jobs WHERE id = pg_temp.id('b5', 3)) = 'pending',
	'queued reaper touched a fresh queued turn'
);
SELECT pg_temp.assert_true(
	(SELECT status FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 4)) = 'queued'
		AND (SELECT cancel_requested_at FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 4)) IS NULL
		AND (SELECT status FROM public.queue_jobs WHERE id = pg_temp.id('b5', 4)) = 'processing'
		AND (SELECT processing_token FROM public.queue_jobs WHERE id = pg_temp.id('b5', 4))
			= pg_temp.id('b7', 4),
	'queued reaper touched a turn whose job a worker had claimed'
);
SELECT pg_temp.assert_true(
	(SELECT status FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 5)) = 'running'
		AND (SELECT cancel_requested_at FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 5)) IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_turn_signals WHERE turn_run_id = pg_temp.id('b4', 5)
		),
	'queued reaper touched a running turn'
);
SELECT pg_temp.assert_true(
	(SELECT finished_reason FROM public.chat_turn_runs WHERE id = pg_temp.id('b4', 7)) = 'user_cancelled',
	'queued reaper rewrote an already terminal turn'
);

-- Idempotent once drained.
DO $$
DECLARE
	v_result jsonb;
BEGIN
	SET LOCAL ROLE service_role;
	v_result := public.reap_stranded_queued_agentic_chat_turns(600, 100);
	RESET ROLE;
	PERFORM pg_temp.assert_true(
		(v_result->>'reaped_count')::integer = 0
			AND (v_result->>'failed_count')::integer = 0
			AND NOT (v_result->>'has_more')::boolean,
		'queued reaper was not idempotent after draining: ' || v_result::text
	);
END;
$$;

SELECT 'agentic_chat_reap_stranded_queued_turns_ok' AS result;
