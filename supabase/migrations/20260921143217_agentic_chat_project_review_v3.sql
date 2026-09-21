-- supabase/migrations/20260921143217_agentic_chat_project_review_v3.sql
-- Source-bound reports. Existing policies, claims, budgets and recovery fences remain pinned.
CREATE OR REPLACE FUNCTION public.agentic_chat_workflow_policy_for_ref_v2(p_ref text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
 SELECT CASE
 WHEN p_ref = 'internal-project-review:v3' THEN public.agentic_chat_workflow_policy_v1() || '{"version":"agentic_chat_project_review_policy_v3"}'::jsonb
 WHEN p_ref = 'internal-project-review:v2' THEN public.agentic_chat_workflow_policy_v1() || '{"version":"agentic_chat_project_review_policy_v2"}'::jsonb
 WHEN p_ref = 'internal-document-organization:v3' THEN public.agentic_chat_workflow_policy_v1() || '{"version":"agentic_chat_document_read_policy_v1","modelTools":"bounded_document_read_v1"}'::jsonb
 WHEN p_ref = 'internal-document-organization:v4' THEN public.agentic_chat_workflow_policy_v1() || '{"version":"agentic_chat_document_evidence_policy_v1","modelTools":"bounded_document_read_v1","maxSpecialistConcurrency":1}'::jsonb
 ELSE public.agentic_chat_workflow_policy_v1() END
$$;

-- Resolve only the projection named by the accepted evidence index, without live reads.
CREATE FUNCTION public.agentic_chat_source_record_v1(p_payload jsonb, p_evidence jsonb, p_source text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_kind text; v_family text; v_rows jsonb; v_record jsonb; v_count integer;
BEGIN
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR p_source IS NULL THEN RETURN NULL; END IF;
 SELECT e->>'kind' INTO v_kind FROM jsonb_array_elements(p_evidence) e WHERE e->>'id'=p_source LIMIT 1;
 v_family := CASE v_kind WHEN 'project' THEN 'project' WHEN 'start_here' THEN 'start_here'
  WHEN 'task' THEN 'tasks' WHEN 'risk' THEN 'risks' WHEN 'document' THEN 'documents'
  WHEN 'goal' THEN 'goals' WHEN 'milestone' THEN 'milestones' WHEN 'plan' THEN 'plans'
  WHEN 'relationship' THEN 'relationships' WHEN 'event' THEN 'events' ELSE NULL END;
 IF v_family IS NULL THEN RETURN NULL; END IF;
 v_rows := p_payload->'data'->v_family;
 IF jsonb_typeof(v_rows)='object' THEN v_rows := jsonb_build_array(v_rows); END IF;
 IF jsonb_typeof(v_rows) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
 SELECT count(*) INTO v_count FROM jsonb_array_elements(v_rows) r WHERE r->>'id'=p_source;
 IF v_count<>1 THEN RETURN NULL; END IF;
 SELECT r INTO v_record FROM jsonb_array_elements(v_rows) r WHERE r->>'id'=p_source;
 RETURN v_record;
END;
$$;
REVOKE ALL ON FUNCTION public.agentic_chat_source_record_v1(jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_source_record_v1(jsonb,jsonb,text) TO service_role;

CREATE FUNCTION public.agentic_chat_source_instant_ms_v1(p_value text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF p_value IS NULL OR p_value !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  OR substring(p_value,12,2)::integer>23 OR substring(p_value,15,2)::integer>59
  OR substring(p_value,18,2)::integer>59 THEN RETURN NULL; END IF;
 IF right(p_value,1)<>'Z' AND (substring(right(p_value,6),2,2)::integer>14
  OR right(p_value,2)::integer>59
  OR (substring(right(p_value,6),2,2)::integer=14 AND right(p_value,2)::integer<>0)) THEN RETURN NULL; END IF;
 RETURN floor(extract(epoch FROM p_value::timestamptz)*1000);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.agentic_chat_source_instant_ms_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_source_instant_ms_v1(text) TO service_role;

CREATE FUNCTION public.agentic_chat_workflow_role_report_valid_v3(
 p_report jsonb, p_role text, p_evidence jsonb, p_payload jsonb, p_context_hash text
)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
 v_compat jsonb; v_claim jsonb; v_record jsonb; v_finding jsonb; v_sources jsonb;
 v_source text; v_value text; v_quote text; v_summary text; v_text text;
 v_index integer:=0; v_position integer; v_count integer; v_overdue integer; v_unknown integer;
 v_snapshot numeric; v_due numeric; v_state text; v_source_index integer;
BEGIN
 IF jsonb_typeof(p_report) IS DISTINCT FROM 'object'
  OR p_report->>'version' IS DISTINCT FROM 'chat_workflow_role_report_v3'
  OR p_report->>'contextHash' IS DISTINCT FROM p_context_hash
  OR p_context_hash IS NULL OR p_context_hash !~ '^[0-9a-f]{64}$'
  OR jsonb_typeof(p_report->'claims') IS DISTINCT FROM 'array'
  OR p_report->'specialist' IS DISTINCT FROM jsonb_build_object('id',p_role,'version',CASE WHEN p_role='project_analyst' THEN 3 ELSE 4 END)
  THEN RETURN false; END IF;
 v_compat := (p_report - ARRAY['claims','contextHash']) || jsonb_build_object(
  'version','chat_workflow_role_report_v2','specialist',jsonb_build_object('id',p_role,'version',CASE WHEN p_role='project_analyst' THEN 2 ELSE 3 END));
 IF NOT public.agentic_chat_workflow_role_report_valid_v2(v_compat,p_role,p_evidence) THEN RETURN false; END IF;
 v_summary := CASE p_report->>'outcome'
  WHEN 'findings' THEN 'Selected source excerpts and calculated facts from the inspected records.'
  WHEN 'no_material_findings' THEN 'The specialist selected no material finding from the inspected records.'
  WHEN 'insufficient_evidence' THEN 'The specialist could not answer from the inspected evidence.'
  WHEN 'needs_clarification' THEN 'The specialist needs the review question clarified.' END;
 IF p_report->>'summary' IS DISTINCT FROM v_summary OR p_report->>'recommendation' IS DISTINCT FROM 'No project changes were made.'
  OR p_report->'risks' IS DISTINCT FROM '[]'::jsonb
  OR p_report->'unknowns' IS DISTINCT FROM (CASE WHEN p_report->>'outcome' IN ('insufficient_evidence','needs_clarification') THEN jsonb_build_array(v_summary) ELSE '[]'::jsonb END)
  OR p_report->'unsupportedReferences' IS DISTINCT FROM '0'::jsonb OR p_report->'unsupportedFindings' IS DISTINCT FROM '0'::jsonb
  OR jsonb_array_length(p_report->'claims')<>jsonb_array_length(p_report->'findings') THEN RETURN false; END IF;
 v_snapshot := public.agentic_chat_source_instant_ms_v1(p_payload->>'loadedAt');
 IF v_snapshot IS NULL THEN RETURN false; END IF;
 FOR v_claim IN SELECT c FROM jsonb_array_elements(p_report->'claims') c LOOP
  IF jsonb_typeof(v_claim) IS DISTINCT FROM 'object' OR v_claim->>'id' IS DISTINCT FROM 'C'||(v_index+1)::text THEN RETURN false; END IF;
  v_finding := p_report->'findings'->v_index;
  IF v_claim->>'kind'='excerpt' THEN
   IF NOT v_claim ?& ARRAY['id','kind','source','field','quote','span'] OR (v_claim-ARRAY['id','kind','source','field','quote','span'])<>'{}'::jsonb
    OR v_claim->>'field' NOT IN ('title','name','description','content','state_key','due_at')
    OR jsonb_typeof(v_claim->'source') IS DISTINCT FROM 'string' OR jsonb_typeof(v_claim->'quote') IS DISTINCT FROM 'string'
    OR char_length(btrim(v_claim->>'quote'))=0 OR char_length(v_claim->>'quote')>240
    OR EXISTS(SELECT 1 FROM generate_series(1,31) code WHERE code NOT IN (9,10,13) AND strpos(v_claim->>'quote',chr(code))>0)
    OR strpos(v_claim->>'quote',chr(127))>0 THEN RETURN false; END IF;
   v_record := public.agentic_chat_source_record_v1(p_payload,p_evidence,v_claim->>'source');
   IF jsonb_typeof(v_record->(v_claim->>'field')) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
   v_value := v_record->>(v_claim->>'field'); v_quote := v_claim->>'quote';
   v_position := strpos(v_value,v_quote);
   IF v_position=0 OR strpos(substring(v_value FROM v_position+1),v_quote)>0
    OR v_claim->'span' IS DISTINCT FROM jsonb_build_object('encoding','unicode_code_points','start',v_position-1,'end',v_position-1+char_length(v_quote)) THEN RETURN false; END IF;
   v_sources := jsonb_build_array(v_claim->>'source'); v_text := v_quote;
  ELSIF v_claim->>'kind'='overdue_tasks' THEN
   IF NOT v_claim ?& ARRAY['id','kind','sources','relation','overdue','unknown'] OR (v_claim-ARRAY['id','kind','sources','relation','overdue','unknown'])<>'{}'::jsonb
    OR jsonb_typeof(v_claim->'sources') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_claim->'relation') IS DISTINCT FROM 'string'
    OR v_claim->>'relation' NOT IN ('count','all','some','none') THEN RETURN false; END IF;
   v_sources := v_claim->'sources'; v_count := jsonb_array_length(v_sources);
   IF v_count NOT BETWEEN 1 AND 32 OR (SELECT count(DISTINCT s) FROM jsonb_array_elements(v_sources) s)<>v_count
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_sources) s WHERE jsonb_typeof(s)<>'string') THEN RETURN false; END IF;
   v_overdue:=0; v_unknown:=0;
   FOR v_source IN SELECT s FROM jsonb_array_elements_text(v_sources) s LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_evidence) e WHERE e->>'id'=v_source AND e->>'kind'='task') THEN RETURN false; END IF;
    v_record:=public.agentic_chat_source_record_v1(p_payload,p_evidence,v_source);
    IF v_record IS NULL THEN RETURN false; END IF;
    v_due:=public.agentic_chat_source_instant_ms_v1(v_record->>'due_at'); v_state:=v_record->>'state_key';
    IF v_due IS NULL OR v_state IS NULL OR v_state NOT IN ('todo','in_progress','blocked','done','cancelled') THEN v_unknown:=v_unknown+1;
    ELSIF v_state IN ('todo','in_progress','blocked') AND v_due<v_snapshot THEN v_overdue:=v_overdue+1; END IF;
   END LOOP;
   IF v_claim->'overdue' IS DISTINCT FROM to_jsonb(v_overdue) OR v_claim->'unknown' IS DISTINCT FROM to_jsonb(v_unknown)
    OR (v_claim->>'relation'='all' AND v_overdue<>v_count)
    OR (v_claim->>'relation'='some' AND v_overdue=0)
    OR (v_claim->>'relation'='none' AND (v_overdue>0 OR v_unknown>0)) THEN RETURN false; END IF;
   v_text:='As of '||(p_payload->>'loadedAt')||': '||v_overdue::text||' of these '||v_count::text||' cited tasks are recorded as unfinished with a due time before the snapshot.'||CASE WHEN v_unknown>0 THEN ' '||v_unknown::text||' could not be assessed.' ELSE '' END;
  ELSE RETURN false; END IF;
  IF v_finding->>'claim' IS DISTINCT FROM v_text OR v_finding->>'basis' IS DISTINCT FROM 'recorded'
   OR jsonb_array_length(v_finding->'evidence')<>least(jsonb_array_length(v_sources),4) THEN RETURN false; END IF;
  FOR v_source_index IN 0..least(jsonb_array_length(v_sources),4)-1 LOOP
   IF v_finding->'evidence'->v_source_index->>'id' IS DISTINCT FROM v_sources->>v_source_index THEN RETURN false; END IF;
  END LOOP;
  v_index:=v_index+1;
 END LOOP;
 IF (SELECT count(DISTINCT c-'id') FROM jsonb_array_elements(p_report->'claims') c)<>jsonb_array_length(p_report->'claims') THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.agentic_chat_workflow_role_report_valid_v3(jsonb,text,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_workflow_role_report_valid_v3(jsonb,text,jsonb,jsonb,text) TO service_role;

-- Preserve the existing fenced transitions; select only the newly admitted validator.
CREATE OR REPLACE FUNCTION public.accept_agentic_chat_workflow_step_result_v1(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_plan_hash text,
	p_step_key text,
	p_step_attempt_id uuid,
	p_quality text,
	p_result jsonb,
	p_result_hash text,
	p_result_bytes integer,
	p_transition_id uuid,
	p_projection jsonb,
	p_event_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_fence text;
	v_run public.chat_turn_workflow_runs%ROWTYPE;
	v_step public.chat_turn_workflow_steps%ROWTYPE;
	v_now timestamptz;
	v_event jsonb;
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('step_result');
	IF p_step_attempt_id IS NULL OR p_transition_id IS NULL
		OR p_step_key IS NULL
		OR p_step_key NOT IN ('planner', 'project_analyst', 'risk_reviewer')
		OR (p_plan_hash IS NOT NULL AND p_plan_hash !~ '^[0-9a-f]{64}$')
		OR (p_step_key <> 'planner' AND p_plan_hash IS NULL)
		OR p_quality IS NULL
		OR p_quality NOT IN ('complete', 'partial')
		OR (p_step_key = 'planner' AND p_quality <> 'complete')
		OR jsonb_typeof(COALESCE(p_result, 'null'::jsonb)) <> 'object'
		OR p_result_hash IS NULL OR p_result_hash !~ '^[0-9a-f]{64}$'
		OR p_result_bytes IS NULL OR p_result_bytes NOT BETWEEN 2 AND 131072
		OR p_result_bytes > octet_length(p_result::text)
		OR octet_length(p_result::text) > 163840 THEN
		RAISE EXCEPTION 'agentic_chat_workflow_step_result_invalid';
	END IF;

	v_fence := public.agentic_chat_workflow_fence_v1(
		'step_result', p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation
	);
	IF v_fence <> 'ok' THEN
		RETURN public.agentic_chat_workflow_fenced_receipt_v1(v_fence, p_turn_run_id, p_execution_generation);
	END IF;

	SELECT runs.* INTO v_run FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = p_turn_run_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_step_result_run_missing';
	END IF;
	SELECT steps.* INTO v_step FROM public.chat_turn_workflow_steps steps
	WHERE steps.turn_run_id = p_turn_run_id
		AND steps.plan_version = public.agentic_chat_workflow_plan_version_for_ref_v1(v_run.policy_ref)
		AND steps.step_key = p_step_key
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_step_result_step_missing';
	END IF;

	IF v_step.status = 'accepted' THEN
		RETURN jsonb_build_object(
			'outcome', CASE WHEN v_step.accepted_attempt_id = p_step_attempt_id
					AND v_step.result_hash = p_result_hash
				THEN 'already_accepted' ELSE 'result_conflict' END,
			'turn_run_id', p_turn_run_id,
			'step_key', p_step_key,
			'accepted_attempt_id', v_step.accepted_attempt_id,
			'result_hash', v_step.result_hash,
			'event', public.agentic_chat_workflow_event_receipt_v1(
				p_turn_run_id, p_execution_generation, p_transition_id
			)
		);
	END IF;
	IF v_step.status <> 'claimed'
		OR v_step.current_attempt_id IS DISTINCT FROM p_step_attempt_id
		OR v_step.current_attempt_generation IS DISTINCT FROM p_execution_generation
		OR p_plan_hash IS DISTINCT FROM v_run.plan_hash THEN
		RETURN jsonb_build_object('outcome', 'stale_claim', 'turn_run_id', p_turn_run_id,
			'step_key', p_step_key, 'status', v_step.status,
			'current_attempt_id', v_step.current_attempt_id);
	END IF;

	IF (p_step_key = 'planner' AND NOT public.agentic_chat_workflow_planner_result_valid_v1(p_result))
		OR (p_step_key <> 'planner' AND NOT CASE WHEN v_run.policy_ref = 'internal-project-review:v3'
			THEN public.agentic_chat_workflow_role_report_valid_v3(p_result, p_step_key, v_run.evidence_versions, v_run.context_payload, v_run.context_hash)
			WHEN v_run.policy_ref = 'internal-project-review:v2'
			THEN public.agentic_chat_workflow_role_report_valid_v2(p_result, p_step_key, v_run.evidence_versions)
			ELSE public.agentic_chat_workflow_role_report_valid_v1(p_result, p_step_key, v_run.evidence_versions) END) THEN
		RAISE EXCEPTION 'agentic_chat_workflow_step_result_unverified';
	END IF;

	v_now := clock_timestamp();
	UPDATE public.chat_turn_workflow_steps steps
	SET status = 'accepted',
		quality = p_quality,
		result = p_result,
		result_hash = p_result_hash,
		result_bytes = p_result_bytes,
		accepted_attempt_id = p_step_attempt_id,
		accepted_at = v_now,
		finished_at = v_now,
		failure_code = NULL
	WHERE steps.turn_run_id = p_turn_run_id
		AND steps.plan_version = v_step.plan_version
		AND steps.step_key = p_step_key
		AND steps.status = 'claimed'
		AND steps.current_attempt_id = p_step_attempt_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_step_result_compare_and_set_lost';
	END IF;

	v_event := public.agentic_chat_workflow_publish_v1(
		p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
		p_transition_id, v_run.phase, p_projection, p_event_payload
	);

	RETURN jsonb_build_object(
		'outcome', 'accepted',
		'turn_run_id', p_turn_run_id,
		'step_key', p_step_key,
		'step_attempt_id', p_step_attempt_id,
		'quality', p_quality,
		'result_hash', p_result_hash,
		'accepted_at', v_now,
		'event', v_event
	);
END;
$$;

-- Bind the richer recipe to the admitted request before persisting it.
CREATE OR REPLACE FUNCTION public.accept_agentic_chat_workflow_context_v1(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_context_id uuid,
	p_request_artifact_id uuid,
	p_request_hash text,
	p_preparation_version text,
	p_context_identity jsonb,
	p_evidence_versions jsonb,
	p_context_payload jsonb,
	p_context_hash text,
	p_context_bytes integer,
	p_transition_id uuid,
	p_projection jsonb,
	p_event_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_fence text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_run public.chat_turn_workflow_runs%ROWTYPE;
	v_now timestamptz;
	v_deadline timestamptz;
	v_event jsonb;
	v_identity_keys constant text[] := ARRAY[
		'userId', 'projectId', 'accessCheckedAt', 'contextLoadedAt', 'cacheRefUsed'
	];
BEGIN
	PERFORM public.agentic_chat_workflow_assert_service_role_v1('context');
	IF p_context_id IS NULL OR p_request_artifact_id IS NULL OR p_transition_id IS NULL
		OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
		OR p_context_hash IS NULL OR p_context_hash !~ '^[0-9a-f]{64}$'
		OR p_preparation_version IS NULL OR char_length(p_preparation_version) NOT BETWEEN 1 AND 128
		OR jsonb_typeof(COALESCE(p_context_payload, 'null'::jsonb)) <> 'object'
		OR p_context_bytes IS NULL OR p_context_bytes NOT BETWEEN 2 AND 262144
		OR p_context_bytes > octet_length(p_context_payload::text)
		OR octet_length(p_context_payload::text) > 327680
		OR jsonb_typeof(COALESCE(p_context_identity, 'null'::jsonb)) <> 'object'
		OR NOT p_context_identity ?& v_identity_keys
		OR (p_context_identity - v_identity_keys) <> '{}'::jsonb
		OR jsonb_typeof(COALESCE(p_evidence_versions, 'null'::jsonb)) <> 'array'
		OR jsonb_array_length(p_evidence_versions) > 256
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(p_evidence_versions) AS evidence(value)
			WHERE jsonb_typeof(evidence.value) <> 'object'
				OR NOT evidence.value ?& ARRAY['kind', 'id', 'version', 'observedAt']
				OR (evidence.value - ARRAY['kind', 'id', 'version', 'observedAt']) <> '{}'::jsonb
				OR jsonb_typeof(evidence.value->'kind') <> 'string'
				OR char_length(evidence.value->>'kind') NOT BETWEEN 1 AND 64
				OR jsonb_typeof(evidence.value->'id') <> 'string'
				OR char_length(evidence.value->>'id') NOT BETWEEN 1 AND 128
				OR jsonb_typeof(evidence.value->'version') <> 'string'
				OR char_length(evidence.value->>'version') NOT BETWEEN 1 AND 128
				OR jsonb_typeof(evidence.value->'observedAt') <> 'string'
		)
		OR (
			SELECT count(*) <> count(DISTINCT evidence.value->>'id')
			FROM jsonb_array_elements(p_evidence_versions) AS evidence(value)
		) THEN
		RAISE EXCEPTION 'agentic_chat_workflow_context_invalid_checkpoint';
	END IF;

	v_fence := public.agentic_chat_workflow_fence_v1(
		'context', p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation
	);
	IF v_fence <> 'ok' THEN
		RETURN public.agentic_chat_workflow_fenced_receipt_v1(v_fence, p_turn_run_id, p_execution_generation);
	END IF;
	SELECT turns.* INTO v_turn FROM public.chat_turn_runs turns WHERE turns.id = p_turn_run_id;

	SELECT runs.*
	INTO v_run
	FROM public.chat_turn_workflow_runs runs
	WHERE runs.turn_run_id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_run.request_artifact_id IS DISTINCT FROM p_request_artifact_id
		OR v_turn.input_artifact_id IS DISTINCT FROM p_request_artifact_id
		OR v_run.request_hash IS DISTINCT FROM p_request_hash THEN
		RAISE EXCEPTION 'agentic_chat_workflow_context_request_mismatch';
	END IF;
	IF p_context_identity->>'userId' IS DISTINCT FROM v_run.user_id::text
		OR p_context_identity->>'projectId' IS DISTINCT FROM v_run.project_id::text THEN
		RAISE EXCEPTION 'agentic_chat_workflow_context_identity_mismatch';
	END IF;

	IF (v_run.policy_ref IN ('internal-project-review:v2','internal-project-review:v3')) IS DISTINCT FROM (p_preparation_version = 'agentic_chat_project_review_preparation_v2' AND p_context_payload->>'version' = 'agentic_chat_project_review_payload_v2') THEN
		RAISE EXCEPTION 'agentic_chat_review_context_version_mismatch';
	END IF;

	IF v_run.context_id IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', CASE
				WHEN v_run.context_id = p_context_id
					AND v_run.context_hash = p_context_hash
					AND v_run.context_bytes = p_context_bytes
					AND v_run.preparation_version = p_preparation_version
				THEN 'already_accepted' ELSE 'context_conflict' END,
			'turn_run_id', v_run.turn_run_id,
			'context_id', v_run.context_id,
			'context_hash', v_run.context_hash,
			'deadline_at', v_run.deadline_at,
			'event', public.agentic_chat_workflow_event_receipt_v1(
				p_turn_run_id, p_execution_generation, p_transition_id
			)
		);
	END IF;

	v_now := clock_timestamp();
	v_deadline := COALESCE(
		v_run.deadline_at,
		v_turn.worker_started_at + make_interval(secs => v_run.whole_run_lifetime_ms / 1000.0)
	);
	IF v_deadline <= v_now THEN
		RETURN jsonb_build_object('outcome', 'deadline_expired', 'turn_run_id', p_turn_run_id,
			'deadline_at', v_deadline);
	END IF;
	IF NOT public.agentic_chat_workflow_project_access_v1(v_run.user_id, v_run.project_id) THEN
		RETURN jsonb_build_object('outcome', 'access_revoked', 'turn_run_id', p_turn_run_id,
			'project_id', v_run.project_id);
	END IF;

	UPDATE public.chat_turn_workflow_runs runs
	SET phase = 'assessing',
		deadline_at = v_deadline,
		context_id = p_context_id,
		preparation_version = p_preparation_version,
		context_identity = p_context_identity,
		evidence_versions = p_evidence_versions,
		context_payload = p_context_payload,
		context_hash = p_context_hash,
		context_bytes = p_context_bytes,
		context_accepted_at = v_now,
		context_accepted_generation = p_execution_generation
	WHERE runs.turn_run_id = p_turn_run_id
		AND runs.context_id IS NULL
		AND runs.phase = 'preparing';
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_workflow_context_compare_and_set_lost';
	END IF;

	INSERT INTO public.chat_turn_workflow_steps (
		turn_run_id, session_id, user_id, plan_version, step_key, capability, depends_on, assignment
	) VALUES (
		p_turn_run_id, v_run.session_id, v_run.user_id, public.agentic_chat_workflow_plan_version_for_ref_v1(v_run.policy_ref),
		'planner', 'plan_review', ARRAY[]::text[], '{}'::jsonb
	);

	v_event := public.agentic_chat_workflow_publish_v1(
		p_turn_run_id, p_queue_job_id, p_processing_token, p_execution_generation,
		p_transition_id, 'assessing', p_projection, p_event_payload
	);

	RETURN jsonb_build_object(
		'outcome', 'accepted',
		'turn_run_id', p_turn_run_id,
		'context_id', p_context_id,
		'context_hash', p_context_hash,
		'deadline_at', v_deadline,
		'accepted_at', v_now,
		'event', v_event
	);
END;
$$;
