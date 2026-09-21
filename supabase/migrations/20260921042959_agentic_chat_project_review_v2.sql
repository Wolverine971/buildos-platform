-- supabase/migrations/20260921042959_agentic_chat_project_review_v2.sql
-- Opt-in project-review recipe and explicit outcomes. Old policies/reports stay frozen.
CREATE OR REPLACE FUNCTION public.agentic_chat_workflow_policy_for_ref_v2(p_ref text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
 SELECT CASE
 WHEN p_ref = 'internal-project-review:v2' THEN public.agentic_chat_workflow_policy_v1() || '{"version":"agentic_chat_project_review_policy_v2"}'::jsonb
 WHEN p_ref = 'internal-document-organization:v3' THEN public.agentic_chat_workflow_policy_v1() || '{"version":"agentic_chat_document_read_policy_v1","modelTools":"bounded_document_read_v1"}'::jsonb
 WHEN p_ref = 'internal-document-organization:v4' THEN public.agentic_chat_workflow_policy_v1() || '{"version":"agentic_chat_document_evidence_policy_v1","modelTools":"bounded_document_read_v1","maxSpecialistConcurrency":1}'::jsonb
 ELSE public.agentic_chat_workflow_policy_v1() END
$$;

-- A single actor-authorized snapshot. This does not widen ordinary-chat context loads.
CREATE FUNCTION public.load_agentic_chat_project_review_evidence_v2(
 p_user_id uuid, p_project_id uuid, p_question text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
 v_base jsonb; v_risks jsonb; v_edges jsonb; v_documents jsonb; v_activity jsonb;
 v_suggestions jsonb; v_start_here jsonb; v_coverage jsonb := '{}'::jsonb;
 v_total bigint; v_key text; v_query tsquery;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('review_evidence');
 IF NOT public.agentic_chat_workflow_project_access_v1(p_user_id, p_project_id) THEN
  RAISE EXCEPTION 'agentic_chat_review_evidence_access_denied' USING ERRCODE = '42501';
 END IF;
 IF p_question IS NULL OR char_length(p_question) NOT BETWEEN 3 AND 6000 OR octet_length(p_question) > 24576 THEN
  RAISE EXCEPTION 'agentic_chat_review_evidence_question_invalid';
 END IF;
 v_base := public.load_fastchat_context('project', p_user_id, p_project_id);
 IF v_base#>>'{project,id}' IS DISTINCT FROM p_project_id::text THEN
  RAISE EXCEPTION 'agentic_chat_review_evidence_project_unavailable';
 END IF;
 v_query := websearch_to_tsquery('english', left(p_question, 1800));

 SELECT coalesce(jsonb_agg(to_jsonb(r) - 'total'), '[]'), coalesce(max(r.total), 0)
 INTO v_risks, v_total FROM (
  SELECT id, title, left(content, 1800) AS content, state_key, impact, probability,
   updated_at, created_at, mitigated_at, count(*) OVER () AS total,
   (char_length(coalesce(content, '')) > 1800) AS content_truncated
  FROM public.onto_risks WHERE project_id = p_project_id AND deleted_at IS NULL AND archived_at IS NULL
  ORDER BY (mitigated_at IS NULL) DESC, CASE impact WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
   updated_at DESC NULLS LAST, id LIMIT 16
 ) r;
 v_coverage := v_coverage || jsonb_build_object('risks', jsonb_build_object('total', v_total));

 SELECT coalesce(jsonb_agg(to_jsonb(e) - 'total'), '[]'), coalesce(max(e.total), 0)
 INTO v_edges, v_total FROM (
  SELECT e.id, e.src_kind, e.src_id, e.rel, e.dst_kind, e.dst_id, e.created_at,
   src.title AS src_title, dst.title AS dst_title, count(*) OVER () AS total
  FROM public.onto_edges e
  LEFT JOIN public.onto_tasks src ON e.src_kind = 'task' AND src.id = e.src_id AND src.project_id = p_project_id AND src.deleted_at IS NULL
  LEFT JOIN public.onto_tasks dst ON e.dst_kind = 'task' AND dst.id = e.dst_id AND dst.project_id = p_project_id AND dst.deleted_at IS NULL
  WHERE e.project_id = p_project_id
  ORDER BY (e.rel IN ('depends_on', 'blocks', 'requires')) DESC, e.created_at DESC, e.id LIMIT 48
 ) e;
 v_coverage := v_coverage || jsonb_build_object('relationships', jsonb_build_object('total', v_total));

 -- Rank across the whole authorized project, not the old 20-document inventory.
 -- Rank saved search vectors; only the four best matches contribute document text.
 SELECT coalesce(jsonb_agg(to_jsonb(d) - 'total' - 'rank'), '[]'), coalesce(max(d.total), 0)
 INTO v_documents, v_total FROM (
  SELECT ranked.id, ranked.title, left(ranked.description, 600) AS description, ranked.state_key,
   ranked.created_at, ranked.updated_at,
   CASE WHEN ranked.rank <= 4 THEN left(ranked.content, 4000) ELSE NULL END AS content,
   CASE WHEN ranked.rank > 4 THEN 'inventory_only' WHEN ranked.content IS NULL OR ranked.content = '' THEN 'empty'
     WHEN char_length(ranked.content) > 4000 THEN 'excerpt' ELSE 'full' END AS content_coverage,
   CASE WHEN ranked.rank <= 4 THEN least(char_length(coalesce(ranked.content, '')), 4000) ELSE 0 END AS included_characters,
   ranked.total, ranked.rank
  FROM (
   SELECT d.*, count(*) OVER () AS total,
    row_number() OVER (ORDER BY coalesce(d.search_vector @@ v_query, false) DESC,
      ts_rank_cd(d.search_vector, v_query) DESC NULLS LAST,
      (d.type_key = 'document.context.project') DESC, d.updated_at DESC, d.id) AS rank
   FROM public.onto_documents d WHERE d.project_id = p_project_id AND d.deleted_at IS NULL AND d.archived_at IS NULL
  ) ranked ORDER BY ranked.rank LIMIT 20
 ) d;
 v_coverage := v_coverage || jsonb_build_object('documents', jsonb_build_object('total', v_total));

 SELECT jsonb_build_object('id', id, 'title', title, 'content', left(content, 4000),
   'updated_at', updated_at, 'content_truncated', char_length(coalesce(content, '')) > 4000)
 INTO v_start_here FROM public.onto_documents
 WHERE project_id = p_project_id AND type_key = 'document.context.project' AND deleted_at IS NULL AND archived_at IS NULL
 ORDER BY created_at ASC, id LIMIT 1;

 SELECT coalesce(jsonb_agg(to_jsonb(a) - 'total'), '[]'), coalesce(max(a.total), 0)
 INTO v_activity, v_total FROM (
  SELECT id, entity_type, entity_id, action, change_source, created_at,
   jsonb_build_object('state_key', before_data->'state_key', 'due_at', before_data->'due_at') AS before_state,
   jsonb_build_object('state_key', after_data->'state_key', 'due_at', after_data->'due_at') AS after_state,
   count(*) OVER () AS total
  FROM public.onto_project_logs WHERE project_id = p_project_id
  ORDER BY created_at DESC, id LIMIT 12
 ) a;
 v_coverage := v_coverage || jsonb_build_object('activity', jsonb_build_object('total', v_total));

 SELECT coalesce(jsonb_agg(to_jsonb(s) - 'total'), '[]'), coalesce(max(s.total), 0)
 INTO v_suggestions, v_total FROM (
  SELECT id, title, status, left(why_now, 600) AS why_now, left(rationale, 1200) AS rationale,
   updated_at, count(*) OVER () AS total, 'prior_recommendation_not_verified_fact'::text AS evidence_kind
  FROM public.project_suggestions WHERE project_id = p_project_id AND status IN ('pending', 'delegated', 'failed')
  ORDER BY updated_at DESC, id LIMIT 8
 ) s;
 v_coverage := v_coverage || jsonb_build_object('prior_suggestions', jsonb_build_object('total', v_total));
 FOREACH v_key IN ARRAY ARRAY['goals', 'milestones', 'plans', 'tasks', 'events'] LOOP
  v_coverage := v_coverage || jsonb_build_object(v_key, jsonb_build_object('total',
   coalesce((v_base->'entity_counts'->>(v_key || '_total'))::bigint, jsonb_array_length(coalesce(v_base->v_key, '[]')))));
 END LOOP;
 RETURN v_base || jsonb_build_object('review_timezone', (SELECT timezone FROM public.users WHERE id = p_user_id),
  'start_here', v_start_here, 'risks', v_risks, 'relationships', v_edges,
  'documents', v_documents, 'activity', v_activity, 'prior_suggestions', v_suggestions,
  'review_coverage', v_coverage, 'context_meta', jsonb_build_object('recipe', 'project_review_v2',
    'document_text_limit', 4, 'document_excerpt_characters', 4000,
    'not_requested', jsonb_build_array('external_calendar', 'comments', 'requirements', 'assets')));
END;
$$;
REVOKE ALL ON FUNCTION public.load_agentic_chat_project_review_evidence_v2(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_agentic_chat_project_review_evidence_v2(uuid,uuid,text) TO service_role;


CREATE FUNCTION public.agentic_chat_workflow_role_report_valid_v2(
	p_report jsonb,
	p_role text,
	p_evidence jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_keys constant text[] := ARRAY[
		'version', 'role', 'summary', 'findings', 'risks', 'unknowns', 'recommendation',
		'unsupportedReferences', 'unsupportedFindings', 'outcome', 'specialist'
	];
BEGIN
	-- Keep malformed scalar/NULL inputs away from jsonb_array_length/elements.
	IF p_role IS NULL OR jsonb_typeof(p_report) IS DISTINCT FROM 'object'
		OR jsonb_typeof(p_report->'findings') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_report->'risks') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_report->'unknowns') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_report->'outcome') IS DISTINCT FROM 'string' THEN
		RETURN false;
	END IF;
	IF jsonb_typeof(COALESCE(p_report, 'null'::jsonb)) <> 'object'
		OR NOT p_report ?& v_keys
		OR (p_report - v_keys) <> '{}'::jsonb
		OR p_report->'version' <> '"chat_workflow_role_report_v2"'::jsonb
		OR p_report->'role' <> to_jsonb(p_role)
		OR p_role NOT IN ('project_analyst', 'risk_reviewer')
		OR p_report->>'outcome' NOT IN ('findings', 'no_material_findings', 'insufficient_evidence', 'needs_clarification')
		OR p_report->'specialist' IS DISTINCT FROM jsonb_build_object('id', p_role, 'version', CASE WHEN p_role = 'project_analyst' THEN 2 ELSE 3 END)
		OR jsonb_typeof(p_report->'summary') <> 'string'
		OR char_length(p_report->>'summary') NOT BETWEEN 1 AND 280
		OR jsonb_typeof(p_report->'recommendation') <> 'string'
		OR char_length(p_report->>'recommendation') NOT BETWEEN 1 AND 480
		OR jsonb_typeof(p_report->'unsupportedReferences') <> 'number'
		OR (p_report->>'unsupportedReferences') !~ '^(0|[1-9][0-9]{0,5})$'
		OR jsonb_typeof(p_report->'unsupportedFindings') <> 'number'
		OR (p_report->>'unsupportedFindings') !~ '^(0|[1-9][0-9]{0,5})$'
		OR jsonb_typeof(p_report->'findings') <> 'array'
		OR jsonb_array_length(p_report->'findings') NOT BETWEEN 0 AND 5
		OR (p_report->>'outcome' = 'findings' AND jsonb_array_length(p_report->'findings') = 0)
		OR (p_report->>'outcome' <> 'findings' AND (jsonb_array_length(p_report->'findings') <> 0 OR jsonb_array_length(p_report->'risks') <> 0))
		OR (p_report->>'outcome' IN ('insufficient_evidence', 'needs_clarification') AND jsonb_array_length(p_report->'unknowns') = 0)
		OR jsonb_typeof(p_report->'risks') <> 'array'
		OR jsonb_array_length(p_report->'risks') > 4
		OR jsonb_typeof(p_report->'unknowns') <> 'array'
		OR jsonb_array_length(p_report->'unknowns') > 4
		OR jsonb_typeof(COALESCE(p_evidence, 'null'::jsonb)) <> 'array' THEN
		RETURN false;
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_report->'findings') AS findings(value)
		WHERE jsonb_typeof(findings.value) <> 'object'
			OR NOT findings.value ?& ARRAY['claim', 'basis', 'evidence']
			OR (findings.value - ARRAY['claim', 'basis', 'evidence']) <> '{}'::jsonb
			OR jsonb_typeof(findings.value->'claim') <> 'string'
			OR char_length(findings.value->>'claim') NOT BETWEEN 1 AND 320
			OR findings.value->'basis' NOT IN ('"recorded"'::jsonb, '"inferred"'::jsonb)
			OR NOT public.agentic_chat_workflow_evidence_refs_valid_v1(
				findings.value->'evidence', 1, p_evidence
			)
	) OR EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_report->'risks') AS risks(value)
		WHERE jsonb_typeof(risks.value) <> 'object'
			OR NOT risks.value ?& ARRAY['risk', 'evidence']
			OR (risks.value - ARRAY['risk', 'evidence']) <> '{}'::jsonb
			OR jsonb_typeof(risks.value->'risk') <> 'string'
			OR char_length(risks.value->>'risk') NOT BETWEEN 1 AND 280
			OR NOT public.agentic_chat_workflow_evidence_refs_valid_v1(
				risks.value->'evidence', 1, p_evidence
			)
	) OR EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_report->'unknowns') AS unknowns(value)
		WHERE jsonb_typeof(unknowns.value) <> 'string'
			OR char_length(unknowns.value #>> '{}') NOT BETWEEN 1 AND 240
	) THEN
		RETURN false;
	END IF;
	RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.agentic_chat_workflow_role_report_valid_v2(jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_workflow_role_report_valid_v2(jsonb,text,jsonb) TO service_role;


-- Preserve the existing step fences; choose a report validator from the admitted policy.
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
		OR (p_step_key <> 'planner' AND NOT CASE WHEN v_run.policy_ref = 'internal-project-review:v2'
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

	IF (v_run.policy_ref = 'internal-project-review:v2') IS DISTINCT FROM (p_preparation_version = 'agentic_chat_project_review_preparation_v2' AND p_context_payload->>'version' = 'agentic_chat_project_review_payload_v2') THEN
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
