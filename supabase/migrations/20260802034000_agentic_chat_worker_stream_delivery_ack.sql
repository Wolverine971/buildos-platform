-- supabase/migrations/20260802034000_agentic_chat_worker_stream_delivery_ack.sql
-- Agentic Chat Worker migration, Phase 2C Slice 2: exact-sequence delivery
-- acknowledgement.
--
-- A successful Realtime send is not allowed to clear durable reconciliation
-- state directly. This service-only RPC preserves the established
-- turn -> queue -> stream lock order and clears the flag only for the exact
-- current generation and durable snapshot. It adds no Realtime policy, queue
-- consumer, provider execution, or enabled worker route.

CREATE OR REPLACE FUNCTION public.acknowledge_agentic_chat_stream_delivery(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_acknowledged_sequence integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_now timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR p_acknowledged_sequence IS NULL
		OR p_acknowledged_sequence < 1 THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_invalid_identity';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_turn_relationship_mismatch';
	END IF;

	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		SELECT streams.*
		INTO v_stream
		FROM public.chat_turn_stream_state streams
		WHERE streams.turn_run_id = v_turn.id;

		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'requested_execution_generation', p_execution_generation,
			'execution_generation', v_turn.execution_generation,
			'acknowledged_sequence', p_acknowledged_sequence,
			'current_sequence', COALESCE(v_stream.snapshot_sequence, v_turn.last_event_sequence),
			'reconcile_required', COALESCE(v_stream.reconcile_required, true)
		);
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_ownership_lost';
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
	FOR UPDATE;

	IF NOT FOUND
		OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
		OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
		OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_current_generation_corrupt';
	END IF;
	IF v_stream.snapshot_sequence IS DISTINCT FROM v_stream.durable_through_sequence
		OR v_stream.snapshot_sequence IS DISTINCT FROM v_turn.last_event_sequence THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_sequence_cursor_corrupt';
	END IF;
	IF p_acknowledged_sequence > v_stream.snapshot_sequence THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_future_sequence';
	END IF;

	IF p_acknowledged_sequence < v_stream.snapshot_sequence THEN
		RETURN jsonb_build_object(
			'outcome', 'newer_snapshot',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'acknowledged_sequence', p_acknowledged_sequence,
			'current_sequence', v_stream.snapshot_sequence,
			'reconcile_required', true
		);
	END IF;

	IF NOT v_stream.reconcile_required THEN
		RETURN jsonb_build_object(
			'outcome', 'already_acknowledged',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'acknowledged_sequence', p_acknowledged_sequence,
			'current_sequence', v_stream.snapshot_sequence,
			'reconcile_required', false
		);
	END IF;

	v_now := clock_timestamp();
	UPDATE public.chat_turn_stream_state streams
	SET reconcile_required = false,
		updated_at = v_now
	WHERE streams.turn_run_id = v_turn.id
		AND streams.execution_generation = v_turn.execution_generation
		AND streams.snapshot_sequence = p_acknowledged_sequence
		AND streams.durable_through_sequence = p_acknowledged_sequence
		AND streams.reconcile_required;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_stream_ack_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'acknowledged',
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'execution_generation', v_turn.execution_generation,
		'acknowledged_sequence', p_acknowledged_sequence,
		'current_sequence', p_acknowledged_sequence,
		'reconcile_required', false
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.acknowledge_agentic_chat_stream_delivery(
	uuid, uuid, uuid, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_agentic_chat_stream_delivery(
	uuid, uuid, uuid, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.acknowledge_agentic_chat_stream_delivery(
	uuid, uuid, uuid, integer, integer
) IS
	'Clears reconcile_required only after service-role delivery acknowledgement for the exact current owned generation and durable sequence.';
