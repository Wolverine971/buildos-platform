-- supabase/migrations/20260924150000_agentic_chat_lock_free_turn_checks.sql
-- Tasker 102: lock-free answers for two read-mostly worker checks — the
-- read-tool ownership fence and the cancellation poll.
--
-- Before each read tool the worker re-proves it still owns the current turn
-- generation. It did that with claim_agentic_chat_turn, which for a running
-- turn changes nothing but still takes FOR UPDATE on the turn and queue-job
-- rows. Those locks bought nothing (they are released the instant the check
-- returns) yet made the check queue behind every writer on the turn row: in
-- case 13 of the 2026-09-24 gate it waited behind an 11.9 s prompt-snapshot
-- transaction, hit the statement timeout, and failed four reads and the turn.
--
-- This function answers the same question from committed state with plain
-- reads, so it never waits on a row lock. It returns claim's running-turn
-- receipt shape and raises the same failures in the same order. It never
-- claims a queued turn. Tool results stay fenced where they persist; this is
-- only the early check.
--
-- The same migration gives observe_agentic_chat_turn_cancellations a lock-free
-- answer for the common case. Each worker polls it every 2 s with every turn
-- it is running, and it took FOR UPDATE on all of them even when none had a
-- cancel request, so one slow writer on one turn stalled cancellation checks
-- for every turn on that worker (and the poll then blocked their writers).
-- When no named turn has a cancel request it now returns [] from committed
-- state; otherwise the 20260802035000 body runs unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_agentic_chat_turn_read_fence(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_read_fence_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_queue_job_id IS NULL OR p_processing_token IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_read_fence_invalid_identity';
	END IF;

	-- No FOR UPDATE: committed state is the answer, and a writer holding the
	-- turn row must not delay it.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_read_fence_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_read_fence_turn_relationship_mismatch';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_read_fence_ownership_lost';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'execution_may_start', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	-- A queued turn has no running generation to fence; claiming it is
	-- claim_agentic_chat_turn's job, never this check's.
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_read_fence_invalid_status';
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id;

	IF v_turn.execution_generation < 1
		OR NOT FOUND
		OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
		OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
		OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_read_fence_current_generation_corrupt';
	END IF;

	RETURN jsonb_build_object(
		'outcome', CASE WHEN v_turn.cancel_requested_at IS NULL
			THEN 'matching_current_claim' ELSE 'cancel_requested' END,
		'execution_may_start',
			v_turn.cancel_requested_at IS NULL AND v_turn.execution_started_at IS NULL,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'correlation_id', v_turn.correlation_id,
		'execution_generation', v_turn.execution_generation,
		'input_artifact_id', v_turn.input_artifact_id,
		'user_message_id', v_turn.user_message_id,
		'status', v_turn.status
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.check_agentic_chat_turn_read_fence(uuid, uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_agentic_chat_turn_read_fence(uuid, uuid, uuid)
	TO service_role;

COMMENT ON FUNCTION public.check_agentic_chat_turn_read_fence(uuid, uuid, uuid) IS
	'Tasker 102: lock-free read-tool ownership check. Same receipt and failures as claim_agentic_chat_turn for a running turn; never waits on or takes a row lock, never claims.';

CREATE OR REPLACE FUNCTION public.observe_agentic_chat_turn_cancellations(
	p_turns jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_pair_count integer;
	v_item jsonb;
	v_generation integer;
	v_generation_numeric numeric;
	v_now timestamptz;
	v_result jsonb;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_cancel_observation_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turns IS NULL OR jsonb_typeof(p_turns) <> 'array' THEN
		RAISE EXCEPTION 'agentic_chat_cancel_observation_invalid_batch';
	END IF;

	v_pair_count := jsonb_array_length(p_turns);
	IF v_pair_count > 128 THEN
		RAISE EXCEPTION 'agentic_chat_cancel_observation_batch_too_large';
	END IF;

	FOR v_item IN SELECT value FROM jsonb_array_elements(p_turns)
	LOOP
		IF jsonb_typeof(v_item) <> 'object'
			OR jsonb_typeof(v_item->'turn_run_id') <> 'string'
			OR jsonb_typeof(v_item->'execution_generation') <> 'number'
			OR v_item - 'turn_run_id' - 'execution_generation' <> '{}'::jsonb THEN
			RAISE EXCEPTION 'agentic_chat_cancel_observation_invalid_pair';
		END IF;

		BEGIN
			PERFORM (v_item->>'turn_run_id')::uuid;
			v_generation_numeric := (v_item->>'execution_generation')::numeric;
			IF v_generation_numeric <> trunc(v_generation_numeric) THEN
				RAISE EXCEPTION 'agentic_chat_cancel_observation_invalid_pair';
			END IF;
			v_generation := v_generation_numeric::integer;
		EXCEPTION
			WHEN invalid_text_representation OR numeric_value_out_of_range THEN
				RAISE EXCEPTION 'agentic_chat_cancel_observation_invalid_pair';
		END;

		IF v_generation < 1 THEN
			RAISE EXCEPTION 'agentic_chat_cancel_observation_invalid_pair';
		END IF;
	END LOOP;

	IF (
		SELECT count(DISTINCT (requested.value->>'turn_run_id')::uuid)
		FROM jsonb_array_elements(p_turns) requested(value)
	) <> v_pair_count THEN
		RAISE EXCEPTION 'agentic_chat_cancel_observation_duplicate_turn';
	END IF;

	-- Tasker 102: nearly every 2 s poll finds no cancellation. Answer that from
	-- committed state without locking every running turn in the batch; the
	-- lock below made each poll wait behind, and then block, every writer on
	-- every turn it named. A cancel that commits during this read is observed
	-- on the next poll, exactly as one committing just after it would be.
	IF NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_turns) requested(value)
		JOIN public.chat_turn_runs turns
			ON turns.id = (requested.value->>'turn_run_id')::uuid
			AND turns.execution_generation = (requested.value->>'execution_generation')::integer
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status = 'running'
			AND turns.cancel_requested_at IS NOT NULL
	) THEN
		RETURN '[]'::jsonb;
	END IF;

	-- Preserve a single generation-consistent view across the integrity check,
	-- first-consumption write, and returned rows. UUID ordering prevents two
	-- overlapping worker batches from acquiring turn locks in opposite order.
	PERFORM turns.id
	FROM jsonb_array_elements(p_turns) WITH ORDINALITY requested(value, input_index)
	JOIN public.chat_turn_runs turns
		ON turns.id = (requested.value->>'turn_run_id')::uuid
		AND turns.execution_generation = (requested.value->>'execution_generation')::integer
	WHERE turns.execution_mode = 'worker_realtime'
	ORDER BY turns.id
	FOR UPDATE OF turns;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_turns) requested(value)
		JOIN public.chat_turn_runs turns
			ON turns.id = (requested.value->>'turn_run_id')::uuid
			AND turns.execution_generation = (requested.value->>'execution_generation')::integer
		LEFT JOIN public.chat_turn_signals signals
			ON signals.turn_run_id = turns.id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status = 'running'
			AND turns.cancel_requested_at IS NOT NULL
			AND (
				signals.id IS NULL
				OR signals.session_id IS DISTINCT FROM turns.session_id
				OR signals.user_id IS DISTINCT FROM turns.user_id
				OR signals.signal_version <> 'agentic_chat_signal_v1'
				OR signals.kind <> 'cancel'
				OR signals.reason IS DISTINCT FROM turns.cancel_reason
				OR signals.created_at IS DISTINCT FROM turns.cancel_requested_at
				OR (
					signals.consumed_by_generation IS NOT NULL
					AND signals.consumed_by_generation IS DISTINCT FROM turns.execution_generation
				)
			)
	) THEN
		RAISE EXCEPTION 'agentic_chat_cancel_observation_signal_corrupt';
	END IF;

	v_now := clock_timestamp();
	WITH requested AS (
		SELECT
			(value->>'turn_run_id')::uuid AS turn_run_id,
			(value->>'execution_generation')::integer AS execution_generation
		FROM jsonb_array_elements(p_turns) entries(value)
	)
	UPDATE public.chat_turn_signals signals
	SET consumed_at = GREATEST(v_now, signals.created_at),
		consumed_by_generation = turns.execution_generation
	FROM public.chat_turn_runs turns
	JOIN requested
		ON requested.turn_run_id = turns.id
		AND requested.execution_generation = turns.execution_generation
	WHERE signals.turn_run_id = turns.id
		AND turns.execution_mode = 'worker_realtime'
		AND turns.status = 'running'
		AND turns.cancel_requested_at IS NOT NULL
		AND signals.consumed_at IS NULL
		AND signals.consumed_by_generation IS NULL;

	SELECT COALESCE(
		jsonb_agg(
			jsonb_build_object(
				'turn_run_id', turns.id,
				'execution_generation', turns.execution_generation,
				'signal_id', signals.id,
				'cancel_reason', signals.reason,
				'cancel_source', signals.source,
				'cancel_requested_at', turns.cancel_requested_at,
				'consumed_at', signals.consumed_at
			)
			ORDER BY requested.input_index
		),
		'[]'::jsonb
	)
	INTO v_result
	FROM jsonb_array_elements(p_turns) WITH ORDINALITY requested(value, input_index)
	JOIN public.chat_turn_runs turns
		ON turns.id = (requested.value->>'turn_run_id')::uuid
		AND turns.execution_generation = (requested.value->>'execution_generation')::integer
	JOIN public.chat_turn_signals signals
		ON signals.turn_run_id = turns.id
	WHERE turns.execution_mode = 'worker_realtime'
		AND turns.status = 'running'
		AND turns.cancel_requested_at IS NOT NULL
		AND signals.reason IS NOT DISTINCT FROM turns.cancel_reason
		AND signals.created_at IS NOT DISTINCT FROM turns.cancel_requested_at
		AND signals.consumed_at IS NOT NULL
		AND signals.consumed_by_generation = turns.execution_generation;

	RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.observe_agentic_chat_turn_cancellations(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.observe_agentic_chat_turn_cancellations(jsonb)
	TO service_role;

COMMENT ON FUNCTION public.observe_agentic_chat_turn_cancellations(jsonb) IS
	'Observes up to 128 exact current worker generations in one service-only call, idempotently consumes accepted durable cancellation signals, and returns them on replay. Tasker 102: a batch with no cancel request is answered without row locks.';

COMMIT;
