-- supabase/tests/fixtures/tasker114_terminal_timing.sql
-- Synthetic terminal fixtures adapted from the existing timing regression. Local rehearsal only.
CREATE OR REPLACE FUNCTION pg_temp.seed_timing_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_user_message_id uuid,
	p_correlation_id uuid,
	p_suffix text,
	p_last_sequence integer,
	p_with_text boolean,
	p_cancel_requested boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_admitted_at timestamptz := clock_timestamp() - interval '10 seconds';
	v_accepted_at timestamptz := v_admitted_at + interval '100 milliseconds';
	v_worker_started_at timestamptz := v_admitted_at + interval '200 milliseconds';
	v_provider_authorized_at timestamptz := v_admitted_at + interval '300 milliseconds';
BEGIN
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		'global',
		'active'
	);

	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (
		p_user_message_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		'user',
		'timing fixture ' || p_suffix,
		jsonb_build_object('idempotency_key', 'terminal-timing-user-' || p_suffix)
	);

	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status,
		queue_job_id, processing_token, started_at, attempts, max_attempts
	) VALUES (
		p_queue_job_id,
		'fa100000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', p_turn_run_id,
			'correlationId', p_correlation_id
		),
		v_admitted_at,
		'agentic-chat-turn:' || p_turn_run_id::text,
		'processing',
		'agentic_chat_terminal_timing_' || p_suffix,
		p_processing_token,
		v_worker_started_at,
		0,
		3
	);

	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, worker_started_at, execution_started_at,
		history_cutoff_at, last_progress_at, last_event_sequence, user_message_id,
		created_at, started_at, cache_source, cache_age_seconds,
		request_prewarmed_context, history_strategy, history_compressed,
		raw_history_count, history_for_model_count, prepared_prompt_hit,
		prepared_prompt_miss_reason, prepared_surface_profile,
		cancel_requested_at, cancel_reason
	) VALUES (
		p_turn_run_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		'terminal-timing-stream-' || p_suffix,
		'terminal-timing-client-' || p_suffix,
		'global',
		'timing fixture ' || p_suffix,
		'running',
		'worker_realtime',
		p_queue_job_id,
		p_correlation_id,
		1,
		v_worker_started_at,
		v_provider_authorized_at,
		v_accepted_at,
		v_provider_authorized_at,
		p_last_sequence,
		p_user_message_id,
		v_admitted_at,
		v_accepted_at,
		'not_requested',
		NULL,
		false,
		'raw_history',
		false,
		0,
		0,
		false,
		NULL,
		NULL,
		CASE WHEN p_cancel_requested THEN v_provider_authorized_at ELSE NULL END,
		CASE WHEN p_cancel_requested THEN 'user_cancelled' ELSE NULL END
	);

	INSERT INTO public.chat_turn_events (
		turn_run_id, session_id, user_id, stream_run_id, execution_generation,
		sequence_index, event_id, phase, event_type, payload, created_at
	) VALUES (
		p_turn_run_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		'terminal-timing-stream-' || p_suffix,
		1,
		1,
		p_turn_run_id::text || ':1:1',
		'stream',
		'turn_phase',
		'{"type":"turn_phase","turn_phase":"acknowledged"}'::jsonb,
		v_admitted_at + interval '500 milliseconds'
	);

	IF p_with_text THEN
		INSERT INTO public.chat_turn_events (
			turn_run_id, session_id, user_id, stream_run_id, execution_generation,
			sequence_index, event_id, phase, event_type, payload, created_at
		) VALUES (
			p_turn_run_id,
			p_turn_run_id,
			'fa100000-0000-4000-8000-000000000001',
			'terminal-timing-stream-' || p_suffix,
			1,
			2,
			p_turn_run_id::text || ':1:2',
			'llm',
			'text_delta',
			'{"type":"text_delta","content":"fixture answer"}'::jsonb,
			v_admitted_at + interval '750 milliseconds'
		);
	END IF;

	INSERT INTO public.chat_turn_stream_state (
		turn_run_id, session_id, user_id, execution_generation,
		snapshot_sequence, durable_through_sequence, projection_durable_sequence,
		assistant_text, projection, first_text_persisted_at
	) VALUES (
		p_turn_run_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		1,
		p_last_sequence,
		p_last_sequence,
		p_last_sequence,
		'fixture answer',
		'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb,
		CASE WHEN p_with_text THEN v_admitted_at + interval '750 milliseconds' ELSE NULL END
	);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.timing_draft(p_turn_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
	v_first_event_at timestamptz;
	v_first_response_at timestamptz;
	v_phases jsonb;
BEGIN
	SELECT * INTO STRICT v_turn
	FROM public.chat_turn_runs
	WHERE id = p_turn_run_id;

	SELECT min(created_at)
	INTO v_first_event_at
	FROM public.chat_turn_events
	WHERE turn_run_id = p_turn_run_id
		AND execution_generation = v_turn.execution_generation;

	-- First-response evidence is the stream state's first flushed text batch,
	-- matching the corrected validator source (text batches write no
	-- text_delta event rows).
	SELECT streams.first_text_persisted_at
	INTO v_first_response_at
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = p_turn_run_id
		AND streams.execution_generation = v_turn.execution_generation;

	v_phases := jsonb_build_object(
		'admission_to_acceptance_ms',
			EXTRACT(epoch FROM (v_turn.started_at - v_turn.created_at)) * 1000,
		'queue_wait_ms',
			EXTRACT(epoch FROM (v_turn.worker_started_at - v_turn.started_at)) * 1000,
		'worker_start_to_provider_authority_ms',
			EXTRACT(epoch FROM (v_turn.execution_started_at - v_turn.worker_started_at)) * 1000,
		'time_to_first_event_ms',
			EXTRACT(epoch FROM (v_first_event_at - v_turn.created_at)) * 1000,
		'provider_authority_to_first_event_persistence_ms',
			EXTRACT(epoch FROM (v_first_event_at - v_turn.execution_started_at)) * 1000,
		'provider_authority_to_finish_ms', 1000,
		'provider_finish_to_terminal_call_ms', 50
	);
	IF v_first_response_at IS NOT NULL THEN
		v_phases := v_phases || jsonb_build_object(
			'time_to_first_response_ms',
				EXTRACT(epoch FROM (v_first_response_at - v_turn.created_at)) * 1000,
			'provider_authority_to_first_response_persistence_ms',
				EXTRACT(epoch FROM (v_first_response_at - v_turn.execution_started_at)) * 1000,
			'response_generation_ms', 600
		);
	END IF;

	RETURN jsonb_build_object(
		'timing_contract_version', 'agentic_chat_async_v1',
		'request_started_at', v_turn.created_at,
		'admitted_at', v_turn.created_at,
		'accepted_at', v_turn.started_at,
		'worker_started_at', v_turn.worker_started_at,
		'provider_authorized_at', v_turn.execution_started_at,
		'first_event_at', v_first_event_at,
		'first_response_at', v_first_response_at,
		'cache_source', v_turn.cache_source,
		'cache_age_seconds', v_turn.cache_age_seconds,
		'request_prewarmed_context', v_turn.request_prewarmed_context,
		'history_strategy', v_turn.history_strategy,
		'history_compressed', v_turn.history_compressed,
		'raw_history_count', v_turn.raw_history_count,
		'history_for_model_count', v_turn.history_for_model_count,
		'prepared_prompt_hit', v_turn.prepared_prompt_hit,
		'prepared_prompt_miss_reason', v_turn.prepared_prompt_miss_reason,
		'prepared_surface_profile', v_turn.prepared_surface_profile,
		'finished_reason', 'stop',
		'phases', v_phases
	);
END;
$$;


GRANT EXECUTE ON FUNCTION pg_temp.timing_draft(uuid) TO service_role;
