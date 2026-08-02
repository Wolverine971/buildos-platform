-- supabase/migrations/20260802033200_agentic_chat_worker_stream_write_rpcs.sql
-- Agentic Chat Worker migration, Phase 2C Slice 1C: generation-fenced durable
-- stream persistence.
--
-- These service-only RPCs allocate sequence numbers inside the database and
-- return explicit post-commit publication authority. They do not Broadcast,
-- observe cancellation on a timer, execute a provider, or enable worker
-- routing. Terminal `done` remains exclusive to finalize_agentic_chat_turn().

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_text_batch(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_batch_id uuid,
	p_text_delta text,
	p_assistant_text text
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
	v_sequence integer;
	v_event_id text;
	v_assistant_bytes integer;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_text_write_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_batch_id IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_text_write_invalid_identity';
	END IF;
	IF p_text_delta IS NULL
		OR p_text_delta = ''
		OR octet_length(p_text_delta) > 524288
		OR p_assistant_text IS NULL
		OR octet_length(p_assistant_text) > 2097152 THEN
		RAISE EXCEPTION 'agentic_chat_text_write_invalid_text';
	END IF;
	v_assistant_bytes := octet_length(p_assistant_text);

	-- Preserve the established worker lock order used by claim/finalization.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_text_write_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_text_write_turn_relationship_mismatch';
	END IF;

	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'terminal_event_id', v_turn.terminal_event_id
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_text_write_invalid_status';
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
		RAISE EXCEPTION 'agentic_chat_text_write_ownership_lost';
	END IF;

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'cancel_requested_at', v_turn.cancel_requested_at,
			'cancel_reason', v_turn.cancel_reason
		);
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
		RAISE EXCEPTION 'agentic_chat_text_write_current_generation_corrupt';
	END IF;

	IF v_stream.last_text_batch_id = p_batch_id THEN
		IF v_stream.last_text_end_bytes IS DISTINCT FROM v_assistant_bytes
			OR left(v_stream.assistant_text, char_length(p_assistant_text))
				IS DISTINCT FROM p_assistant_text THEN
			RAISE EXCEPTION 'agentic_chat_text_write_batch_conflict';
		END IF;

		v_sequence := v_stream.last_text_sequence;
		v_event_id := v_turn.id::text
			|| ':' || v_turn.execution_generation::text
			|| ':' || v_sequence::text;
		RETURN jsonb_build_object(
			'outcome', 'already_persisted',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'stream_run_id', v_turn.stream_run_id,
			'client_turn_id', v_turn.client_turn_id,
			'execution_generation', v_turn.execution_generation,
			'sequence_index', v_sequence,
			'event_id', v_event_id,
			'phase', 'llm',
			'event_type', 'text_delta',
			'durable', true,
			'batch_id', p_batch_id,
			'assistant_text_bytes', v_stream.last_text_end_bytes
		);
	END IF;

	IF v_stream.snapshot_sequence IS DISTINCT FROM v_turn.last_event_sequence
		OR v_stream.durable_through_sequence IS DISTINCT FROM v_turn.last_event_sequence THEN
		RAISE EXCEPTION 'agentic_chat_text_write_sequence_cursor_corrupt';
	END IF;
	IF p_assistant_text IS DISTINCT FROM v_stream.assistant_text || p_text_delta THEN
		RAISE EXCEPTION 'agentic_chat_text_write_prefix_conflict';
	END IF;
	IF v_turn.last_event_sequence = 2147483647 THEN
		RAISE EXCEPTION 'agentic_chat_text_write_sequence_exhausted';
	END IF;

	v_now := clock_timestamp();
	v_sequence := v_turn.last_event_sequence + 1;
	v_event_id := v_turn.id::text
		|| ':' || v_turn.execution_generation::text
		|| ':' || v_sequence::text;

	UPDATE public.chat_turn_stream_state streams
	SET snapshot_sequence = v_sequence,
		durable_through_sequence = v_sequence,
		assistant_text = p_assistant_text,
		last_text_batch_id = p_batch_id,
		last_text_sequence = v_sequence,
		last_text_end_bytes = v_assistant_bytes,
		reconcile_required = true,
		updated_at = v_now
	WHERE streams.turn_run_id = v_turn.id
		AND streams.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_text_write_stream_compare_and_set_lost';
	END IF;

	UPDATE public.chat_turn_runs turns
	SET last_event_sequence = v_sequence,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = v_turn.execution_generation
		AND turns.queue_job_id = v_turn.queue_job_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_text_write_turn_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'persisted',
		'publish_allowed', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', v_turn.client_turn_id,
		'execution_generation', v_turn.execution_generation,
		'sequence_index', v_sequence,
		'event_id', v_event_id,
		'phase', 'llm',
		'event_type', 'text_delta',
		'durable', true,
		'batch_id', p_batch_id,
		'text_delta', p_text_delta,
		'assistant_text_bytes', v_assistant_bytes,
		'reconcile_required', true,
		'persisted_at', v_now
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_semantic_event(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_transition_id uuid,
	p_assistant_text text,
	p_phase text,
	p_event_type text,
	p_projection jsonb,
	p_event_payload jsonb
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
	v_existing public.chat_turn_events%ROWTYPE;
	v_projection jsonb;
	v_event_payload jsonb;
	v_now timestamptz;
	v_sequence integer;
	v_event_id text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_transition_id IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_identity';
	END IF;
	IF p_assistant_text IS NULL OR octet_length(p_assistant_text) > 2097152 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_text';
	END IF;
	IF p_phase IS NULL
		OR p_phase NOT IN ('prompt', 'llm', 'tool', 'stream', 'finalize')
		OR p_event_type IS NULL
		OR p_event_type !~ '^[a-z][a-z0-9_]{0,127}$'
		OR p_event_type IN ('done', 'text', 'text_delta') THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_event';
	END IF;

	v_projection := COALESCE(p_projection, '{}'::jsonb);
	v_event_payload := COALESCE(p_event_payload, '{}'::jsonb);
	IF jsonb_typeof(v_projection) <> 'object'
		OR jsonb_typeof(v_event_payload) <> 'object'
		OR pg_column_size(v_projection) > 524288
		OR pg_column_size(v_event_payload) > 262144
		OR v_event_payload->>'type' IS DISTINCT FROM p_event_type THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_json_payload';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_turn_relationship_mismatch';
	END IF;

	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'terminal_event_id', v_turn.terminal_event_id
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_status';
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
		RAISE EXCEPTION 'agentic_chat_semantic_write_ownership_lost';
	END IF;

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'cancel_requested_at', v_turn.cancel_requested_at,
			'cancel_reason', v_turn.cancel_reason
		);
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
		RAISE EXCEPTION 'agentic_chat_semantic_write_current_generation_corrupt';
	END IF;

	SELECT events.*
	INTO v_existing
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.worker_transition_id = p_transition_id;

	IF FOUND THEN
		IF v_existing.phase IS DISTINCT FROM p_phase
			OR v_existing.event_type IS DISTINCT FROM p_event_type
			OR v_existing.payload IS DISTINCT FROM v_event_payload THEN
			RAISE EXCEPTION 'agentic_chat_semantic_write_transition_conflict';
		END IF;

		RETURN jsonb_build_object(
			'outcome', 'already_persisted',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'stream_run_id', v_turn.stream_run_id,
			'client_turn_id', v_turn.client_turn_id,
			'execution_generation', v_turn.execution_generation,
			'sequence_index', v_existing.sequence_index,
			'event_id', v_existing.event_id,
			'phase', v_existing.phase,
			'event_type', v_existing.event_type,
			'durable', true,
			'transition_id', p_transition_id,
			'event_payload', v_existing.payload
		);
	END IF;

	IF v_stream.snapshot_sequence IS DISTINCT FROM v_turn.last_event_sequence
		OR v_stream.durable_through_sequence IS DISTINCT FROM v_turn.last_event_sequence THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_sequence_cursor_corrupt';
	END IF;
	IF left(p_assistant_text, char_length(v_stream.assistant_text))
		IS DISTINCT FROM v_stream.assistant_text THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_prefix_conflict';
	END IF;
	IF v_turn.last_event_sequence = 2147483647 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_sequence_exhausted';
	END IF;

	v_now := clock_timestamp();
	v_sequence := v_turn.last_event_sequence + 1;
	v_event_id := v_turn.id::text
		|| ':' || v_turn.execution_generation::text
		|| ':' || v_sequence::text;

	INSERT INTO public.chat_turn_events (
		turn_run_id,
		session_id,
		user_id,
		stream_run_id,
		execution_generation,
		sequence_index,
		event_id,
		worker_transition_id,
		phase,
		event_type,
		payload,
		created_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		v_turn.stream_run_id,
		v_turn.execution_generation,
		v_sequence,
		v_event_id,
		p_transition_id,
		p_phase,
		p_event_type,
		v_event_payload,
		v_now
	);

	UPDATE public.chat_turn_stream_state streams
	SET snapshot_sequence = v_sequence,
		durable_through_sequence = v_sequence,
		projection_durable_sequence = v_sequence,
		assistant_text = p_assistant_text,
		projection = v_projection,
		reconcile_required = true,
		updated_at = v_now
	WHERE streams.turn_run_id = v_turn.id
		AND streams.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_stream_compare_and_set_lost';
	END IF;

	UPDATE public.chat_turn_runs turns
	SET last_event_sequence = v_sequence,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = v_turn.execution_generation
		AND turns.queue_job_id = v_turn.queue_job_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_turn_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'persisted',
		'publish_allowed', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', v_turn.client_turn_id,
		'execution_generation', v_turn.execution_generation,
		'sequence_index', v_sequence,
		'event_id', v_event_id,
		'phase', p_phase,
		'event_type', p_event_type,
		'durable', true,
		'transition_id', p_transition_id,
		'event_payload', v_event_payload,
		'reconcile_required', true,
		'persisted_at', v_now
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.flush_agentic_chat_text_batches(p_batches jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_item jsonb;
	v_result jsonb;
	v_results jsonb := '[]'::jsonb;
	v_index bigint;
	v_persisted_count integer := 0;
	v_rejected_count integer := 0;
	v_error_code text;
	v_error_message text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_text_batch_flush_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_batches IS NULL
		OR jsonb_typeof(p_batches) <> 'array'
		OR jsonb_array_length(p_batches) < 1
		OR jsonb_array_length(p_batches) > 128
		OR pg_column_size(p_batches) > 16777216 THEN
		RAISE EXCEPTION 'agentic_chat_text_batch_flush_invalid_batch';
	END IF;

	FOR v_item, v_index IN
		SELECT entries.item, entries.ordinal
		FROM jsonb_array_elements(p_batches) WITH ORDINALITY AS entries(item, ordinal)
	LOOP
		BEGIN
			IF jsonb_typeof(v_item) <> 'object' THEN
				RAISE EXCEPTION 'agentic_chat_text_batch_flush_invalid_item';
			END IF;

			SELECT public.persist_agentic_chat_text_batch(
				(v_item->>'turn_run_id')::uuid,
				(v_item->>'queue_job_id')::uuid,
				(v_item->>'processing_token')::uuid,
				(v_item->>'execution_generation')::integer,
				(v_item->>'batch_id')::uuid,
				v_item->>'text_delta',
				v_item->>'assistant_text'
			)
			INTO v_result;

			IF v_result->>'outcome' = 'persisted'
				AND COALESCE((v_result->>'publish_allowed')::boolean, false) THEN
				v_persisted_count := v_persisted_count + 1;
			END IF;
		EXCEPTION
			WHEN OTHERS THEN
				GET STACKED DIAGNOSTICS
					v_error_code = RETURNED_SQLSTATE,
					v_error_message = MESSAGE_TEXT;
				v_rejected_count := v_rejected_count + 1;
				v_result := jsonb_build_object(
					'outcome', 'rejected',
					'publish_allowed', false,
					'error_code', v_error_code,
					'error_message', left(v_error_message, 512)
				);
		END;

		v_results := v_results || jsonb_build_array(
			v_result || jsonb_build_object('input_index', v_index - 1)
		);
	END LOOP;

	RETURN jsonb_build_object(
		'outcome', 'flushed',
		'input_count', jsonb_array_length(p_batches),
		'persisted_count', v_persisted_count,
		'rejected_count', v_rejected_count,
		'results', v_results
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_text_batch(
	uuid, uuid, uuid, integer, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_text_batch(
	uuid, uuid, uuid, integer, uuid, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_semantic_event(
	uuid, uuid, uuid, integer, uuid, text, text, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_semantic_event(
	uuid, uuid, uuid, integer, uuid, text, text, text, jsonb, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.flush_agentic_chat_text_batches(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flush_agentic_chat_text_batches(jsonb)
	TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_text_batch(
	uuid, uuid, uuid, integer, uuid, text, text
) IS 'Generation-fenced coalesced text persistence. Only a newly persisted receipt authorizes Broadcast.';
COMMENT ON FUNCTION public.persist_agentic_chat_semantic_event(
	uuid, uuid, uuid, integer, uuid, text, text, text, jsonb, jsonb
) IS 'Atomically persists one nonterminal semantic event and its complete generation projection. Terminal done remains finalizer-only.';
COMMENT ON FUNCTION public.flush_agentic_chat_text_batches(jsonb)
	IS 'Flushes at most 128 independent text batches with per-item subtransaction isolation and accepted-row publication receipts.';

