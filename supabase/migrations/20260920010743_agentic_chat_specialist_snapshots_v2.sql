-- supabase/migrations/20260920010743_agentic_chat_specialist_snapshots_v2.sql
-- Private, immutable specialist selection pinned at admission. The existing v1
-- execution graph remains frozen; this v2 profile binds definitions to its slots.
CREATE TABLE public.chat_turn_specialist_snapshots (
    turn_run_id uuid PRIMARY KEY REFERENCES public.chat_turn_workflow_runs(turn_run_id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    request_hash text NOT NULL,
    snapshot jsonb NOT NULL,
    snapshot_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT specialist_snapshot_bounds CHECK (COALESCE((
        jsonb_typeof(snapshot) = 'object'
        AND octet_length(public.agentic_chat_canonical_json_v1(snapshot)) <= 65536
        AND snapshot_hash = public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(snapshot))
        AND snapshot->>'version' = 'agentic_chat_specialist_snapshot_v2'
        AND snapshot->>'profileId' = 'document_organization'
        AND snapshot->>'profileVersion' = '1'
        AND snapshot->>'engineVersion' = 'agentic_chat_workflow_v1'
    ), false))
);
ALTER TABLE public.chat_turn_specialist_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_turn_specialist_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_turn_specialist_snapshots TO service_role;

CREATE FUNCTION public.guard_agentic_chat_specialist_snapshot_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'agentic_chat_specialist_snapshot_immutable';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.chat_turn_workflow_runs r
        WHERE r.turn_run_id = NEW.turn_run_id AND r.user_id = NEW.user_id
          AND r.session_id = NEW.session_id AND r.project_id = NEW.project_id
          AND r.request_hash = NEW.request_hash
          AND r.policy_ref = 'internal-document-organization:v2'
    ) THEN
        RAISE EXCEPTION 'agentic_chat_specialist_snapshot_binding_invalid';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_agentic_chat_specialist_snapshot_v2
BEFORE INSERT OR UPDATE ON public.chat_turn_specialist_snapshots
FOR EACH ROW EXECUTE FUNCTION public.guard_agentic_chat_specialist_snapshot_v2();
REVOKE ALL ON FUNCTION public.guard_agentic_chat_specialist_snapshot_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_agentic_chat_specialist_snapshot_v2() TO service_role;

CREATE FUNCTION public.create_agentic_chat_document_review_turn_v2(
    p_user_id uuid, p_session_id uuid, p_turn_run_id uuid,
    p_user_message_id uuid, p_request_artifact_id uuid,
    p_stream_run_id text, p_client_turn_id text, p_transport_decision_id uuid,
    p_correlation_id uuid, p_project_id uuid, p_message text,
    p_review_intent jsonb, p_policy jsonb, p_policy_ref text, p_request_hash text,
    p_specialist_snapshot jsonb, p_specialist_snapshot_hash text,
    p_cache_ref jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
    v_receipt jsonb;
BEGIN
    PERFORM public.agentic_chat_workflow_assert_service_role_v1('specialist_admission');
    IF p_policy_ref IS DISTINCT FROM 'internal-document-organization:v2'
       OR p_specialist_snapshot IS NULL OR p_specialist_snapshot_hash IS NULL
       OR p_specialist_snapshot->>'version' IS DISTINCT FROM 'agentic_chat_specialist_snapshot_v2'
       OR p_specialist_snapshot->>'profileId' IS DISTINCT FROM 'document_organization'
       OR p_specialist_snapshot->>'profileVersion' IS DISTINCT FROM '1'
       OR p_specialist_snapshot->>'engineVersion' IS DISTINCT FROM 'agentic_chat_workflow_v1'
       OR p_specialist_snapshot#>>'{slots,project_analyst,definition,id}' IS DISTINCT FROM 'document_organizer'
       OR p_specialist_snapshot#>>'{slots,risk_reviewer,definition,id}' IS DISTINCT FROM 'risk_reviewer'
       OR octet_length(public.agentic_chat_canonical_json_v1(p_specialist_snapshot)) > 65536
       OR public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(p_specialist_snapshot)) IS DISTINCT FROM p_specialist_snapshot_hash THEN
        RAISE EXCEPTION 'agentic_chat_specialist_snapshot_invalid';
    END IF;
    v_receipt := public.create_agentic_chat_workflow_turn_with_job_v1(
        p_user_id, p_session_id, p_turn_run_id, p_user_message_id, p_request_artifact_id,
        p_stream_run_id, p_client_turn_id, p_transport_decision_id, p_correlation_id,
        p_project_id, p_message, p_review_intent, p_policy, p_policy_ref, p_request_hash, p_cache_ref
    );
    IF v_receipt->>'outcome' = 'newly_admitted' THEN
        INSERT INTO public.chat_turn_specialist_snapshots
            (turn_run_id, user_id, session_id, project_id, request_hash, snapshot, snapshot_hash)
        SELECT turn_run_id, user_id, session_id, project_id, request_hash,
            p_specialist_snapshot, p_specialist_snapshot_hash
        FROM public.chat_turn_workflow_runs WHERE turn_run_id = (v_receipt->>'turn_run_id')::uuid;
    ELSIF v_receipt->>'outcome' = 'matching_duplicate' THEN
        -- A retry preserves the original selection even after a registry deployment.
        IF NOT EXISTS (SELECT 1 FROM public.chat_turn_specialist_snapshots
            WHERE turn_run_id = (v_receipt->>'turn_run_id')::uuid) THEN
            RAISE EXCEPTION 'agentic_chat_specialist_snapshot_missing';
        END IF;
    END IF;
    RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.create_agentic_chat_document_review_turn_v2(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,jsonb,jsonb,text,text,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_agentic_chat_document_review_turn_v2(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,jsonb,jsonb,text,text,jsonb,text,jsonb) TO service_role;
