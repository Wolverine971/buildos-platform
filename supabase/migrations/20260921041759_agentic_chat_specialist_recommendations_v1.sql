-- supabase/migrations/20260921041759_agentic_chat_specialist_recommendations_v1.sql
-- A recommendation is a paid, at-most-once checkpoint before explicit workflow admission.
-- The catalog roster, question, policy and result are frozen; retries only read this row.
CREATE TABLE public.agentic_chat_specialist_recommendations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 project_id uuid NOT NULL,
 question text NOT NULL,
 input jsonb NOT NULL,
 input_hash text NOT NULL,
 attempt_token uuid NOT NULL,
 result jsonb,
 result_hash text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
 CONSTRAINT specialist_recommendation_input CHECK (COALESCE(
  input->>'version' = 'specialist_recommendation_input_v1'
  AND input->>'policy' = 'jev_specialist_choice_v1'
  AND input->>'projectId' = project_id::text
  AND input->>'question' = question
  AND jsonb_typeof(input->'candidates') = 'array'
  AND jsonb_array_length(input->'candidates') <= 20
  AND octet_length(public.agentic_chat_canonical_json_v1(input)) <= 65536
  AND input_hash = public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(input)), false)),
 CONSTRAINT specialist_recommendation_result CHECK (COALESCE(
  (result IS NULL AND result_hash IS NULL AND finished_at IS NULL)
  OR (result IS NOT NULL AND result_hash = public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(result))
   AND result->>'status' IN ('selected','uncertain','unavailable')
   AND jsonb_typeof(result->'ranking') = 'array'
   AND octet_length(public.agentic_chat_canonical_json_v1(result)) <= 16384
   AND finished_at IS NOT NULL), false)),
 CONSTRAINT specialist_recommendation_lifetime CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);
CREATE INDEX idx_specialist_recommendations_owner_day
 ON public.agentic_chat_specialist_recommendations(user_id, created_at DESC);
ALTER TABLE public.agentic_chat_specialist_recommendations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agentic_chat_specialist_recommendations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.agentic_chat_specialist_recommendations TO service_role;

CREATE FUNCTION public.guard_specialist_recommendation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF OLD.result IS NOT NULL OR ROW(NEW.id,NEW.user_id,NEW.project_id,NEW.question,NEW.input,NEW.input_hash,
    NEW.attempt_token,NEW.created_at,NEW.expires_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.project_id,OLD.question,OLD.input,OLD.input_hash,
    OLD.attempt_token,OLD.created_at,OLD.expires_at) THEN
   RAISE EXCEPTION 'specialist_recommendation_immutable';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_specialist_recommendation_v1 BEFORE UPDATE
 ON public.agentic_chat_specialist_recommendations FOR EACH ROW EXECUTE FUNCTION public.guard_specialist_recommendation_v1();

CREATE FUNCTION public.begin_specialist_recommendation_v1(
 p_user_id uuid, p_project_id uuid, p_id uuid, p_question text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
 v_row public.agentic_chat_specialist_recommendations%ROWTYPE;
 v_candidates jsonb;
 v_input jsonb;
 v_start timestamptz;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('specialist_recommendation_begin');
 IF p_user_id IS NULL OR p_project_id IS NULL OR p_id IS NULL OR p_question IS NULL
  OR p_question <> public.agentic_chat_normalize_text_v1(p_question)
  OR char_length(p_question) NOT BETWEEN 3 AND 6000 OR octet_length(p_question) > 24576 THEN
  RETURN jsonb_build_object('outcome','invalid_request');
 END IF;
 IF NOT public.agentic_chat_workflow_project_access_v1(p_user_id,p_project_id) THEN
  RETURN jsonb_build_object('outcome','access_denied');
 END IF;
 -- Serialize quota and duplicate checks across concurrent requests from this account.
 PERFORM pg_advisory_xact_lock(hashtextextended('specialist-recommendation:' || p_user_id::text, 0));
 SELECT * INTO v_row FROM public.agentic_chat_specialist_recommendations WHERE id = p_id FOR UPDATE;
 IF FOUND THEN
  IF v_row.user_id <> p_user_id OR v_row.project_id <> p_project_id OR v_row.question <> p_question THEN
   RETURN jsonb_build_object('outcome','idempotency_conflict');
  END IF;
  IF v_row.result IS NOT NULL THEN
   RETURN jsonb_build_object('outcome','recorded','receipt',jsonb_build_object(
    'id',v_row.id,'input',v_row.input,'inputHash',v_row.input_hash,
    'result',v_row.result,'resultHash',v_row.result_hash));
  END IF;
  RETURN jsonb_build_object('outcome','pending');
 END IF;
 v_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF (SELECT count(*) FROM public.agentic_chat_specialist_recommendations
     WHERE user_id = p_user_id AND created_at >= v_start AND created_at < v_start + interval '1 day') >= 20 THEN
  RETURN jsonb_build_object('outcome','quota_reached');
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'draftId',latest.draft_id,'version',latest.version,'draftRevision',latest.draft_revision,
   'snapshotHash',latest.snapshot_hash,'name',latest.name,'createdAt',latest.created_at,
   'description',latest.snapshot#>>'{definition,description}',
   'expertise',latest.snapshot#>'{definition,expertise}',
   'documentReadEnabled',latest.snapshot#>'{definition,capabilities,allowedToolIds}' @> '["read_project_documents"]'::jsonb
  ) ORDER BY latest.name,latest.draft_id), '[]'::jsonb)
 INTO v_candidates
 FROM (
  SELECT DISTINCT ON (v.draft_id) v.draft_id,v.version,v.draft_revision,v.snapshot_hash,
   v.name,v.created_at,v.snapshot
  FROM public.agentic_chat_specialist_versions v
  WHERE v.user_id = p_user_id
  ORDER BY v.draft_id,v.version DESC
  LIMIT 20
 ) latest;
 v_input := jsonb_build_object('version','specialist_recommendation_input_v1',
  'policy','jev_specialist_choice_v1','projectId',p_project_id,'question',p_question,
  'candidates',v_candidates);
 INSERT INTO public.agentic_chat_specialist_recommendations
  (id,user_id,project_id,question,input,input_hash,attempt_token)
 VALUES (p_id,p_user_id,p_project_id,p_question,v_input,
  public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(v_input)),gen_random_uuid())
 RETURNING * INTO v_row;
 RETURN jsonb_build_object('outcome','claimed','receipt',jsonb_build_object(
  'id',v_row.id,'input',v_row.input,'inputHash',v_row.input_hash),'attemptToken',v_row.attempt_token);
END;
$$;

CREATE FUNCTION public.finish_specialist_recommendation_v1(
 p_user_id uuid, p_id uuid, p_input_hash text, p_attempt_token uuid, p_result jsonb, p_result_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_row public.agentic_chat_specialist_recommendations%ROWTYPE;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('specialist_recommendation_finish');
 SELECT * INTO v_row FROM public.agentic_chat_specialist_recommendations
  WHERE id = p_id AND user_id = p_user_id FOR UPDATE;
 IF NOT FOUND OR v_row.input_hash IS DISTINCT FROM p_input_hash OR v_row.attempt_token IS DISTINCT FROM p_attempt_token
  THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 IF v_row.result IS NOT NULL THEN
  RETURN jsonb_build_object('outcome',CASE WHEN v_row.result_hash = p_result_hash THEN 'recorded' ELSE 'idempotency_conflict' END,
   'receipt',jsonb_build_object('id',v_row.id,'input',v_row.input,'inputHash',v_row.input_hash,
    'result',v_row.result,'resultHash',v_row.result_hash));
 END IF;
 IF p_result IS NULL OR p_result_hash IS DISTINCT FROM public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(p_result))
  OR p_result->>'status' NOT IN ('selected','uncertain','unavailable')
  OR jsonb_typeof(p_result->'ranking') IS DISTINCT FROM 'array'
  OR octet_length(public.agentic_chat_canonical_json_v1(p_result)) > 16384
  OR (p_result->>'status' = 'selected' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_row.input->'candidates') c WHERE c = p_result->'selected'))
  OR (p_result->>'status' <> 'selected' AND p_result->'selected' IS DISTINCT FROM 'null'::jsonb)
  THEN RETURN jsonb_build_object('outcome','invalid_result'); END IF;
 UPDATE public.agentic_chat_specialist_recommendations SET
  result = p_result,result_hash = p_result_hash,finished_at = clock_timestamp()
  WHERE id = p_id RETURNING * INTO v_row;
 RETURN jsonb_build_object('outcome','recorded','receipt',jsonb_build_object(
  'id',v_row.id,'input',v_row.input,'inputHash',v_row.input_hash,
  'result',v_row.result,'resultHash',v_row.result_hash));
END;
$$;

CREATE FUNCTION public.get_specialist_recommendation_v1(
 p_user_id uuid, p_project_id uuid, p_id uuid, p_question text,
 p_draft_id uuid, p_version integer, p_snapshot_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_row public.agentic_chat_specialist_recommendations%ROWTYPE;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('specialist_recommendation_get');
 IF NOT public.agentic_chat_workflow_project_access_v1(p_user_id,p_project_id) THEN
  RETURN jsonb_build_object('outcome','not_found');
 END IF;
 SELECT * INTO v_row FROM public.agentic_chat_specialist_recommendations
  WHERE id = p_id AND user_id = p_user_id AND project_id = p_project_id
   AND question = p_question AND expires_at > now() AND result->>'status' = 'selected'
   AND result#>>'{selected,draftId}' = p_draft_id::text
   AND result#>>'{selected,version}' = p_version::text
   AND result#>>'{selected,snapshotHash}' = p_snapshot_hash
   AND EXISTS (
    SELECT 1 FROM public.agentic_chat_specialist_versions v
    WHERE v.user_id = p_user_id AND v.draft_id = p_draft_id AND v.version = p_version
     AND v.snapshot_hash = p_snapshot_hash
   );
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','not_found'); END IF;
 RETURN jsonb_build_object('outcome','selected','receipt',jsonb_build_object(
  'id',v_row.id,'input',v_row.input,'inputHash',v_row.input_hash,
  'result',v_row.result,'resultHash',v_row.result_hash));
END;
$$;

-- Optional provenance is copied into an admitted run and checked against the ledger.
-- Manual specialist choice remains valid without a recommendation.
CREATE FUNCTION public.guard_specialist_recommendation_snapshot_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NEW.snapshot ? 'recommendation' THEN
  IF NEW.snapshot->>'version' IS DISTINCT FROM 'agentic_chat_specialist_snapshot_v3'
   OR NOT EXISTS (
    SELECT 1 FROM public.agentic_chat_specialist_recommendations d
    JOIN public.chat_turn_workflow_runs r ON r.turn_run_id = NEW.turn_run_id
    JOIN public.chat_turn_input_artifacts a ON a.id = r.request_artifact_id
    WHERE d.id::text = NEW.snapshot#>>'{recommendation,id}'
     AND d.user_id = NEW.user_id AND d.project_id = NEW.project_id
     AND d.result IS NOT NULL AND d.expires_at > now()
     AND d.question = a.request->>'message'
     AND d.input_hash = NEW.snapshot#>>'{recommendation,inputHash}'
     AND d.result_hash = NEW.snapshot#>>'{recommendation,resultHash}'
     AND d.input = NEW.snapshot#>'{recommendation,input}'
     AND d.result = NEW.snapshot#>'{recommendation,result}'
     AND d.result->>'status' = 'selected'
     AND d.result#>>'{selected,draftId}' = NEW.snapshot#>>'{published,snapshot,draftId}'
     AND d.result#>>'{selected,version}' = NEW.snapshot#>>'{published,snapshot,definition,version}'
     AND d.result#>>'{selected,snapshotHash}' = NEW.snapshot#>>'{published,snapshotHash}'
   ) THEN
   RAISE EXCEPTION 'specialist_recommendation_snapshot_binding_invalid';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_specialist_recommendation_snapshot_v1 BEFORE INSERT
 ON public.chat_turn_specialist_snapshots FOR EACH ROW EXECUTE FUNCTION public.guard_specialist_recommendation_snapshot_v1();

REVOKE ALL ON FUNCTION public.guard_specialist_recommendation_v1(),
 public.begin_specialist_recommendation_v1(uuid,uuid,uuid,text),
 public.finish_specialist_recommendation_v1(uuid,uuid,text,uuid,jsonb,text),
 public.get_specialist_recommendation_v1(uuid,uuid,uuid,text,uuid,integer,text),
 public.guard_specialist_recommendation_snapshot_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_specialist_recommendation_v1(),
 public.begin_specialist_recommendation_v1(uuid,uuid,uuid,text),
 public.finish_specialist_recommendation_v1(uuid,uuid,text,uuid,jsonb,text),
 public.get_specialist_recommendation_v1(uuid,uuid,uuid,text,uuid,integer,text),
 public.guard_specialist_recommendation_snapshot_v1() TO service_role;
