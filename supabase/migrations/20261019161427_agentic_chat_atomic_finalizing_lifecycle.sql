-- supabase/migrations/20261019161427_agentic_chat_atomic_finalizing_lifecycle.sql
-- Normal completion: finalizing -> last_turn_context -> [timing] -> done.
-- Opt-in wrapper: legacy RPC signatures and receipt shapes remain unchanged.
-- Deploy this migration before the worker. Timing-free retries use the same
-- wrapper; any rejected terminal write rolls back its finalizing event too.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn_with_lifecycle(
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
    p_finalizing_event jsonb,
    p_finalizing_transition_id uuid,
    p_timing_draft jsonb DEFAULT NULL,
    p_timing_transition_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_turn public.chat_turn_runs%ROWTYPE;
    v_projection jsonb;
    v_event jsonb;
    v_prior_events jsonb;
    v_lifecycle_receipt jsonb;
    v_terminal_receipt jsonb;
    v_prefix jsonb;
    v_slots integer := CASE WHEN p_timing_draft IS NULL THEN 3 ELSE 4 END;
BEGIN
    IF COALESCE(NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''), current_user) <> 'service_role' THEN
        RAISE EXCEPTION 'agentic_chat_lifecycle_finalize_service_role_required' USING ERRCODE = '42501';
    END IF;

    -- Same lock order as the underlying writers: turn, queue job, stream.
    -- Resolve cancellation, stale ownership and replay before adding any event.
    SELECT * INTO v_turn FROM public.chat_turn_runs WHERE id = p_turn_run_id FOR UPDATE;
    IF NOT FOUND OR v_turn.status <> 'running'
        OR v_turn.execution_generation IS DISTINCT FROM p_execution_generation
        OR v_turn.cancel_requested_at IS NOT NULL THEN
        RETURN public.finalize_agentic_chat_turn(
            p_turn_run_id, p_user_id, p_queue_job_id, p_processing_token,
            p_execution_generation, p_status, p_finished_reason, p_failure_code,
            p_assistant_message_id, p_assistant_text, p_assistant_metadata,
            p_prompt_tokens, p_completion_tokens, p_total_tokens, p_projection, p_event_payload
        );
    END IF;

    IF p_status IS DISTINCT FROM 'completed' OR p_failure_code IS NOT NULL
        OR p_last_turn_context IS NULL OR p_last_turn_context_transition_id IS NULL
        OR p_finalizing_transition_id IS NULL
        OR p_finalizing_transition_id = p_last_turn_context_transition_id
        OR p_finalizing_transition_id = p_timing_transition_id
        OR (p_timing_draft IS NULL) <> (p_timing_transition_id IS NULL)
        OR jsonb_typeof(p_finalizing_event) IS DISTINCT FROM 'object'
        OR p_finalizing_event->>'type' IS DISTINCT FROM 'turn_phase'
        OR p_finalizing_event->>'turn_phase' IS DISTINCT FROM 'finalizing'
        OR jsonb_typeof(p_finalizing_event->'message') IS DISTINCT FROM 'string'
        OR NULLIF(btrim(p_finalizing_event->>'message'), '') IS NULL
        OR length(p_finalizing_event->>'message') > 1000
        OR pg_column_size(p_finalizing_event) > 262144
        OR jsonb_typeof(p_projection) IS DISTINCT FROM 'object'
        OR jsonb_typeof(p_projection->'semantic_events') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'agentic_chat_lifecycle_finalize_invalid_payload';
    END IF;
    IF v_turn.last_event_sequence > 2147483647 - v_slots THEN
        RAISE EXCEPTION 'agentic_chat_lifecycle_finalize_sequence_exhausted';
    END IF;

    v_event := p_finalizing_event || jsonb_build_object(
        'contract_version', 'agentic_chat_worker_v1',
        'event_id', v_turn.id::text || ':' || v_turn.execution_generation::text || ':' || (v_turn.last_event_sequence + 1)::text,
        'stream_run_id', v_turn.stream_run_id,
        'client_turn_id', COALESCE(v_turn.client_turn_id, ''),
        'session_id', v_turn.session_id, 'turn_run_id', v_turn.id,
        'execution_generation', v_turn.execution_generation,
        'sequence_index', v_turn.last_event_sequence + 1,
        'phase', 'stream', 'event_type', 'turn_phase', 'durable', true
    );
    -- Leave room for the complete semantic prefix in the bounded projection.
    SELECT COALESCE(jsonb_agg(events.value ORDER BY events.ordinal), '[]'::jsonb)
    INTO v_prior_events
    FROM jsonb_array_elements(p_projection->'semantic_events') WITH ORDINALITY AS events(value, ordinal)
    WHERE events.ordinal > GREATEST(jsonb_array_length(p_projection->'semantic_events') - (129 - v_slots), 0);
    v_projection := p_projection || jsonb_build_object(
        'current_activity', p_finalizing_event->>'message',
        'semantic_events', v_prior_events || jsonb_build_array(v_event)
    );

    v_lifecycle_receipt := public.persist_agentic_chat_semantic_event(
        p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
        p_finalizing_transition_id, p_assistant_text, 'stream', 'turn_phase',
        v_projection, p_finalizing_event
    );
    IF v_lifecycle_receipt->>'outcome' IS DISTINCT FROM 'persisted'
        OR (v_lifecycle_receipt->>'sequence_index')::integer IS DISTINCT FROM v_turn.last_event_sequence + 1 THEN
        RAISE EXCEPTION 'agentic_chat_lifecycle_finalize_semantic_rejected';
    END IF;

    IF p_timing_draft IS NULL THEN
        v_terminal_receipt := public.finalize_agentic_chat_turn_with_last_context(
            p_turn_run_id, p_user_id, p_queue_job_id, p_processing_token,
            p_execution_generation, p_status, p_finished_reason, p_failure_code,
            p_assistant_message_id, p_assistant_text, p_assistant_metadata,
            p_prompt_tokens, p_completion_tokens, p_total_tokens, v_projection, p_event_payload,
            p_last_turn_context, p_last_turn_context_transition_id
        );
        v_prefix := jsonb_build_array(v_lifecycle_receipt, v_terminal_receipt->'preterminal_event');
    ELSE
        v_terminal_receipt := public.finalize_agentic_chat_turn_with_terminal_events(
            p_turn_run_id, p_user_id, p_queue_job_id, p_processing_token,
            p_execution_generation, p_status, p_finished_reason, p_failure_code,
            p_assistant_message_id, p_assistant_text, p_assistant_metadata,
            p_prompt_tokens, p_completion_tokens, p_total_tokens, v_projection, p_event_payload,
            p_last_turn_context, p_last_turn_context_transition_id, p_timing_draft, p_timing_transition_id
        );
        v_prefix := jsonb_build_array(v_lifecycle_receipt) || (v_terminal_receipt->'preterminal_events');
    END IF;
    IF v_terminal_receipt->>'outcome' IS DISTINCT FROM 'finalized'
        OR (v_terminal_receipt->>'terminal_sequence_index')::integer IS DISTINCT FROM v_turn.last_event_sequence + v_slots THEN
        RAISE EXCEPTION 'agentic_chat_lifecycle_finalize_terminal_rejected';
    END IF;
    RETURN (v_terminal_receipt - 'preterminal_event') || jsonb_build_object('preterminal_events', v_prefix);
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_agentic_chat_turn_with_lifecycle(
    uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
    integer, integer, integer, jsonb, jsonb, jsonb, uuid, jsonb, uuid, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_agentic_chat_turn_with_lifecycle(
    uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
    integer, integer, integer, jsonb, jsonb, jsonb, uuid, jsonb, uuid, jsonb, uuid
) TO service_role;

COMMENT ON FUNCTION public.finalize_agentic_chat_turn_with_lifecycle(
    uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
    integer, integer, integer, jsonb, jsonb, jsonb, uuid, jsonb, uuid, jsonb, uuid
) IS 'Service-only opt-in completion wrapper: atomically persist finalizing, context, optional timing and done, retaining the legacy finalizers and cancellation/replay fences.';
COMMIT;
