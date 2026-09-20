-- supabase/migrations/20260920041644_agentic_chat_specialist_selection_shadow_v1.sql
-- Shadow evaluation only: no changes to workflow plans, permissions, or the dispatch ledger.
CREATE TABLE public.chat_turn_specialist_selection_shadows (
    turn_run_id uuid PRIMARY KEY REFERENCES public.chat_turn_workflow_runs(turn_run_id) ON DELETE CASCADE,
    request_hash text NOT NULL,
    context_id uuid NOT NULL,
    context_hash text NOT NULL,
    execution_generation integer NOT NULL,
    attempt_token uuid NOT NULL,
    input jsonb NOT NULL,
    input_hash text NOT NULL,
    result jsonb,
    result_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT specialist_shadow_input_bounds CHECK (COALESCE(
        jsonb_typeof(input) = 'object'
        AND input->>'version' = 'specialist_shadow_input_v1'
        AND input#>>'{policy,version}' = 'jev_specialist_shadow_policy_v1'
        AND input#>>'{policy,model}' = 'typesafe/jev-1.13'
        AND input->>'contextId' = context_id::text
        AND input->>'contextHash' = context_hash
        AND input->>'baseline' IN ('project_review','document_inventory','document_read')
        AND octet_length(public.agentic_chat_canonical_json_v1(input)) <= 24000
        AND input_hash = public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(input)), false)),
    CONSTRAINT specialist_shadow_result_bounds CHECK (
        (result IS NULL AND result_hash IS NULL AND completed_at IS NULL) OR
        COALESCE(result IS NOT NULL AND completed_at IS NOT NULL AND result_hash IS NOT NULL
        AND jsonb_typeof(result) = 'object'
        AND result->>'version' = 'specialist_shadow_result_v1'
        AND result->>'status' IN ('observed','unavailable')
        AND octet_length(public.agentic_chat_canonical_json_v1(result)) <= 8000
        AND result_hash = public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(result)), false))
);
ALTER TABLE public.chat_turn_specialist_selection_shadows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_turn_specialist_selection_shadows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_turn_specialist_selection_shadows TO service_role;

CREATE FUNCTION public.guard_specialist_selection_shadow_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF (to_jsonb(NEW) - ARRAY['result','result_hash','completed_at']) IS DISTINCT FROM
           (to_jsonb(OLD) - ARRAY['result','result_hash','completed_at'])
           OR OLD.result IS NOT NULL OR NEW.result IS NULL THEN
            RAISE EXCEPTION 'agentic_chat_specialist_shadow_immutable';
        END IF;
    ELSIF NEW.result IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM public.chat_turn_workflow_runs r
        WHERE r.turn_run_id = NEW.turn_run_id AND r.request_hash = NEW.request_hash
          AND r.context_id = NEW.context_id AND r.context_hash = NEW.context_hash
          AND NEW.input->>'baseline' = CASE r.policy_ref
            WHEN 'internal-project-review:v1' THEN 'project_review'
            WHEN 'internal-document-organization:v2' THEN 'document_inventory'
            WHEN 'internal-document-organization:v3' THEN 'document_read' END
    ) THEN
        RAISE EXCEPTION 'agentic_chat_specialist_shadow_binding_invalid';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_specialist_selection_shadow_v1 BEFORE INSERT OR UPDATE
ON public.chat_turn_specialist_selection_shadows FOR EACH ROW
EXECUTE FUNCTION public.guard_specialist_selection_shadow_v1();
REVOKE ALL ON FUNCTION public.guard_specialist_selection_shadow_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_specialist_selection_shadow_v1() TO service_role;

-- The first confirmed claim gets a dispatch permit. Replays never do, even after
-- a lost response or a crash before sending: missing observations are preferable to double spend.
CREATE FUNCTION public.begin_agentic_chat_specialist_shadow_v1(
    p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer,
    p_attempt_token uuid, p_input jsonb, p_input_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
    v_fence text;
    v_run public.chat_turn_workflow_runs%ROWTYPE;
BEGIN
    PERFORM public.agentic_chat_workflow_assert_service_role_v1('specialist_shadow');
    v_fence := public.agentic_chat_workflow_fence_v1('specialist_shadow', p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation);
    IF v_fence <> 'ok' THEN RETURN jsonb_build_object('outcome', v_fence); END IF;
    SELECT * INTO v_run FROM public.chat_turn_workflow_runs WHERE turn_run_id = p_turn_run_id FOR UPDATE;
    IF NOT public.agentic_chat_workflow_project_access_v1(v_run.user_id, v_run.project_id) THEN
        RETURN jsonb_build_object('outcome', 'access_denied');
    END IF;
    IF v_run.deadline_at <= clock_timestamp() + interval '5 seconds' THEN
        RETURN jsonb_build_object('outcome', 'deadline_expired');
    END IF;
    IF v_run.context_id IS NULL OR v_run.phase NOT IN ('assessing','executing','synthesizing') THEN
        RETURN jsonb_build_object('outcome', 'context_required');
    END IF;
    IF EXISTS (SELECT 1 FROM public.chat_turn_specialist_selection_shadows WHERE turn_run_id = p_turn_run_id) THEN
        RETURN jsonb_build_object('outcome', 'already_recorded');
    END IF;
    INSERT INTO public.chat_turn_specialist_selection_shadows
        (turn_run_id, request_hash, context_id, context_hash, execution_generation, attempt_token, input, input_hash)
    VALUES (p_turn_run_id, v_run.request_hash, v_run.context_id, v_run.context_hash, p_execution_generation,
        p_attempt_token, p_input, p_input_hash);
    RETURN jsonb_build_object('outcome', 'started');
END;
$$;
REVOKE ALL ON FUNCTION public.begin_agentic_chat_specialist_shadow_v1(uuid,uuid,uuid,integer,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agentic_chat_specialist_shadow_v1(uuid,uuid,uuid,integer,uuid,jsonb,text) TO service_role;

-- Token settlement may arrive after a generation ends, like dispatch accounting.
-- It only finishes its own audit receipt; it cannot publish chat events or change execution.
CREATE FUNCTION public.finish_agentic_chat_specialist_shadow_v1(
    p_turn_run_id uuid, p_attempt_token uuid, p_result jsonb, p_result_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_row public.chat_turn_specialist_selection_shadows%ROWTYPE;
BEGIN
    PERFORM public.agentic_chat_workflow_assert_service_role_v1('specialist_shadow_finish');
    SELECT * INTO v_row FROM public.chat_turn_specialist_selection_shadows WHERE turn_run_id = p_turn_run_id FOR UPDATE;
    IF NOT FOUND OR v_row.attempt_token IS DISTINCT FROM p_attempt_token THEN
        RETURN jsonb_build_object('outcome', 'stale_attempt');
    END IF;
    IF v_row.result IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', CASE WHEN v_row.result_hash = p_result_hash THEN 'already_recorded' ELSE 'result_conflict' END);
    END IF;
    UPDATE public.chat_turn_specialist_selection_shadows SET result = p_result, result_hash = p_result_hash,
        completed_at = clock_timestamp() WHERE turn_run_id = p_turn_run_id;
    RETURN jsonb_build_object('outcome', 'recorded');
END;
$$;
REVOKE ALL ON FUNCTION public.finish_agentic_chat_specialist_shadow_v1(uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_agentic_chat_specialist_shadow_v1(uuid,uuid,jsonb,text) TO service_role;
