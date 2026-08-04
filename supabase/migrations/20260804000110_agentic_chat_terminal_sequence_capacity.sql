-- supabase/migrations/20260804000110_agentic_chat_terminal_sequence_capacity.sql
-- Agentic Chat Worker, Phase 4 Slice 5 hardening: reserve both terminal sequence slots.
--
-- New workers complete successful turns through this wrapper. It appends the
-- last_turn_context semantic event and delegates to the established terminal
-- CAS in one transaction, so clients can never reconcile done without the
-- continuity packet that precedes it. The original finalizer remains unchanged
-- for rolling compatibility with already-deployed workers.

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn_with_last_context(
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
	p_last_turn_context_transition_id uuid
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
	v_context jsonb;
	v_context_payload jsonb;
	v_context_event jsonb;
	v_projection jsonb;
	v_prior_events jsonb;
	v_semantic_receipt jsonb;
	v_terminal_receipt jsonb;
	v_message_created_at timestamptz;
	v_context_sequence integer;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_last_context_finalize_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	-- Match the established control-plane lock order and resolve replay/stale or
	-- cancellation outcomes through the original CAS without creating context.
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
			p_turn_run_id,
			p_user_id,
			p_queue_job_id,
			p_processing_token,
			p_execution_generation,
			p_status,
			p_finished_reason,
			p_failure_code,
			p_assistant_message_id,
			p_assistant_text,
			p_assistant_metadata,
			p_prompt_tokens,
			p_completion_tokens,
			p_total_tokens,
			p_projection,
			p_event_payload
		);
	END IF;

	IF p_status IS DISTINCT FROM 'completed'
		OR p_failure_code IS NOT NULL
		OR p_last_turn_context_transition_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_last_context_finalize_invalid_completion';
	END IF;

	v_context := COALESCE(p_last_turn_context, 'null'::jsonb);
	v_projection := COALESCE(p_projection, 'null'::jsonb);
	IF jsonb_typeof(v_context) <> 'object'
		OR pg_column_size(v_context) > 262144
		OR v_context ? 'timestamp'
		OR jsonb_typeof(v_context->'entities') IS DISTINCT FROM 'object'
		OR jsonb_typeof(v_context->'data_accessed') IS DISTINCT FROM 'array'
		OR NULLIF(btrim(v_context->>'summary'), '') IS NULL
		OR NULLIF(btrim(v_context->>'context_type'), '') IS NULL
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_context->'data_accessed') AS accessed(value)
			WHERE jsonb_typeof(accessed.value) <> 'string'
		)
		OR jsonb_typeof(v_projection) <> 'object'
		OR jsonb_typeof(v_projection->'semantic_events') IS DISTINCT FROM 'array' THEN
		RAISE EXCEPTION 'agentic_chat_last_context_finalize_invalid_payload';
	END IF;

	-- The wrapper owns two consecutive writes. Reject before integer addition or
	-- semantic persistence when the context + done pair cannot both fit.
	IF v_turn.last_event_sequence > 2147483645 THEN
		RAISE EXCEPTION 'agentic_chat_last_context_finalize_sequence_exhausted';
	END IF;

	-- Pin one authoritative commit timestamp. The legacy finalizer owns the
	-- assistant insert, then this same transaction aligns its created_at before
	-- anything becomes visible.
	v_committed_at := transaction_timestamp();
	v_context := v_context || jsonb_build_object('timestamp', v_committed_at);
	v_context_payload := jsonb_build_object(
		'type', 'last_turn_context',
		'context', v_context
	);
	v_context_sequence := v_turn.last_event_sequence + 1;
	v_context_event := v_context_payload || jsonb_build_object(
		'contract_version', 'agentic_chat_worker_v1',
		'event_id', v_turn.id::text || ':' || v_turn.execution_generation::text
			|| ':' || v_context_sequence::text,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', COALESCE(v_turn.client_turn_id, ''),
		'session_id', v_turn.session_id,
		'turn_run_id', v_turn.id,
		'execution_generation', v_turn.execution_generation,
		'sequence_index', v_context_sequence,
		'phase', 'finalize',
		'event_type', 'last_turn_context',
		'durable', true
	);

	SELECT COALESCE(jsonb_agg(events.value ORDER BY events.ordinal), '[]'::jsonb)
	INTO v_prior_events
	FROM jsonb_array_elements(v_projection->'semantic_events')
		WITH ORDINALITY AS events(value, ordinal)
	WHERE events.ordinal > GREATEST(
		jsonb_array_length(v_projection->'semantic_events') - 127,
		0
	);
	v_projection := v_projection || jsonb_build_object(
		'current_activity', '',
		'semantic_events', v_prior_events || jsonb_build_array(v_context_event)
	);

	IF pg_column_size(v_context_payload) > 262144
		OR pg_column_size(v_projection) > 524288 THEN
		RAISE EXCEPTION 'agentic_chat_last_context_finalize_invalid_payload';
	END IF;

	v_semantic_receipt := public.persist_agentic_chat_semantic_event(
		p_turn_run_id,
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		p_last_turn_context_transition_id,
		p_assistant_text,
		'finalize',
		'last_turn_context',
		v_projection,
		v_context_payload
	);
	IF v_semantic_receipt->>'outcome' NOT IN ('persisted', 'already_persisted') THEN
		RAISE EXCEPTION 'agentic_chat_last_context_finalize_semantic_rejected';
	END IF;

	v_terminal_receipt := public.finalize_agentic_chat_turn(
		p_turn_run_id,
		p_user_id,
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		p_status,
		p_finished_reason,
		p_failure_code,
		p_assistant_message_id,
		p_assistant_text,
		p_assistant_metadata,
		p_prompt_tokens,
		p_completion_tokens,
		p_total_tokens,
		v_projection,
		p_event_payload
	);
	IF v_terminal_receipt->>'outcome' <> 'finalized' THEN
		RAISE EXCEPTION 'agentic_chat_last_context_finalize_terminal_rejected';
	END IF;

	UPDATE public.chat_messages messages
	SET created_at = v_committed_at
	WHERE messages.id = (v_terminal_receipt->>'assistant_message_id')::uuid
		AND messages.session_id = v_turn.session_id
		AND messages.user_id = v_turn.user_id
		AND messages.role = 'assistant'
	RETURNING messages.created_at
	INTO v_message_created_at
	;
	IF NOT FOUND OR v_message_created_at IS DISTINCT FROM v_committed_at THEN
		RAISE EXCEPTION 'agentic_chat_last_context_finalize_message_timestamp_mismatch';
	END IF;

	RETURN v_terminal_receipt || jsonb_build_object(
		'preterminal_event', v_semantic_receipt
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_agentic_chat_turn_with_last_context(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_agentic_chat_turn_with_last_context(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, jsonb, uuid
) TO service_role;

COMMENT ON FUNCTION public.finalize_agentic_chat_turn_with_last_context(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb, jsonb, uuid
) IS
	'Service-only successful completion wrapper. Atomically persists last_turn_context with the committed assistant timestamp immediately before the established done finalizer.';

COMMIT;

