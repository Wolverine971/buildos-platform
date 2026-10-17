-- supabase/tests/20261017181000_agentic_chat_worker_shutdown_requeue.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261017181000_agentic_chat_worker_shutdown_requeue.sql \
--     --check supabase/tests/20261017181000_agentic_chat_worker_shutdown_requeue.check.sql
--
-- recover_agentic_chat_turn with worker_shutdown (audit B2) and the seconds-scale
-- transient_infra backoff (B15), against production's schema and triggers:
--   1. a started, effect-free turn with read rows requeues at once and the next
--      claim runs it as generation 2;
--   2. a turn with an effect row, a started effect, a session handoff, finalized
--      text, or no attempts left is NOT replayed and keeps the timeout handling;
--   3. a pre-start turn requeues at once; cancellation still wins;
--   4. transient_infra's first retry lands 5-10 s out;
--   5. access is still service_role only.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

INSERT INTO auth.users (id, email)
VALUES ('5d100000-0000-4000-8000-000000000001', 'shutdown-requeue@example.com');
INSERT INTO public.users (id, email)
VALUES ('5d100000-0000-4000-8000-000000000001', 'shutdown-requeue@example.com')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.sid(p_prefix text, p_n integer)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT (p_prefix || '000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- One running worker turn at generation 1. p_started marks the provider start;
-- p_reads adds that many read-only tool ledger rows (through the real insert
-- trigger, which tallies the session's tool_call_count).
CREATE OR REPLACE FUNCTION pg_temp.seed_shutdown_turn(
	p_n integer,
	p_started boolean,
	p_reads integer DEFAULT 0,
	p_attempts integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_user uuid := '5d100000-0000-4000-8000-000000000001';
	v_turn uuid := pg_temp.sid('c4', p_n);
	v_session uuid := pg_temp.sid('c2', p_n);
	v_job uuid := pg_temp.sid('c5', p_n);
	v_message uuid := pg_temp.sid('c3', p_n);
	v_artifact uuid := pg_temp.sid('c9', p_n);
	v_now timestamptz := clock_timestamp();
	v_index integer;
BEGIN
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (v_session, v_user, 'global', 'active');
	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (
		v_message, v_session, v_user, 'user', 'shutdown fixture ' || p_n,
		jsonb_build_object('idempotency_key', 'shutdown-requeue-user-' || p_n)
	);
	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status, queue_job_id,
		processing_token, started_at, attempts, max_attempts
	) VALUES (
		v_job, v_user, 'agentic_chat_turn',
		jsonb_build_object('turnRunId', v_turn, 'correlationId', pg_temp.sid('c6', p_n)),
		v_now - interval '1 minute', 'agentic-chat-turn:' || v_turn, 'processing',
		'shutdown_requeue_' || p_n, pg_temp.sid('c7', p_n), v_now - interval '40 seconds',
		p_attempts, 3
	);
	-- Admitted (queued, generation 0) so the artifact triggers accept it, then
	-- claimed and started the way the worker would have.
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, last_progress_at, last_event_sequence, user_message_id
	) VALUES (
		v_turn, v_session, v_user, 'shutdown-stream-' || p_n, 'shutdown-client-' || p_n,
		'global', 'shutdown fixture ' || p_n, 'queued', 'worker_realtime', v_job,
		pg_temp.sid('c6', p_n), 0, v_now - interval '1 minute', 0, v_message
	);
	INSERT INTO public.chat_turn_input_artifacts (
		id, turn_run_id, session_id, user_id, artifact_version, history_source,
		history, prepared, content_hash, history_bytes, content_bytes, created_at,
		retain_until
	) VALUES (
		v_artifact, v_turn, v_session, v_user,
		'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb,
		repeat('a', 64), 2, 4, v_now - interval '1 minute', v_now + interval '7 days'
	);
	UPDATE public.chat_turn_runs
	SET input_artifact_id = v_artifact,
		status = 'running',
		execution_generation = 1,
		worker_started_at = v_now - interval '40 seconds',
		execution_started_at = CASE WHEN p_started THEN v_now - interval '35 seconds' END,
		last_progress_at = v_now - interval '2 seconds',
		last_event_sequence = CASE WHEN p_started THEN 3 ELSE 0 END,
		worker_lease_generation = 1,
		worker_lease_renewed_at = v_now - interval '5 seconds'
	WHERE id = v_turn;
	INSERT INTO public.chat_turn_stream_state (
		turn_run_id, session_id, user_id, execution_generation, snapshot_sequence,
		durable_through_sequence, projection_durable_sequence, assistant_text, projection,
		created_at, updated_at
	) VALUES (
		v_turn, v_session, v_user, 1,
		CASE WHEN p_started THEN 3 ELSE 0 END,
		CASE WHEN p_started THEN 3 ELSE 0 END,
		CASE WHEN p_started THEN 3 ELSE 0 END,
		CASE WHEN p_started THEN 'Partial answer from generation one' ELSE '' END,
		'{}'::jsonb, v_now - interval '40 seconds', v_now - interval '2 seconds'
	);
	FOR v_index IN 1 .. p_reads LOOP
		INSERT INTO public.chat_tool_executions (
			id, session_id, turn_run_id, stream_run_id, client_turn_id,
			provider_tool_call_id, tool_name, tool_category, sequence_index, arguments,
			result, success, affected_entities
		) VALUES (
			gen_random_uuid(), v_session, v_turn, 'shutdown-stream-' || p_n,
			'shutdown-client-' || p_n, 'call_' || p_n || '_' || v_index,
			'search_onto_tasks', 'search', v_index, '{}'::jsonb, '{"items":[]}'::jsonb,
			true, '[]'::jsonb
		);
	END LOOP;
END;
$$;

-- A provider-ledger effect row for turn p_n (reserved, optionally started).
CREATE OR REPLACE FUNCTION pg_temp.seed_shutdown_effect(p_n integer, p_started boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO public.chat_turn_effects (
		id, turn_run_id, session_id, user_id, execution_generation, tool_name,
		operation_name, canonical_argument_hash, downstream_idempotency_supported
	) VALUES (
		pg_temp.sid('c8', p_n), pg_temp.sid('c4', p_n), pg_temp.sid('c2', p_n),
		'5d100000-0000-4000-8000-000000000001', 1, 'create_onto_task', 'task.create',
		repeat('b', 64), false
	);
	IF p_started THEN
		UPDATE public.chat_turn_effects
		SET state = 'started', started_at = clock_timestamp()
		WHERE id = pg_temp.sid('c8', p_n);
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.recover_turn(p_n integer, p_class text)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT public.recover_agentic_chat_turn(
		pg_temp.sid('c4', p_n), pg_temp.sid('c5', p_n), pg_temp.sid('c7', p_n), 1,
		p_class, 'Queue shutdown: drain timeout reached'
	)
$$;

SELECT pg_temp.seed_shutdown_turn(1, true, 2);      -- replay-safe, started, two reads
SELECT pg_temp.seed_shutdown_turn(2, true, 1);      -- reserved effect (a write began)
SELECT pg_temp.seed_shutdown_effect(2, false);
SELECT pg_temp.seed_shutdown_turn(3, true);         -- started effect (outcome unknown)
SELECT pg_temp.seed_shutdown_effect(3, true);
SELECT pg_temp.seed_shutdown_turn(4, true);         -- moved the session's context
UPDATE public.chat_sessions
SET agent_metadata = jsonb_build_object(
	'fastchat_last_context_shift',
	jsonb_build_object('turn_run_id', pg_temp.sid('c4', 4), 'execution_generation', 1)
)
WHERE id = pg_temp.sid('c2', 4);
SELECT pg_temp.seed_shutdown_turn(5, true);         -- assistant text finalized
UPDATE public.chat_turn_runs
SET assistant_message_id = pg_temp.sid('c3', 5)
WHERE id = pg_temp.sid('c4', 5);
SELECT pg_temp.seed_shutdown_turn(6, true, 0, 2);   -- no attempts left
SELECT pg_temp.seed_shutdown_turn(7, false);        -- interrupted before the provider started
SELECT pg_temp.seed_shutdown_turn(8, true);         -- Stop was pressed first
UPDATE public.chat_turn_runs
SET cancel_requested_at = clock_timestamp(), cancel_reason = 'user_cancelled'
WHERE id = pg_temp.sid('c4', 8);
SELECT pg_temp.seed_shutdown_turn(9, false);        -- B15 transient_infra

-- Disposable schema owner plus service-role claims, as production's worker calls it.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

DO $$
DECLARE
	v_signature text := 'public.recover_agentic_chat_turn(uuid,uuid,uuid,integer,text,text)';
BEGIN
	ASSERT has_function_privilege('service_role', v_signature, 'EXECUTE'),
		'service_role must keep EXECUTE';
	ASSERT NOT has_function_privilege('authenticated', v_signature, 'EXECUTE'),
		'authenticated must not execute recovery';
	ASSERT NOT has_function_privilege('anon', v_signature, 'EXECUTE'),
		'anon must not execute recovery';
	ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_signature::regprocedure),
		'recovery stays SECURITY INVOKER';
	BEGIN
		PERFORM pg_temp.recover_turn(1, 'not_a_class');
		RAISE EXCEPTION 'unknown failure class was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_recovery_invalid_request', SQLERRM;
	END;
END;
$$;

-- 1. Replay-safe started turn: immediate requeue, discarded generation cleaned.
DO $$
DECLARE
	v_receipt jsonb;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_tool_calls integer;
	v_claim jsonb;
BEGIN
	SELECT tool_call_count INTO v_tool_calls
	FROM public.chat_sessions WHERE id = pg_temp.sid('c2', 1);
	ASSERT v_tool_calls = 2, format('fixture tallied %s tool calls', v_tool_calls);

	v_receipt := pg_temp.recover_turn(1, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'retry_scheduled', v_receipt::text;
	ASSERT (v_receipt->>'execution_may_retry')::boolean, v_receipt::text;
	ASSERT v_receipt->>'failure_code' = 'worker_shutdown', v_receipt::text;
	ASSERT v_receipt->>'status' = 'queued', v_receipt::text;
	ASSERT (v_receipt->>'replayed_after_start')::boolean, v_receipt::text;
	ASSERT (v_receipt->>'cleared_tool_executions')::integer = 2, v_receipt::text;

	SELECT * INTO v_turn FROM public.chat_turn_runs WHERE id = pg_temp.sid('c4', 1);
	ASSERT v_turn.status = 'queued' AND v_turn.execution_started_at IS NULL
		AND v_turn.execution_generation = 1 AND v_turn.last_event_sequence = 3
		AND v_turn.failure_code IS NULL AND v_turn.terminalized_at IS NULL,
		'turn must be queued at generation 1 with its start mark cleared';
	SELECT * INTO v_stream FROM public.chat_turn_stream_state WHERE turn_run_id = v_turn.id;
	ASSERT v_stream.execution_generation = 1 AND v_stream.durable_through_sequence = 3
		AND v_stream.assistant_text = 'Partial answer from generation one',
		'stream state stays at generation 1 until the next claim (browser reconcile)';
	SELECT * INTO v_job FROM public.queue_jobs WHERE id = pg_temp.sid('c5', 1);
	ASSERT v_job.status = 'pending' AND v_job.processing_token IS NULL
		AND v_job.attempts = 1 AND v_job.scheduled_for <= clock_timestamp(),
		format('queue row must be claimable now: %s %s %s', v_job.status, v_job.attempts, v_job.scheduled_for);
	ASSERT NOT EXISTS (
		SELECT 1 FROM public.chat_tool_executions WHERE turn_run_id = v_turn.id
	), 'generation-1 read rows must be cleared';
	SELECT tool_call_count INTO v_tool_calls
	FROM public.chat_sessions WHERE id = pg_temp.sid('c2', 1);
	ASSERT v_tool_calls = 0, format('session tally must drop the cleared rows: %s', v_tool_calls);

	-- A repeated call (the worker retrying its RPC) is a no-op receipt.
	v_receipt := pg_temp.recover_turn(1, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'already_requeued', v_receipt::text;

	-- Another replica claims the queue row, then the turn: generation 2, fresh stream.
	UPDATE public.queue_jobs
	SET status = 'processing', processing_token = pg_temp.sid('ca', 1),
		started_at = clock_timestamp()
	WHERE id = pg_temp.sid('c5', 1);
	v_claim := public.claim_agentic_chat_turn(
		pg_temp.sid('c4', 1), pg_temp.sid('c5', 1), pg_temp.sid('ca', 1)
	);
	ASSERT v_claim->>'outcome' = 'claimed' AND (v_claim->>'execution_generation')::integer = 2,
		v_claim::text;
	SELECT * INTO v_stream FROM public.chat_turn_stream_state WHERE turn_run_id = v_turn.id;
	ASSERT v_stream.execution_generation = 2 AND v_stream.assistant_text = ''
		AND v_stream.durable_through_sequence = 0, 'claim resets the stream for generation 2';
END;
$$;

-- 2. Not replay-safe: today's handling, never a replay.
DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := pg_temp.recover_turn(2, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'finalize_failed'
		AND v_receipt->>'failure_code' = 'timeout_post_start'
		AND NOT (v_receipt->>'execution_may_retry')::boolean, 'reserved effect: ' || v_receipt::text;
	ASSERT EXISTS (
		SELECT 1 FROM public.chat_tool_executions WHERE turn_run_id = pg_temp.sid('c4', 2)
	), 'a turn that is not replayed keeps its ledger';

	v_receipt := pg_temp.recover_turn(3, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'finalize_failed'
		AND v_receipt->>'failure_code' = 'uncertain_external_commit', 'started effect: ' || v_receipt::text;

	v_receipt := pg_temp.recover_turn(4, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'finalize_failed'
		AND v_receipt->>'failure_code' = 'timeout_post_start', 'session handoff: ' || v_receipt::text;

	v_receipt := pg_temp.recover_turn(5, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'finalize_failed'
		AND v_receipt->>'failure_code' = 'timeout_post_start', 'finalized text: ' || v_receipt::text;

	v_receipt := pg_temp.recover_turn(6, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'finalize_failed'
		AND v_receipt->>'failure_code' = 'timeout_post_start', 'attempts exhausted: ' || v_receipt::text;

	ASSERT (
		SELECT bool_and(status = 'running' AND execution_started_at IS NOT NULL)
		FROM public.chat_turn_runs
		WHERE id IN (pg_temp.sid('c4', 2), pg_temp.sid('c4', 3), pg_temp.sid('c4', 4),
			pg_temp.sid('c4', 5), pg_temp.sid('c4', 6))
	), 'non-replayable turns stay running for the worker to finalize';
	ASSERT (
		SELECT bool_and(status = 'processing')
		FROM public.queue_jobs
		WHERE id IN (pg_temp.sid('c5', 2), pg_temp.sid('c5', 3), pg_temp.sid('c5', 4),
			pg_temp.sid('c5', 5), pg_temp.sid('c5', 6))
	), 'non-replayable queue rows are not requeued';
END;
$$;

-- 3. Pre-start shutdown requeues at once; a pending Stop still wins.
DO $$
DECLARE
	v_receipt jsonb;
	v_job public.queue_jobs%ROWTYPE;
BEGIN
	v_receipt := pg_temp.recover_turn(7, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'retry_scheduled'
		AND v_receipt->>'failure_code' = 'worker_shutdown'
		AND NOT (v_receipt->>'replayed_after_start')::boolean, v_receipt::text;
	SELECT * INTO v_job FROM public.queue_jobs WHERE id = pg_temp.sid('c5', 7);
	ASSERT v_job.scheduled_for <= clock_timestamp(), 'pre-start shutdown requeue is immediate';

	v_receipt := pg_temp.recover_turn(8, 'worker_shutdown');
	ASSERT v_receipt->>'outcome' = 'finalize_cancelled', v_receipt::text;
END;
$$;

-- 4. B15: transient_infra's first retry lands 5-10 s out, not minutes.
DO $$
DECLARE
	v_receipt jsonb;
	v_delay interval;
BEGIN
	v_receipt := pg_temp.recover_turn(9, 'transient_infra');
	ASSERT v_receipt->>'outcome' = 'retry_scheduled'
		AND v_receipt->>'failure_code' = 'transient_infra', v_receipt::text;
	-- updated_at is the statement's now() (row trigger); scheduled_for is based on
	-- the function's clock_timestamp(), a few ms later.
	SELECT scheduled_for - updated_at INTO v_delay
	FROM public.queue_jobs WHERE id = pg_temp.sid('c5', 9);
	ASSERT v_delay >= interval '5 seconds' AND v_delay < interval '11 seconds',
		format('transient_infra first retry delay was %s', v_delay);
END;
$$;

SELECT set_config('request.jwt.claims', '', false);
