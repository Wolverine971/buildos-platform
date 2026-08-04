-- supabase/migrations/20260804034000_agentic_chat_provider_failure_terminal_events.sql
-- Agentic Chat Worker, Phase 4 Slice 9: preserve a failed provider prefix in
-- reconnect state without inserting it into assistant conversation history,
-- and atomically commit error -> timing -> done terminal events.

BEGIN;

-- The base terminal CAS deliberately keeps p_assistant_text as stream-state
-- truth. Only completed and cancelled-partial turns may turn that text into a
-- chat_messages row; failed text is visible for same-turn reconciliation but
-- must not become trusted history on the next admission.
DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid =
		'public.finalize_agentic_chat_turn(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb)'::regprocedure;

	v_next := replace(
		v_body,
		$old$	v_should_persist_message := p_status = 'completed' OR p_assistant_text <> '';$old$,
		$new$	v_should_persist_message := p_status = 'completed'
		OR (p_status = 'cancelled' AND p_assistant_text <> '');$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_failure_migration_unexpected_message_policy';
	END IF;
	v_body := v_next;

	-- Terminal timestamps are one transaction-owned fact. This also makes the
	-- inserted done event agree with atomic wrapper timing without an illegal
	-- UPDATE against the append-only event table.
	v_next := replace(
		v_body,
		$old$	v_now := clock_timestamp();$old$,
		$new$	v_now := transaction_timestamp();$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_failure_migration_unexpected_terminal_clock';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$					completion_tokens,
					total_tokens
				) VALUES (
					p_assistant_message_id,
					v_turn.session_id,
					v_turn.user_id,
					'assistant',
					p_assistant_text,
					v_message_metadata,
					p_prompt_tokens,
					p_completion_tokens,
					p_total_tokens
				)$old$,
		$new$					completion_tokens,
					total_tokens,
					created_at
				) VALUES (
					p_assistant_message_id,
					v_turn.session_id,
					v_turn.user_id,
					'assistant',
					p_assistant_text,
					v_message_metadata,
					p_prompt_tokens,
					p_completion_tokens,
					p_total_tokens,
					v_now
				)$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_failure_migration_unexpected_message_timestamp_insert';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
		CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn(
			p_turn_run_id uuid,
			p_user_id uuid,
			p_queue_job_id uuid,
			p_processing_token uuid,
			p_execution_generation integer,
			p_status text,
			p_finished_reason text,
			p_failure_code text,
			p_assistant_message_id uuid,
			p_assistant_text text,
			p_assistant_metadata jsonb,
			p_prompt_tokens integer,
			p_completion_tokens integer,
			p_total_tokens integer,
			p_projection jsonb,
			p_event_payload jsonb
		)
		RETURNS jsonb
		LANGUAGE plpgsql
		SECURITY INVOKER
		SET search_path = pg_catalog, public
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

-- Slice 6 originally aligned message/done timestamps with UPDATE statements
-- after the base CAS. chat_turn_events is intentionally immutable, so replace
-- both writes with checks now that the base CAS owns transaction timestamps.
DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid =
		'public.finalize_agentic_chat_turn_with_terminal_events(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,jsonb,uuid,jsonb,uuid)'::regprocedure;

	v_next := replace(
		v_body,
		$old$	UPDATE public.chat_messages messages
	SET created_at = v_committed_at
	WHERE messages.id = (v_terminal_receipt->>'assistant_message_id')::uuid
		AND messages.session_id = v_turn.session_id
		AND messages.user_id = v_turn.user_id
		AND messages.role = 'assistant'
	RETURNING messages.created_at INTO v_message_created_at;
	IF NOT FOUND OR v_message_created_at IS DISTINCT FROM v_committed_at THEN$old$,
		$new$	SELECT messages.created_at
	INTO v_message_created_at
	FROM public.chat_messages messages
	WHERE messages.id = (v_terminal_receipt->>'assistant_message_id')::uuid
		AND messages.session_id = v_turn.session_id
		AND messages.user_id = v_turn.user_id
		AND messages.role = 'assistant';
	IF NOT FOUND OR v_message_created_at IS DISTINCT FROM v_committed_at THEN$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_failure_migration_unexpected_message_timestamp_write';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	UPDATE public.chat_turn_events events
	SET created_at = v_committed_at
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.event_id = v_terminal_receipt->>'terminal_event_id';
	IF NOT FOUND THEN$old$,
		$new$	PERFORM 1
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.event_id = v_terminal_receipt->>'terminal_event_id'
		AND events.created_at IS NOT DISTINCT FROM v_committed_at;
	IF NOT FOUND THEN$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_failure_migration_unexpected_done_timestamp_write';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
		CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn_with_terminal_events(
			p_turn_run_id uuid,
			p_user_id uuid,
			p_queue_job_id uuid,
			p_processing_token uuid,
			p_execution_generation integer,
			p_status text,
			p_finished_reason text,
			p_failure_code text,
			p_assistant_message_id uuid,
			p_assistant_text text,
			p_assistant_metadata jsonb,
			p_prompt_tokens integer,
			p_completion_tokens integer,
			p_total_tokens integer,
			p_projection jsonb,
			p_event_payload jsonb,
			p_last_turn_context jsonb,
			p_last_turn_context_transition_id uuid,
			p_timing_draft jsonb,
			p_timing_transition_id uuid
		)
		RETURNS jsonb
		LANGUAGE plpgsql
		SECURITY INVOKER
		SET search_path = pg_catalog, public
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn_with_failure_events(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_status text,
	p_finished_reason text,
	p_failure_code text,
	p_assistant_message_id uuid,
	p_assistant_text text,
	p_assistant_metadata jsonb,
	p_prompt_tokens integer,
	p_completion_tokens integer,
	p_total_tokens integer,
	p_projection jsonb,
	p_event_payload jsonb,
	p_public_error text,
	p_error_transition_id uuid,
	p_timing_draft jsonb,
	p_timing_transition_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_committed_at timestamptz;
	v_public_error text := NULLIF(btrim(p_public_error), '');
	v_timing_draft jsonb;
	v_timing_phases jsonb;
	v_error_payload jsonb;
	v_timing_payload jsonb;
	v_error_event jsonb;
	v_timing_event jsonb;
	v_projection jsonb;
	v_error_projection jsonb;
	v_timing_projection jsonb;
	v_prior_events jsonb;
	v_error_receipt jsonb;
	v_timing_receipt jsonb;
	v_terminal_receipt jsonb;
	v_first_event_at timestamptz;
	v_first_response_at timestamptz;
	v_error_sequence integer;
	v_timing_sequence integer;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	-- Match the domain-first lock order. Replays, stale owners, and a concurrent
	-- cancellation winner resolve through the authoritative base terminal CAS.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_turn.status IN ('completed', 'failed', 'cancelled')
		OR v_turn.execution_generation IS DISTINCT FROM p_execution_generation
		OR v_turn.status <> 'running'
		OR v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN public.finalize_agentic_chat_turn(
			p_turn_run_id, p_user_id, p_queue_job_id, p_processing_token,
			p_execution_generation, p_status, p_finished_reason, p_failure_code,
			p_assistant_message_id, p_assistant_text, p_assistant_metadata,
			p_prompt_tokens, p_completion_tokens, p_total_tokens,
			p_projection, p_event_payload
		);
	END IF;

	IF p_status IS DISTINCT FROM 'failed'
		OR p_failure_code IS NULL
		OR NULLIF(btrim(p_failure_code), '') IS NULL
		OR p_assistant_message_id IS NOT NULL
		OR p_prompt_tokens IS NOT NULL
		OR p_completion_tokens IS NOT NULL
		OR p_total_tokens IS NOT NULL
		OR v_public_error IS NULL
		OR length(v_public_error) > 512
		OR p_error_transition_id IS NULL
		OR p_timing_transition_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_invalid_failure';
	END IF;

	v_timing_draft := COALESCE(p_timing_draft, 'null'::jsonb);
	v_projection := COALESCE(p_projection, 'null'::jsonb);
	IF jsonb_typeof(v_projection) <> 'object'
		OR jsonb_typeof(v_projection->'semantic_events') IS DISTINCT FROM 'array'
		OR jsonb_typeof(v_timing_draft) <> 'object'
		OR pg_column_size(v_timing_draft) > 262144
		OR v_timing_draft->>'timing_contract_version' IS DISTINCT FROM 'agentic_chat_async_v1'
		OR jsonb_typeof(v_timing_draft->'phases') IS DISTINCT FROM 'object'
		OR v_timing_draft ? 'assistant_persisted_at'
		OR v_timing_draft ? 'done_emitted_at'
		OR v_timing_draft ? 'terminal_committed_at'
		OR (v_timing_draft->'phases') ? 'total_request_ms'
		OR v_timing_draft->>'request_started_at' IS DISTINCT FROM v_timing_draft->>'admitted_at'
		OR v_timing_draft->>'finished_reason' IS DISTINCT FROM p_finished_reason
		OR EXISTS (
			SELECT 1
			FROM jsonb_object_keys(v_timing_draft) AS timing_keys(key)
			WHERE timing_keys.key NOT IN (
				'timing_contract_version', 'request_started_at', 'admitted_at',
				'accepted_at', 'worker_started_at', 'provider_authorized_at',
				'first_event_at', 'first_response_at', 'cache_source',
				'cache_age_seconds', 'request_prewarmed_context', 'history_strategy',
				'history_compressed', 'raw_history_count', 'history_for_model_count',
				'prepared_prompt_hit', 'prepared_prompt_miss_reason',
				'prepared_surface_profile', 'finished_reason', 'phases'
			)
		)
		OR EXISTS (
			SELECT 1
			FROM jsonb_each(v_timing_draft->'phases') AS phase_entries(key, value)
			WHERE phase_entries.key NOT IN (
				'admission_to_acceptance_ms', 'queue_wait_ms',
				'worker_start_to_provider_authority_ms', 'time_to_first_event_ms',
				'time_to_first_response_ms',
				'provider_authority_to_first_event_persistence_ms',
				'provider_authority_to_first_response_persistence_ms',
				'provider_authority_to_finish_ms',
				'provider_finish_to_terminal_call_ms', 'response_generation_ms'
			)
				OR jsonb_typeof(phase_entries.value) <> 'number'
				OR (phase_entries.value::text)::numeric < 0
		) THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_invalid_timing';
	END IF;

	IF v_turn.created_at IS NULL
		OR v_turn.started_at IS NULL
		OR v_turn.worker_started_at IS NULL
		OR v_turn.execution_started_at IS NULL
		OR (v_timing_draft->>'admitted_at')::timestamptz IS DISTINCT FROM v_turn.created_at
		OR (v_timing_draft->>'accepted_at')::timestamptz IS DISTINCT FROM v_turn.started_at
		OR (v_timing_draft->>'worker_started_at')::timestamptz IS DISTINCT FROM v_turn.worker_started_at
		OR (v_timing_draft->>'provider_authorized_at')::timestamptz IS DISTINCT FROM v_turn.execution_started_at
		OR v_timing_draft->>'cache_source' IS DISTINCT FROM v_turn.cache_source
		OR (v_timing_draft->>'cache_age_seconds')::numeric IS DISTINCT FROM v_turn.cache_age_seconds
		OR (v_timing_draft->>'request_prewarmed_context')::boolean IS DISTINCT FROM v_turn.request_prewarmed_context
		OR v_timing_draft->>'history_strategy' IS DISTINCT FROM v_turn.history_strategy
		OR (v_timing_draft->>'history_compressed')::boolean IS DISTINCT FROM v_turn.history_compressed
		OR (v_timing_draft->>'raw_history_count')::integer IS DISTINCT FROM v_turn.raw_history_count
		OR (v_timing_draft->>'history_for_model_count')::integer IS DISTINCT FROM v_turn.history_for_model_count
		OR (v_timing_draft->>'prepared_prompt_hit')::boolean IS DISTINCT FROM v_turn.prepared_prompt_hit
		OR v_timing_draft->>'prepared_prompt_miss_reason' IS DISTINCT FROM v_turn.prepared_prompt_miss_reason
		OR v_timing_draft->>'prepared_surface_profile' IS DISTINCT FROM v_turn.prepared_surface_profile THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_timing_source_mismatch';
	END IF;

	SELECT
		min(events.created_at),
		min(events.created_at) FILTER (WHERE events.event_type = 'text_delta')
	INTO v_first_event_at, v_first_response_at
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation;

	v_timing_phases := v_timing_draft->'phases';
	IF v_first_event_at IS NULL
		OR (v_timing_draft->>'first_event_at')::timestamptz IS DISTINCT FROM v_first_event_at
		OR (CASE
			WHEN v_first_response_at IS NULL THEN
				v_timing_draft->'first_response_at' IS DISTINCT FROM 'null'::jsonb
			ELSE (v_timing_draft->>'first_response_at')::timestamptz IS DISTINCT FROM v_first_response_at
		END)
		OR (v_timing_phases->>'admission_to_acceptance_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.started_at - v_turn.created_at)) * 1000
		OR (v_timing_phases->>'queue_wait_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.worker_started_at - v_turn.started_at)) * 1000
		OR (v_timing_phases->>'worker_start_to_provider_authority_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_turn.execution_started_at - v_turn.worker_started_at)) * 1000
		OR (v_timing_phases->>'time_to_first_event_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_first_event_at - v_turn.created_at)) * 1000
		OR (v_timing_phases->>'provider_authority_to_first_event_persistence_ms')::numeric IS DISTINCT FROM
			EXTRACT(epoch FROM (v_first_event_at - v_turn.execution_started_at)) * 1000
		OR (CASE
			WHEN v_first_response_at IS NULL THEN
				v_timing_phases ? 'time_to_first_response_ms'
					OR v_timing_phases ? 'provider_authority_to_first_response_persistence_ms'
					OR v_timing_phases ? 'response_generation_ms'
			ELSE
				jsonb_typeof(v_timing_phases->'response_generation_ms') IS DISTINCT FROM 'number'
					OR (v_timing_phases->>'time_to_first_response_ms')::numeric IS DISTINCT FROM
						EXTRACT(epoch FROM (v_first_response_at - v_turn.created_at)) * 1000
					OR (v_timing_phases->>'provider_authority_to_first_response_persistence_ms')::numeric IS DISTINCT FROM
						EXTRACT(epoch FROM (v_first_response_at - v_turn.execution_started_at)) * 1000
		END)
		OR jsonb_typeof(v_timing_phases->'provider_authority_to_finish_ms') IS DISTINCT FROM 'number'
		OR jsonb_typeof(v_timing_phases->'provider_finish_to_terminal_call_ms') IS DISTINCT FROM 'number' THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_timing_evidence_mismatch';
	END IF;

	IF v_turn.last_event_sequence > 2147483644 THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_sequence_exhausted';
	END IF;
	v_committed_at := transaction_timestamp();
	IF v_committed_at < v_turn.created_at
		OR v_committed_at < v_turn.execution_started_at
		OR v_committed_at < v_first_event_at
		OR (v_first_response_at IS NOT NULL AND v_committed_at < v_first_response_at) THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_commit_timestamp_invalid';
	END IF;

	v_error_payload := jsonb_build_object('type', 'error', 'error', v_public_error);
	v_timing_phases := v_timing_phases || jsonb_build_object(
		'total_request_ms', EXTRACT(epoch FROM (v_committed_at - v_turn.created_at)) * 1000
	);
	v_timing_payload := jsonb_build_object(
		'type', 'timing',
		'timing', v_timing_draft || jsonb_build_object(
			'assistant_persisted_at', NULL,
			'done_emitted_at', NULL,
			'terminal_committed_at', v_committed_at,
			'phases', v_timing_phases
		)
	);
	v_error_sequence := v_turn.last_event_sequence + 1;
	v_timing_sequence := v_turn.last_event_sequence + 2;
	v_error_event := v_error_payload || jsonb_build_object(
		'contract_version', 'agentic_chat_worker_v1',
		'event_id', v_turn.id::text || ':' || v_turn.execution_generation::text || ':' || v_error_sequence::text,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', COALESCE(v_turn.client_turn_id, ''),
		'session_id', v_turn.session_id,
		'turn_run_id', v_turn.id,
		'execution_generation', v_turn.execution_generation,
		'sequence_index', v_error_sequence,
		'phase', 'finalize', 'event_type', 'error', 'durable', true
	);
	v_timing_event := v_timing_payload || jsonb_build_object(
		'contract_version', 'agentic_chat_worker_v1',
		'event_id', v_turn.id::text || ':' || v_turn.execution_generation::text || ':' || v_timing_sequence::text,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', COALESCE(v_turn.client_turn_id, ''),
		'session_id', v_turn.session_id,
		'turn_run_id', v_turn.id,
		'execution_generation', v_turn.execution_generation,
		'sequence_index', v_timing_sequence,
		'phase', 'finalize', 'event_type', 'timing', 'durable', true
	);

	SELECT COALESCE(jsonb_agg(events.value ORDER BY events.ordinal), '[]'::jsonb)
	INTO v_prior_events
	FROM jsonb_array_elements(v_projection->'semantic_events')
		WITH ORDINALITY AS events(value, ordinal)
	WHERE events.ordinal > GREATEST(
		jsonb_array_length(v_projection->'semantic_events') - 126,
		0
	);
	v_error_projection := v_projection || jsonb_build_object(
		'current_activity', '',
		'semantic_events', v_prior_events || jsonb_build_array(v_error_event)
	);
	v_timing_projection := v_projection || jsonb_build_object(
		'current_activity', '',
		'semantic_events', v_prior_events || jsonb_build_array(v_error_event, v_timing_event)
	);
	IF pg_column_size(v_error_payload) > 262144
		OR pg_column_size(v_timing_payload) > 262144
		OR pg_column_size(v_timing_projection) > 524288 THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_payload_too_large';
	END IF;

	v_error_receipt := public.persist_agentic_chat_semantic_event(
		p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
		p_error_transition_id, p_assistant_text, 'finalize', 'error',
		v_error_projection, v_error_payload
	);
	IF v_error_receipt->>'outcome' IS DISTINCT FROM 'persisted'
		OR (v_error_receipt->>'publish_allowed')::boolean IS DISTINCT FROM true
		OR (v_error_receipt->>'turn_run_id')::uuid IS DISTINCT FROM v_turn.id
		OR (v_error_receipt->>'queue_job_id')::uuid IS DISTINCT FROM v_turn.queue_job_id
		OR (v_error_receipt->>'session_id')::uuid IS DISTINCT FROM v_turn.session_id
		OR (v_error_receipt->>'user_id')::uuid IS DISTINCT FROM v_turn.user_id
		OR (v_error_receipt->>'execution_generation')::integer IS DISTINCT FROM v_turn.execution_generation
		OR (v_error_receipt->>'sequence_index')::integer IS DISTINCT FROM v_error_sequence
		OR v_error_receipt->>'event_id' IS DISTINCT FROM
			v_turn.id::text || ':' || v_turn.execution_generation::text || ':' || v_error_sequence::text
		OR v_error_receipt->>'phase' IS DISTINCT FROM 'finalize'
		OR v_error_receipt->>'event_type' IS DISTINCT FROM 'error'
		OR (v_error_receipt->>'durable')::boolean IS DISTINCT FROM true
		OR (v_error_receipt->>'transition_id')::uuid IS DISTINCT FROM p_error_transition_id
		OR v_error_receipt->'event_payload' IS DISTINCT FROM v_error_payload THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_error_rejected';
	END IF;

	v_timing_receipt := public.persist_agentic_chat_semantic_event(
		p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
		p_timing_transition_id, p_assistant_text, 'finalize', 'timing',
		v_timing_projection, v_timing_payload
	);
	IF v_timing_receipt->>'outcome' IS DISTINCT FROM 'persisted'
		OR (v_timing_receipt->>'publish_allowed')::boolean IS DISTINCT FROM true
		OR (v_timing_receipt->>'turn_run_id')::uuid IS DISTINCT FROM v_turn.id
		OR (v_timing_receipt->>'queue_job_id')::uuid IS DISTINCT FROM v_turn.queue_job_id
		OR (v_timing_receipt->>'session_id')::uuid IS DISTINCT FROM v_turn.session_id
		OR (v_timing_receipt->>'user_id')::uuid IS DISTINCT FROM v_turn.user_id
		OR (v_timing_receipt->>'execution_generation')::integer IS DISTINCT FROM v_turn.execution_generation
		OR (v_timing_receipt->>'sequence_index')::integer IS DISTINCT FROM v_timing_sequence
		OR v_timing_receipt->>'event_id' IS DISTINCT FROM
			v_turn.id::text || ':' || v_turn.execution_generation::text || ':' || v_timing_sequence::text
		OR v_timing_receipt->>'phase' IS DISTINCT FROM 'finalize'
		OR v_timing_receipt->>'event_type' IS DISTINCT FROM 'timing'
		OR (v_timing_receipt->>'durable')::boolean IS DISTINCT FROM true
		OR (v_timing_receipt->>'transition_id')::uuid IS DISTINCT FROM p_timing_transition_id
		OR v_timing_receipt->'event_payload' IS DISTINCT FROM v_timing_payload THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_timing_rejected';
	END IF;

	v_terminal_receipt := public.finalize_agentic_chat_turn(
		p_turn_run_id, p_user_id, p_queue_job_id, p_processing_token,
		p_execution_generation, p_status, p_finished_reason, p_failure_code,
		NULL, p_assistant_text, p_assistant_metadata,
		NULL, NULL, NULL, v_timing_projection, p_event_payload
	);
	IF v_terminal_receipt->>'outcome' IS DISTINCT FROM 'finalized'
		OR (v_terminal_receipt->>'turn_run_id')::uuid IS DISTINCT FROM v_turn.id
		OR (v_terminal_receipt->>'queue_job_id')::uuid IS DISTINCT FROM v_turn.queue_job_id
		OR (v_terminal_receipt->>'session_id')::uuid IS DISTINCT FROM v_turn.session_id
		OR (v_terminal_receipt->>'user_id')::uuid IS DISTINCT FROM v_turn.user_id
		OR (v_terminal_receipt->>'execution_generation')::integer IS DISTINCT FROM v_turn.execution_generation
		OR v_terminal_receipt->>'status' IS DISTINCT FROM 'failed'
		OR v_terminal_receipt->'assistant_message_id' IS DISTINCT FROM 'null'::jsonb
		OR (v_terminal_receipt->>'terminal_sequence_index')::integer IS DISTINCT FROM v_turn.last_event_sequence + 3
		OR v_terminal_receipt->>'terminal_event_id' IS DISTINCT FROM
			v_turn.id::text || ':' || v_turn.execution_generation::text || ':' || (v_turn.last_event_sequence + 3)::text THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_terminal_rejected';
	END IF;

	PERFORM 1
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.event_id = v_terminal_receipt->>'terminal_event_id'
		AND events.created_at IS NOT DISTINCT FROM v_committed_at;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_done_timestamp_mismatch';
	END IF;

	UPDATE public.chat_turn_runs turns
	SET finished_at = v_committed_at,
		terminalized_at = v_committed_at,
		last_progress_at = v_committed_at,
		updated_at = v_committed_at
	WHERE turns.id = v_turn.id
		AND turns.execution_generation = v_turn.execution_generation
		AND turns.status = 'failed';
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_failure_events_finalize_turn_timestamp_mismatch';
	END IF;

	RETURN v_terminal_receipt || jsonb_build_object(
		'terminalized_at', v_committed_at,
		'preterminal_events', jsonb_build_array(v_error_receipt, v_timing_receipt)
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_agentic_chat_turn_with_failure_events(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, text, uuid, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_agentic_chat_turn_with_failure_events(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, text, uuid, jsonb, uuid
) TO service_role;

COMMENT ON FUNCTION public.finalize_agentic_chat_turn_with_failure_events(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, text, uuid, jsonb, uuid
) IS
	'Service-only failed-provider wrapper. Atomically persists generic public error, asynchronous timing with no assistant persistence timestamp, reconnect-only failed text, and done without inserting failed text into conversation history.';

COMMENT ON FUNCTION public.finalize_agentic_chat_turn(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb
) IS
	'Service-only terminal compare-and-set. Failed text remains in stream reconciliation state but only completed and cancelled-partial responses create assistant conversation-history rows.';

COMMIT;
