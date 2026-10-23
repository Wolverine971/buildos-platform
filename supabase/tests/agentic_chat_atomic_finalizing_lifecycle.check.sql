-- supabase/tests/agentic_chat_atomic_finalizing_lifecycle.check.sql
-- Disposable migration rehearsal only. All synthetic data is rolled back.
BEGIN;
\ir fixtures/tasker114_terminal_timing.sql
INSERT INTO auth.users(id,email) VALUES ('fa100000-0000-4000-8000-000000000001','lifecycle-fixture@example.com') ON CONFLICT DO NOTHING;
INSERT INTO public.users(id,email) VALUES ('fa100000-0000-4000-8000-000000000001','lifecycle-fixture@example.com') ON CONFLICT DO NOTHING;

CREATE FUNCTION pg_temp.seed_lifecycle(p_cancel boolean DEFAULT false, p_sequence integer DEFAULT 2)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
    PERFORM pg_temp.seed_timing_turn(v_id, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), v_id::text, p_sequence, true, p_cancel);
    RETURN v_id;
END;
$$;

CREATE FUNCTION pg_temp.finish_lifecycle(
    p_id uuid, p_timing jsonb DEFAULT NULL, p_legacy boolean DEFAULT false,
    p_generation integer DEFAULT 1, p_token uuid DEFAULT NULL, p_cancel boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_turn public.chat_turn_runs%ROWTYPE;
    v_token uuid;
    v_context jsonb := '{"summary":"Done","entities":{},"context_type":"global","data_accessed":[]}';
    v_projection jsonb := '{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}';
    v_event jsonb := '{"type":"done","status":"completed","finished_reason":"stop"}';
    v_status text := CASE WHEN p_cancel THEN 'cancelled' ELSE 'completed' END;
    v_reason text := CASE WHEN p_cancel THEN 'cancelled' ELSE 'stop' END;
    v_failure text := CASE WHEN p_cancel THEN 'cancelled' ELSE NULL END;
BEGIN
    SELECT * INTO STRICT v_turn FROM public.chat_turn_runs WHERE id = p_id;
    SELECT processing_token INTO STRICT v_token FROM public.queue_jobs WHERE id = v_turn.queue_job_id;
    v_token := COALESCE(p_token, v_token);
    v_event := v_event || jsonb_build_object('status', v_status, 'finished_reason', v_reason, 'failure_code', v_failure);
    IF p_legacy AND p_timing IS NOT NULL THEN
        RETURN public.finalize_agentic_chat_turn_with_terminal_events(
            p_id, v_turn.user_id, v_turn.queue_job_id, v_token, p_generation,
            v_status, v_reason, v_failure, gen_random_uuid(), 'fixture answer', '{}',
            NULL, NULL, NULL, v_projection, v_event,
            v_context, '10000000-0000-5000-8000-000000000001', p_timing, '10000000-0000-5000-8000-000000000002'
        );
    ELSIF p_legacy THEN
        RETURN public.finalize_agentic_chat_turn_with_last_context(
            p_id, v_turn.user_id, v_turn.queue_job_id, v_token, p_generation,
            v_status, v_reason, v_failure, gen_random_uuid(), 'fixture answer', '{}',
            NULL, NULL, NULL, v_projection, v_event,
            v_context, '10000000-0000-5000-8000-000000000001'
        );
    END IF;
    RETURN public.finalize_agentic_chat_turn_with_lifecycle(
        p_id, v_turn.user_id, v_turn.queue_job_id, v_token, p_generation,
        v_status, v_reason, v_failure, gen_random_uuid(), 'fixture answer', '{}',
        NULL, NULL, NULL, v_projection, v_event,
        v_context, '10000000-0000-5000-8000-000000000001',
        '{"type":"turn_phase","turn_phase":"finalizing","message":"Wrapping up…","workerProvenance":null}',
        '10000000-0000-5000-8000-000000000003',
        p_timing, CASE WHEN p_timing IS NOT NULL THEN '10000000-0000-5000-8000-000000000002'::uuid ELSE NULL END
    );
END;
$$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $check$
DECLARE
    v_id uuid;
    v_receipt jsonb;
    v_draft jsonb;
    v_types text[];
    v_projection jsonb;
    v_timed boolean;
    v_expected integer;
    v_signature text := 'public.finalize_agentic_chat_turn_with_lifecycle(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb,jsonb,uuid,jsonb,uuid,jsonb,uuid)';
BEGIN
    ASSERT has_function_privilege('service_role', v_signature, 'EXECUTE');
    ASSERT NOT has_function_privilege('anon', v_signature, 'EXECUTE');
    ASSERT NOT has_function_privilege('authenticated', v_signature, 'EXECUTE');

    FOREACH v_timed IN ARRAY ARRAY[true, false] LOOP
        v_id := pg_temp.seed_lifecycle();
        v_draft := CASE WHEN v_timed THEN pg_temp.timing_draft(v_id) ELSE NULL END;
        v_expected := CASE WHEN v_timed THEN 6 ELSE 5 END;
        v_receipt := pg_temp.finish_lifecycle(v_id, v_draft);
        ASSERT v_receipt->>'outcome' = 'finalized';
        ASSERT (v_receipt->>'terminal_sequence_index')::integer = v_expected;
        ASSERT NOT (v_receipt ? 'preterminal_event');
        SELECT array_agg(value->>'event_type' ORDER BY ordinal) INTO v_types
        FROM jsonb_array_elements(v_receipt->'preterminal_events') WITH ORDINALITY AS e(value, ordinal);
        ASSERT v_types = CASE WHEN v_timed THEN ARRAY['turn_phase','last_turn_context','timing'] ELSE ARRAY['turn_phase','last_turn_context'] END;
        ASSERT v_receipt#>>'{preterminal_events,0,event_payload,turn_phase}' = 'finalizing';
        ASSERT (v_receipt#>>'{preterminal_events,0,sequence_index}')::integer = 3;
        SELECT array_agg(event_type ORDER BY sequence_index) INTO v_types FROM public.chat_turn_events WHERE turn_run_id = v_id AND sequence_index > 2;
        ASSERT v_types = CASE WHEN v_timed THEN ARRAY['turn_phase','last_turn_context','timing','done'] ELSE ARRAY['turn_phase','last_turn_context','done'] END;
        SELECT projection INTO v_projection FROM public.chat_turn_stream_state WHERE turn_run_id = v_id;
        ASSERT v_projection->>'current_activity' = '';
        ASSERT v_projection#>>'{semantic_events,0,turn_phase}' = 'finalizing';
        ASSERT (SELECT count(*) = 1 FROM public.chat_messages WHERE session_id = v_id AND role = 'assistant');
        -- A lost response retry returns the winner without another lifecycle write.
        v_receipt := pg_temp.finish_lifecycle(v_id, NULL);
        ASSERT v_receipt->>'outcome' = 'already_terminal';
        ASSERT NOT (v_receipt ? 'preterminal_events');
        ASSERT (SELECT last_event_sequence = v_expected FROM public.chat_turn_runs WHERE id = v_id);

        -- Legacy clients retain the exact one/two-event receipt shape.
        v_id := pg_temp.seed_lifecycle();
        v_receipt := pg_temp.finish_lifecycle(v_id, CASE WHEN v_timed THEN pg_temp.timing_draft(v_id) ELSE NULL END, true);
        ASSERT v_receipt->>'outcome' = 'finalized';
        IF v_timed THEN
            ASSERT jsonb_array_length(v_receipt->'preterminal_events') = 2;
            ASSERT v_receipt#>>'{preterminal_events,0,event_type}' = 'last_turn_context';
        ELSE
            ASSERT v_receipt#>>'{preterminal_event,event_type}' = 'last_turn_context';
            ASSERT NOT (v_receipt ? 'preterminal_events');
        END IF;
        ASSERT NOT EXISTS (SELECT 1 FROM public.chat_turn_events WHERE turn_run_id = v_id AND payload->>'turn_phase' = 'finalizing');
    END LOOP;

    -- A timing validation error occurs after the new lifecycle write. The
    -- entire call must roll back so the timing-free retry gets a clean prefix.
    v_id := pg_temp.seed_lifecycle();
    BEGIN
        PERFORM pg_temp.finish_lifecycle(v_id, pg_temp.timing_draft(v_id) || '{"finished_reason":"invalid"}');
        RAISE EXCEPTION 'expected timing validation failure';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM = 'agentic_chat_terminal_events_finalize_invalid_timing', SQLERRM;
    END;
    ASSERT (SELECT status = 'running' AND last_event_sequence = 2 FROM public.chat_turn_runs WHERE id = v_id);
    ASSERT NOT EXISTS (SELECT 1 FROM public.chat_turn_events WHERE turn_run_id = v_id AND sequence_index > 2);
    ASSERT (SELECT projection->'semantic_events' = '[]'::jsonb FROM public.chat_turn_stream_state WHERE turn_run_id = v_id);
    v_receipt := pg_temp.finish_lifecycle(v_id);
    ASSERT v_receipt->>'outcome' = 'finalized';
    ASSERT (SELECT count(*) = 1 FROM public.chat_turn_events WHERE turn_run_id = v_id AND payload->>'turn_phase' = 'finalizing');

    -- Cancellation wins without a lifecycle write, then the original cancelled
    -- partial wrapper still preserves context, timing and the partial message.
    v_id := pg_temp.seed_lifecycle(true);
    v_receipt := pg_temp.finish_lifecycle(v_id, pg_temp.timing_draft(v_id));
    ASSERT v_receipt->>'outcome' = 'cancel_requested';
    ASSERT NOT EXISTS (SELECT 1 FROM public.chat_turn_events WHERE turn_run_id = v_id AND sequence_index > 2);
    v_receipt := pg_temp.finish_lifecycle(v_id, pg_temp.timing_draft(v_id) || '{"finished_reason":"cancelled"}', true, 1, NULL, true);
    ASSERT v_receipt->>'status' = 'cancelled';
    ASSERT jsonb_array_length(v_receipt->'preterminal_events') = 2;
    ASSERT (SELECT cancel_requested_at IS NOT NULL FROM public.chat_turn_runs WHERE id = v_id);

    v_id := pg_temp.seed_lifecycle();
    v_receipt := pg_temp.finish_lifecycle(v_id, NULL, false, 2);
    ASSERT v_receipt->>'outcome' = 'stale_generation';
    ASSERT (SELECT last_event_sequence = 2 FROM public.chat_turn_runs WHERE id = v_id);
    BEGIN
        PERFORM pg_temp.finish_lifecycle(v_id, NULL, false, 1, gen_random_uuid());
        RAISE EXCEPTION 'expected processing-token fence failure';
    EXCEPTION WHEN OTHERS THEN
        ASSERT SQLERRM <> 'expected processing-token fence failure';
    END;
    ASSERT NOT EXISTS (SELECT 1 FROM public.chat_turn_events WHERE turn_run_id = v_id AND sequence_index > 2);

    -- Capacity is checked before any write, with and without timing.
    FOREACH v_timed IN ARRAY ARRAY[true, false] LOOP
        v_expected := CASE WHEN v_timed THEN 4 ELSE 3 END;
        v_id := pg_temp.seed_lifecycle(false, 2147483647 - v_expected + 1);
        BEGIN
            PERFORM pg_temp.finish_lifecycle(v_id, CASE WHEN v_timed THEN pg_temp.timing_draft(v_id) ELSE NULL END);
            RAISE EXCEPTION 'expected sequence exhaustion';
        EXCEPTION WHEN OTHERS THEN
            ASSERT SQLERRM = 'agentic_chat_lifecycle_finalize_sequence_exhausted', SQLERRM;
        END;
        ASSERT NOT EXISTS (SELECT 1 FROM public.chat_turn_events WHERE turn_run_id = v_id AND sequence_index > 2);
        v_id := pg_temp.seed_lifecycle(false, 2147483647 - v_expected);
        v_receipt := pg_temp.finish_lifecycle(v_id, CASE WHEN v_timed THEN pg_temp.timing_draft(v_id) ELSE NULL END);
        ASSERT (v_receipt->>'terminal_sequence_index')::integer = 2147483647;
    END LOOP;
    RAISE NOTICE 'atomic finalizing lifecycle: ordering, legacy compatibility, rollback, retry, cancellation, fencing and capacity passed';
END;
$check$;
ROLLBACK;
