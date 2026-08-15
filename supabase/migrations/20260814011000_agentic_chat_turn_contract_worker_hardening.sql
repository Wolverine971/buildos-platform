-- supabase/migrations/20260814011000_agentic_chat_turn_contract_worker_hardening.sql
-- Harden semantic turn contracts at the worker/database boundary.
--
-- The original migration established the durable contract shape. This
-- follow-up keeps that applied migration immutable while adding:
--   * ordered merge/cancel control semantics;
--   * scope-safe prior-contract carry-forward;
--   * field-aware implicit contracts for failed direct writes;
--   * lifecycle-action evidence checks; and
--   * cumulative required-field evidence per declared target.

BEGIN;

CREATE OR REPLACE FUNCTION public.agentic_chat_normalize_contract_outcome_v1(
	p_raw_outcome jsonb,
	p_fallback_id text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_action text;
	v_entity_kind text;
	v_raw_targets jsonb;
	v_raw_fields jsonb;
	v_targets jsonb;
	v_fields jsonb;
	v_minimum_text text;
	v_minimum integer;
	v_outcome jsonb;
BEGIN
	IF jsonb_typeof(p_raw_outcome) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_outcome';
	END IF;
	v_action := p_raw_outcome->>'action';
	v_entity_kind := COALESCE(
		p_raw_outcome->>'entity_kind',
		p_raw_outcome->>'entityKind'
	);
	IF v_action NOT IN (
		'create', 'update', 'move', 'organize', 'link', 'unlink', 'delete',
		'schedule', 'set', 'assign', 'complete', 'archive', 'restore', 'tag'
	) OR v_entity_kind NOT IN (
		'project', 'task', 'document', 'event', 'goal', 'plan', 'milestone',
		'risk', 'relationship', 'calendar', 'entity'
	) THEN
		RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_outcome';
	END IF;

	v_raw_targets := COALESCE(
		p_raw_outcome->'target_ids',
		p_raw_outcome->'targetIds',
		'[]'::jsonb
	);
	v_raw_fields := COALESCE(
		p_raw_outcome->'required_fields',
		p_raw_outcome->'requiredFields',
		'[]'::jsonb
	);
	IF jsonb_typeof(v_raw_targets) <> 'array'
		OR jsonb_typeof(v_raw_fields) <> 'array'
		OR jsonb_array_length(v_raw_targets) > 50
		OR jsonb_array_length(v_raw_fields) > 30
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_raw_targets) item
			WHERE jsonb_typeof(item) <> 'string' OR btrim(item #>> '{}') = ''
		)
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_raw_fields) item
			WHERE jsonb_typeof(item) <> 'string' OR btrim(item #>> '{}') = ''
		) THEN
		RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_outcome';
	END IF;

	SELECT COALESCE(jsonb_agg(to_jsonb(value) ORDER BY first_ordinality), '[]'::jsonb)
	INTO v_targets
	FROM (
		SELECT btrim(item #>> '{}') AS value, min(ordinality) AS first_ordinality
		FROM jsonb_array_elements(v_raw_targets) WITH ORDINALITY values_with_order(item, ordinality)
		GROUP BY btrim(item #>> '{}')
	) normalized_targets;
	SELECT COALESCE(jsonb_agg(to_jsonb(value) ORDER BY first_ordinality), '[]'::jsonb)
	INTO v_fields
	FROM (
		SELECT lower(btrim(item #>> '{}')) AS value, min(ordinality) AS first_ordinality
		FROM jsonb_array_elements(v_raw_fields) WITH ORDINALITY values_with_order(item, ordinality)
		GROUP BY lower(btrim(item #>> '{}'))
	) normalized_fields;

	v_minimum_text := COALESCE(
		p_raw_outcome->>'minimum_successful_effects',
		p_raw_outcome->>'minimumSuccessfulEffects'
	);
	IF v_minimum_text IS NULL THEN
		v_minimum := GREATEST(1, jsonb_array_length(v_targets));
	ELSIF v_minimum_text !~ '^[1-9][0-9]{0,2}$' THEN
		RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_outcome';
	ELSE
		v_minimum := v_minimum_text::integer;
	END IF;
	IF v_minimum NOT BETWEEN 1 AND 100 THEN
		RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_outcome';
	END IF;
	v_minimum := GREATEST(v_minimum, jsonb_array_length(v_targets));

	v_outcome := jsonb_build_object(
		'id', COALESCE(NULLIF(btrim(p_raw_outcome->>'id'), ''), p_fallback_id),
		'action', v_action,
		'entityKind', v_entity_kind,
		'targetIds', v_targets,
		'requiredFields', v_fields,
		'minimumSuccessfulEffects', v_minimum
	);
	IF NULLIF(btrim(p_raw_outcome->>'description'), '') IS NOT NULL THEN
		v_outcome := v_outcome || jsonb_build_object(
			'description', left(btrim(p_raw_outcome->>'description'), 240)
		);
	END IF;
	RETURN v_outcome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_contract_argument_fields_v1(
	p_arguments jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
	SELECT COALESCE(jsonb_agg(to_jsonb(argument_key) ORDER BY argument_key), '[]'::jsonb)
	FROM jsonb_object_keys(COALESCE(p_arguments, '{}'::jsonb)) argument_key
	WHERE argument_key NOT IN (
		'project_id', 'task_id', 'document_id', 'event_id', 'goal_id',
		'plan_id', 'milestone_id', 'risk_id', 'edge_id', 'entity_id',
		'new_parent_id', 'parent_id', 'expected_source_project_id',
		'destination_project_id', 'confirmation_token', 'update_strategy',
		'confirm', 'idempotency_key'
	);
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_contract_effect_matches_v1(
	p_expected_action text,
	p_expected_entity_kind text,
	p_tool_name text,
	p_arguments jsonb,
	p_result jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_semantics jsonb := public.agentic_chat_contract_tool_semantics_v1(p_tool_name);
	v_actual_action text;
	v_actual_entity_kind text;
	v_result_payload jsonb := COALESCE(p_result->'result', p_result, '{}'::jsonb);
	v_state_key text;
BEGIN
	IF v_semantics IS NULL THEN RETURN false; END IF;
	v_actual_action := v_semantics->>'action';
	v_actual_entity_kind := v_semantics->>'entityKind';
	IF p_expected_entity_kind <> 'entity'
		AND p_expected_entity_kind <> v_actual_entity_kind THEN
		RETURN false;
	END IF;
	IF p_expected_action = v_actual_action THEN RETURN true; END IF;
	IF p_expected_action = 'organize' THEN
		RETURN v_actual_action IN ('move', 'organize');
	END IF;
	IF p_expected_action = 'schedule' THEN
		RETURN v_actual_action IN ('create', 'update', 'set');
	END IF;
	IF v_actual_action <> 'update' THEN RETURN false; END IF;
	IF p_expected_action = 'assign' THEN
		RETURN p_arguments ?| ARRAY['assignee_actor_ids', 'assignee_handles'];
	END IF;
	v_state_key := COALESCE(
		v_result_payload->v_actual_entity_kind->>'state_key',
		v_result_payload->>'state_key',
		p_arguments->>'state_key'
	);
	IF p_expected_action = 'complete' THEN
		RETURN v_state_key IN ('done', 'completed');
	END IF;
	IF p_expected_action = 'archive' THEN
		RETURN v_state_key IN ('archived', 'cancelled');
	END IF;
	IF p_expected_action = 'restore' THEN
		RETURN v_state_key IS NOT NULL AND v_state_key NOT IN ('archived', 'cancelled');
	END IF;
	RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_session public.chat_sessions%ROWTYPE;
	v_execution record;
	v_raw_outcome jsonb;
	v_outcome jsonb;
	v_existing_pending jsonb;
	v_outcomes jsonb := '[]'::jsonb;
	v_unfinished jsonb := '[]'::jsonb;
	v_semantics jsonb;
	v_target_id text;
	v_fields jsonb;
	v_candidate jsonb;
	v_candidates jsonb;
	v_target jsonb;
	v_required_field jsonb;
	v_target_fields jsonb;
	v_effect_key text;
	v_matched_effects jsonb;
	v_match_count integer;
	v_required_count integer;
	v_fulfilled boolean;
	v_target_complete boolean;
	v_outcome_matched boolean;
	v_last_cancel_sequence integer := -2147483648;
	v_observed_contract_state boolean := false;
	v_existing_contract_valid boolean := true;
	v_pending_contract jsonb := 'null'::jsonb;
	v_contract jsonb;
	v_now timestamptz;
	v_created_at text;
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status <> 'completed'
		OR OLD.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN NEW;
	END IF;

	SELECT sessions.*
	INTO v_session
	FROM public.chat_sessions sessions
	WHERE sessions.id = NEW.session_id
	FOR UPDATE;
	IF NOT FOUND OR v_session.user_id IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'agentic_chat_terminal_session_metadata_scope_mismatch';
	END IF;
	v_existing_pending := v_session.agent_metadata->'fastchat_pending_turn_contract';
	v_observed_contract_state := jsonb_typeof(v_existing_pending) = 'object';

	-- Only carry a prior commission into the same context/project. A context
	-- shift must never revive a write against the previous project.
	IF jsonb_typeof(v_existing_pending->'contract'->'outcomes') = 'array'
		AND COALESCE(v_existing_pending->>'contextType', v_existing_pending->>'context_type') = NEW.context_type
		AND COALESCE(v_existing_pending->>'projectId', v_existing_pending->>'project_id')
			IS NOT DISTINCT FROM NEW.project_id::text THEN
		v_observed_contract_state := true;
		FOR v_raw_outcome IN
			SELECT value FROM jsonb_array_elements(v_existing_pending->'contract'->'outcomes')
		LOOP
			BEGIN
				v_outcome := public.agentic_chat_normalize_contract_outcome_v1(
					v_raw_outcome,
					'prior_' || (jsonb_array_length(v_outcomes) + 1)::text
				);
			EXCEPTION WHEN OTHERS THEN
				v_existing_contract_valid := false;
				v_outcomes := '[]'::jsonb;
				EXIT;
			END;
			v_outcomes := v_outcomes || jsonb_build_array(v_outcome);
		END LOOP;
	END IF;
	IF NOT v_existing_contract_valid THEN
		v_existing_pending := NULL;
	END IF;

	-- Apply successful control calls in execution order. Cancellation clears all
	-- obligations before it; a later declaration starts a new commission.
	FOR v_execution IN
		SELECT executions.*
		FROM public.chat_tool_executions executions
		WHERE executions.turn_run_id = NEW.id
			AND executions.session_id = NEW.session_id
			AND executions.success = true
			AND executions.tool_name IN ('declare_turn_contract', 'cancel_turn_contract')
		ORDER BY executions.sequence_index, executions.id
	LOOP
		v_observed_contract_state := true;
		IF v_execution.tool_name = 'cancel_turn_contract' THEN
			IF NULLIF(btrim(v_execution.arguments->>'reason'), '') IS NULL THEN
				RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_cancellation';
			END IF;
			v_outcomes := '[]'::jsonb;
			v_last_cancel_sequence := v_execution.sequence_index;
			CONTINUE;
		END IF;
		IF jsonb_typeof(v_execution.arguments->'outcomes') <> 'array'
			OR jsonb_array_length(v_execution.arguments->'outcomes') NOT BETWEEN 1 AND 20 THEN
			RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_declaration';
		END IF;
		FOR v_raw_outcome IN
			SELECT value FROM jsonb_array_elements(v_execution.arguments->'outcomes')
		LOOP
			v_outcome := public.agentic_chat_normalize_contract_outcome_v1(
				v_raw_outcome,
				'outcome_' || (jsonb_array_length(v_outcomes) + 1)::text
			);
			IF NOT EXISTS (
				SELECT 1
				FROM jsonb_array_elements(v_outcomes) existing
				WHERE existing - 'id' - 'description' = v_outcome - 'id' - 'description'
			) THEN
				v_outcomes := v_outcomes || jsonb_build_array(v_outcome);
			END IF;
		END LOOP;
	END LOOP;

	-- Failed direct writes are durable evidence of an unfinished commission.
	-- Preserve their requested fields, and add them even when an unrelated prior
	-- contract exists. A failed call already covered by a declaration is evidence
	-- for that declaration rather than a duplicate obligation.
	FOR v_execution IN
		SELECT executions.*
		FROM public.chat_tool_executions executions
		WHERE executions.turn_run_id = NEW.id
			AND executions.session_id = NEW.session_id
			AND executions.success = false
			AND executions.sequence_index > v_last_cancel_sequence
		ORDER BY executions.sequence_index, executions.id
	LOOP
		v_semantics := public.agentic_chat_contract_tool_semantics_v1(v_execution.tool_name);
		IF v_semantics IS NULL THEN CONTINUE; END IF;
		v_observed_contract_state := true;
		v_target_id := public.agentic_chat_contract_effect_target_id_v1(
			v_execution.tool_name,
			v_execution.arguments,
			v_execution.result
		);
		v_outcome_matched := false;
		FOR v_outcome IN SELECT value FROM jsonb_array_elements(v_outcomes)
		LOOP
			IF public.agentic_chat_contract_effect_matches_v1(
				v_outcome->>'action',
				v_outcome->>'entityKind',
				v_execution.tool_name,
				v_execution.arguments,
				v_execution.result
			) AND (
				jsonb_array_length(v_outcome->'targetIds') = 0
				OR (v_target_id IS NOT NULL AND v_outcome->'targetIds' @> jsonb_build_array(v_target_id))
			) THEN
				v_outcome_matched := true;
				EXIT;
			END IF;
		END LOOP;
		IF v_outcome_matched THEN CONTINUE; END IF;
		v_fields := public.agentic_chat_contract_argument_fields_v1(v_execution.arguments);
		v_outcome := jsonb_build_object(
			'id', 'implicit_' || v_execution.sequence_index::text,
			'action', v_semantics->>'action',
			'entityKind', v_semantics->>'entityKind',
			'targetIds', CASE
				WHEN v_target_id IS NULL THEN '[]'::jsonb
				ELSE jsonb_build_array(v_target_id)
			END,
			'requiredFields', v_fields,
			'minimumSuccessfulEffects', 1
		);
		IF NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_outcomes) existing
			WHERE existing - 'id' - 'description' = v_outcome - 'id' - 'description'
		) THEN
			v_outcomes := v_outcomes || jsonb_build_array(v_outcome);
		END IF;
	END LOOP;

	IF jsonb_array_length(v_outcomes) > 0 THEN
		FOR v_outcome IN SELECT value FROM jsonb_array_elements(v_outcomes)
		LOOP
			v_required_count := GREATEST(
				1,
				COALESCE((v_outcome->>'minimumSuccessfulEffects')::integer, 1)
			);
			v_candidates := '[]'::jsonb;
			FOR v_execution IN
				SELECT executions.*
				FROM public.chat_tool_executions executions
				WHERE executions.turn_run_id = NEW.id
					AND executions.session_id = NEW.session_id
					AND executions.success = true
					AND executions.sequence_index > v_last_cancel_sequence
				ORDER BY executions.sequence_index, executions.id
			LOOP
				IF NOT public.agentic_chat_contract_effect_matches_v1(
					v_outcome->>'action',
					v_outcome->>'entityKind',
					v_execution.tool_name,
					v_execution.arguments,
					v_execution.result
				) THEN
					CONTINUE;
				END IF;
				v_target_id := public.agentic_chat_contract_effect_target_id_v1(
					v_execution.tool_name,
					v_execution.arguments,
					v_execution.result
				);
				v_effect_key := COALESCE(
					v_target_id,
					v_execution.effect_id::text,
					v_execution.id::text
				);
				v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
					'targetId', v_target_id,
					'effectKey', v_effect_key,
					'fields', public.agentic_chat_contract_argument_fields_v1(v_execution.arguments)
				));
			END LOOP;

			v_matched_effects := '[]'::jsonb;
			IF jsonb_array_length(v_outcome->'targetIds') > 0 THEN
				FOR v_target IN SELECT value FROM jsonb_array_elements(v_outcome->'targetIds')
				LOOP
					v_target_fields := '[]'::jsonb;
					v_target_complete := false;
					FOR v_candidate IN SELECT value FROM jsonb_array_elements(v_candidates)
					LOOP
						IF (v_candidate->>'targetId') IS DISTINCT FROM (v_target #>> '{}') THEN
							CONTINUE;
						END IF;
						v_target_complete := true;
						FOR v_required_field IN SELECT value FROM jsonb_array_elements(v_candidate->'fields')
						LOOP
							IF NOT v_target_fields @> jsonb_build_array(v_required_field) THEN
								v_target_fields := v_target_fields || jsonb_build_array(v_required_field);
							END IF;
						END LOOP;
					END LOOP;
					IF v_target_complete THEN
						FOR v_required_field IN SELECT value FROM jsonb_array_elements(v_outcome->'requiredFields')
						LOOP
							IF NOT v_target_fields @> jsonb_build_array(v_required_field) THEN
								v_target_complete := false;
								EXIT;
							END IF;
						END LOOP;
					END IF;
					IF v_target_complete THEN
						v_matched_effects := v_matched_effects || jsonb_build_array(v_target);
					END IF;
				END LOOP;
				v_match_count := jsonb_array_length(v_matched_effects);
				v_fulfilled := v_match_count = jsonb_array_length(v_outcome->'targetIds')
					AND v_match_count >= v_required_count;
			ELSE
				FOR v_candidate IN SELECT value FROM jsonb_array_elements(v_candidates)
				LOOP
					v_target_complete := true;
					FOR v_required_field IN SELECT value FROM jsonb_array_elements(v_outcome->'requiredFields')
					LOOP
						IF NOT v_candidate->'fields' @> jsonb_build_array(v_required_field) THEN
							v_target_complete := false;
							EXIT;
						END IF;
					END LOOP;
					IF v_target_complete
						AND NOT v_matched_effects @> jsonb_build_array(v_candidate->'effectKey') THEN
						v_matched_effects := v_matched_effects || jsonb_build_array(v_candidate->'effectKey');
					END IF;
				END LOOP;
				v_match_count := jsonb_array_length(v_matched_effects);
				v_fulfilled := v_match_count >= v_required_count;
			END IF;
			IF NOT v_fulfilled THEN
				v_unfinished := v_unfinished || jsonb_build_array(v_outcome);
			END IF;
		END LOOP;
	END IF;

	-- No semantic work means no semantic contract, but legacy lexical metadata
	-- still needs clearing once a worker turn reaches a clean terminal state.
	IF NOT v_observed_contract_state
		AND NOT (COALESCE(v_session.agent_metadata, '{}'::jsonb) ? 'fastchat_pending_turn_intent') THEN
		RETURN NEW;
	END IF;
	v_now := NEW.terminalized_at;
	IF v_now IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_terminal_session_metadata_missing_terminal_time';
	END IF;
	v_created_at := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
	IF jsonb_array_length(v_unfinished) > 0 THEN
		v_contract := jsonb_build_object(
			'version', 1,
			'source', 'declared',
			'outcomes', v_unfinished
		);
		v_pending_contract := jsonb_build_object(
			'version', 1,
			'contract', v_contract,
			'contextType', NEW.context_type,
			'projectId', NEW.project_id,
			'originatingTurnRunId', NEW.id::text,
			'createdAt', v_created_at,
			'finishedReason', NEW.finished_reason
		);
	END IF;

	UPDATE public.chat_sessions sessions
	SET agent_metadata = COALESCE(sessions.agent_metadata, '{}'::jsonb)
			|| jsonb_build_object(
				'fastchat_pending_turn_contract', v_pending_contract,
				'fastchat_pending_turn_intent', 'null'::jsonb
			),
		updated_at = GREATEST(sessions.updated_at, NEW.terminalized_at)
	WHERE sessions.id = v_session.id;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.agentic_chat_normalize_contract_outcome_v1(jsonb, text)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_argument_fields_v1(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_effect_matches_v1(text, text, text, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_tool_semantics_v1(text)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_effect_target_id_v1(text, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1()
	FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1() IS
	'Atomically applies ordered semantic contract declaration/cancellation controls and persists only scope-safe unfinished durable outcomes for worker turns.';

COMMIT;
