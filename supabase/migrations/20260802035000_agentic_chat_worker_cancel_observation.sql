-- supabase/migrations/20260802035000_agentic_chat_worker_cancel_observation.sql
-- Agentic Chat Worker migration, Phase 2C Slice 3: bounded durable
-- cancellation observation.
--
-- This service-only RPC accepts one bounded worker-level batch of exact turn
-- generations, acknowledges first observation of matching durable cancel
-- signals, and continues returning an accepted cancellation on replay. It
-- adds no consumer, provider/model execution, Realtime policy, or enabled
-- worker route.

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
	'Observes up to 128 exact current worker generations in one service-only call, idempotently consumes accepted durable cancellation signals, and returns them on replay.';
