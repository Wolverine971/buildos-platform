-- supabase/migrations/20260802020100_agentic_chat_worker_claim_fencing.sql
-- Agentic Chat Worker migration, Phase 2B Slice 3B: queue claim and current-
-- generation fencing.
--
-- The generic chat-only queue claimer owns the queue row first and supplies its
-- processing token here. This RPC then atomically validates the complete queue
-- envelope, transitions the domain turn queued -> running, increments exactly
-- one execution generation, and resets that generation's stream state.
--
-- execution_started_at is deliberately not set here. A later fenced primitive
-- owns the immediate-before-provider boundary. This migration creates no queue
-- consumer, model execution, retry/recovery, cancellation, or finalization.
-- Apply only after 20260802020000, regenerate types after both receipts, and
-- keep the worker rollout flag disabled.

CREATE OR REPLACE FUNCTION public.claim_agentic_chat_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid
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
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_now timestamptz := clock_timestamp();
	v_next_generation integer;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_claim_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_queue_job_id IS NULL OR p_processing_token IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_claim_invalid_identity';
	END IF;

	-- Every worker primitive follows turn -> subordinate row -> queue lock order.
	-- This serializes generation changes with all later turn-owned writes.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_claim_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_claim_turn_relationship_mismatch';
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
		RAISE EXCEPTION 'agentic_chat_claim_ownership_lost';
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

	IF v_turn.status = 'running' THEN
		SELECT streams.*
		INTO v_stream
		FROM public.chat_turn_stream_state streams
		WHERE streams.turn_run_id = v_turn.id;

		IF v_turn.execution_generation < 1
			OR NOT FOUND
			OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
			OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
			OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation THEN
			RAISE EXCEPTION 'agentic_chat_claim_current_generation_corrupt';
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
	END IF;

	IF v_turn.status <> 'queued' THEN
		RAISE EXCEPTION 'agentic_chat_claim_invalid_status';
	END IF;
	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
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
	IF v_turn.execution_started_at IS NOT NULL
		OR v_turn.mutation_reserved_at IS NOT NULL
		OR v_turn.irreversible_boundary_at IS NOT NULL
		OR v_turn.terminalized_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_claim_unsafe_replay_boundary';
	END IF;
	IF v_turn.input_artifact_id IS NULL OR v_turn.user_message_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_claim_incomplete_admission';
	END IF;

	SELECT artifacts.*
	INTO v_artifact
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = v_turn.input_artifact_id
		AND artifacts.turn_run_id = v_turn.id
		AND artifacts.session_id = v_turn.session_id
		AND artifacts.user_id = v_turn.user_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_claim_input_artifact_scope_mismatch';
	END IF;

	IF v_turn.execution_generation = 2147483647 THEN
		RAISE EXCEPTION 'agentic_chat_claim_generation_exhausted';
	END IF;
	v_next_generation := v_turn.execution_generation + 1;

	UPDATE public.chat_turn_runs turns
	SET status = 'running',
		execution_generation = v_next_generation,
		worker_started_at = v_now,
		last_progress_at = v_now,
		last_event_sequence = 0,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'queued'
		AND turns.execution_generation = v_turn.execution_generation
		AND turns.cancel_requested_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_claim_compare_and_set_lost';
	END IF;

	INSERT INTO public.chat_turn_stream_state (
		turn_run_id,
		session_id,
		user_id,
		execution_generation,
		snapshot_sequence,
		durable_through_sequence,
		projection_durable_sequence,
		assistant_text,
		projection,
		reconcile_required,
		created_at,
		updated_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		v_next_generation,
		0,
		0,
		0,
		'',
		'{}'::jsonb,
		false,
		v_now,
		v_now
	)
	ON CONFLICT (turn_run_id) DO UPDATE
	SET execution_generation = EXCLUDED.execution_generation,
		snapshot_sequence = 0,
		durable_through_sequence = 0,
		projection_durable_sequence = 0,
		assistant_text = '',
		projection = '{}'::jsonb,
		reconcile_required = false,
		updated_at = EXCLUDED.updated_at;

	RETURN jsonb_build_object(
		'outcome', 'claimed',
		'execution_may_start', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'correlation_id', v_turn.correlation_id,
		'execution_generation', v_next_generation,
		'input_artifact_id', v_turn.input_artifact_id,
		'user_message_id', v_turn.user_message_id,
		'status', 'running'
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_agentic_chat_turn(uuid, uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agentic_chat_turn(uuid, uuid, uuid)
	TO service_role;

COMMENT ON FUNCTION public.claim_agentic_chat_turn(uuid, uuid, uuid) IS
	'Service-only queue/domain claim bridge. Validates the processing-token envelope, advances one execution generation, and resets current-generation stream state atomically; it does not start provider execution.';
