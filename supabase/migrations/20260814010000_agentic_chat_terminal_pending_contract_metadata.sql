-- supabase/migrations/20260814010000_agentic_chat_terminal_pending_contract_metadata.sql
-- Replace lexical pending-intent authority with semantic turn contracts.
--
-- A worker turn obtains a contract from either:
--   1. successful declare_turn_contract control calls (including a prior
--      pending contract carried by session metadata), or
--   2. directly observed failed mutation calls when no declaration exists.
-- Completion is evaluated from distinct successful entity effects, their
-- semantic action/entity, target ids, and per-target mutated argument fields.

BEGIN;

CREATE OR REPLACE FUNCTION public.agentic_chat_contract_tool_semantics_v1(
	p_tool_name text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_action text;
	v_entity_kind text;
BEGIN
	IF p_tool_name ~ '^(create|update|delete)_onto_[a-z_]+$' THEN
		v_action := split_part(p_tool_name, '_', 1);
		v_entity_kind := regexp_replace(
			p_tool_name,
			'^(?:create|update|delete)_onto_',
			''
		);
	ELSIF p_tool_name = 'move_document_in_tree' THEN
		v_action := 'move'; v_entity_kind := 'document';
	ELSIF p_tool_name = 'move_onto_task' THEN
		v_action := 'move'; v_entity_kind := 'task';
	ELSIF p_tool_name = 'create_task_document' THEN
		v_action := 'create'; v_entity_kind := 'document';
	ELSIF p_tool_name IN ('create_calendar_event', 'update_calendar_event', 'delete_calendar_event') THEN
		v_action := split_part(p_tool_name, '_', 1); v_entity_kind := 'event';
	ELSIF p_tool_name = 'reorganize_onto_project_graph' THEN
		v_action := 'organize'; v_entity_kind := 'project';
	ELSIF p_tool_name = 'link_onto_entities' THEN
		v_action := 'link'; v_entity_kind := 'relationship';
	ELSIF p_tool_name = 'unlink_onto_edge' THEN
		v_action := 'unlink'; v_entity_kind := 'relationship';
	ELSIF p_tool_name = 'set_project_calendar' THEN
		v_action := 'set'; v_entity_kind := 'calendar';
	ELSIF p_tool_name = 'tag_onto_entity' THEN
		v_action := 'tag'; v_entity_kind := 'entity';
	ELSE
		RETURN NULL;
	END IF;
	RETURN jsonb_build_object('action', v_action, 'entityKind', v_entity_kind);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_contract_effect_target_id_v1(
	p_tool_name text,
	p_arguments jsonb,
	p_result jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_semantics jsonb := public.agentic_chat_contract_tool_semantics_v1(p_tool_name);
	v_entity_kind text;
	v_result_payload jsonb;
BEGIN
	IF v_semantics IS NULL THEN RETURN NULL; END IF;
	v_entity_kind := v_semantics->>'entityKind';
	v_result_payload := COALESCE(p_result->'result', p_result);
	RETURN COALESCE(
		p_arguments->>(v_entity_kind || '_id'),
		CASE v_entity_kind
			WHEN 'document' THEN p_arguments->>'document_id'
			WHEN 'task' THEN p_arguments->>'task_id'
			WHEN 'project' THEN p_arguments->>'project_id'
			WHEN 'event' THEN p_arguments->>'event_id'
			WHEN 'relationship' THEN COALESCE(p_arguments->>'edge_id', p_arguments->>'entity_id')
			ELSE p_arguments->>'entity_id'
		END,
		v_result_payload->v_entity_kind->>'id',
		v_result_payload->>(v_entity_kind || '_id'),
		v_result_payload->>'id'
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_session public.chat_sessions%ROWTYPE;
	v_execution record;
	v_raw_outcome jsonb;
	v_outcome jsonb;
	v_outcomes jsonb := '[]'::jsonb;
	v_unfinished jsonb := '[]'::jsonb;
	v_contract jsonb;
	v_existing_pending jsonb;
	v_semantics jsonb;
	v_action text;
	v_entity_kind text;
	v_actual_action text;
	v_actual_entity_kind text;
	v_target_id text;
	v_target jsonb;
	v_field jsonb;
	v_match_count integer;
	v_required_count integer;
	v_matched_targets jsonb;
	v_matched_fields jsonb;
	v_matched_target_fields jsonb;
	v_matched_effects jsonb;
	v_effect_key text;
	v_fulfilled boolean;
	v_pending_contract jsonb := 'null'::jsonb;
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

	-- Merge every successful declaration made during the turn. The worker
	-- control adapter validates these before they can produce a successful row;
	-- the shape checks here are the durable trust boundary.
	FOR v_execution IN
		SELECT executions.arguments, executions.sequence_index
		FROM public.chat_tool_executions executions
		WHERE executions.turn_run_id = NEW.id
			AND executions.session_id = NEW.session_id
			AND executions.tool_name = 'declare_turn_contract'
			AND executions.success = true
		ORDER BY executions.sequence_index
	LOOP
		IF jsonb_typeof(v_execution.arguments->'outcomes') <> 'array'
			OR jsonb_array_length(v_execution.arguments->'outcomes') NOT BETWEEN 1 AND 20 THEN
			RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_declaration';
		END IF;
		FOR v_raw_outcome IN
			SELECT value FROM jsonb_array_elements(v_execution.arguments->'outcomes')
		LOOP
			v_action := v_raw_outcome->>'action';
			v_entity_kind := COALESCE(
				v_raw_outcome->>'entity_kind',
				v_raw_outcome->>'entityKind'
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
			v_required_count := GREATEST(
				1,
				LEAST(100, COALESCE(
					(v_raw_outcome->>'minimum_successful_effects')::integer,
					(v_raw_outcome->>'minimumSuccessfulEffects')::integer,
					1
				))
			);
			v_outcome := jsonb_build_object(
				'id', COALESCE(v_raw_outcome->>'id', 'outcome_' || (jsonb_array_length(v_outcomes) + 1)::text),
				'action', v_action,
				'entityKind', v_entity_kind,
				'targetIds', COALESCE(v_raw_outcome->'target_ids', v_raw_outcome->'targetIds', '[]'::jsonb),
				'requiredFields', COALESCE(v_raw_outcome->'required_fields', v_raw_outcome->'requiredFields', '[]'::jsonb),
				'minimumSuccessfulEffects', v_required_count
			);
			IF v_raw_outcome ? 'description' THEN
				v_outcome := v_outcome || jsonb_build_object('description', v_raw_outcome->>'description');
			END IF;
			IF jsonb_typeof(v_outcome->'targetIds') <> 'array'
				OR jsonb_typeof(v_outcome->'requiredFields') <> 'array'
				OR jsonb_array_length(v_outcome->'targetIds') > 50
				OR jsonb_array_length(v_outcome->'requiredFields') > 30 THEN
				RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_outcome';
			END IF;
			v_outcomes := v_outcomes || jsonb_build_array(v_outcome);
		END LOOP;
	END LOOP;

	-- A prior unfinished contract remains authoritative even when the model
	-- proceeds directly to writes without re-declaring it.
	IF jsonb_array_length(v_outcomes) = 0
		AND jsonb_typeof(v_existing_pending->'contract'->'outcomes') = 'array' THEN
		v_outcomes := v_existing_pending->'contract'->'outcomes';
	END IF;

	-- Direct calls form an implicit contract. Successful calls are already
	-- fulfilled, so only durable failed calls need carry-forward outcomes.
	IF jsonb_array_length(v_outcomes) = 0 THEN
		FOR v_execution IN
			SELECT executions.*
			FROM public.chat_tool_executions executions
			WHERE executions.turn_run_id = NEW.id
				AND executions.session_id = NEW.session_id
				AND executions.success = false
			ORDER BY executions.sequence_index
		LOOP
			v_semantics := public.agentic_chat_contract_tool_semantics_v1(v_execution.tool_name);
			IF v_semantics IS NULL THEN CONTINUE; END IF;
			v_target_id := public.agentic_chat_contract_effect_target_id_v1(
				v_execution.tool_name,
				v_execution.arguments,
				v_execution.result
			);
			v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
				'id', 'implicit_' || v_execution.sequence_index::text,
				'action', v_semantics->>'action',
				'entityKind', v_semantics->>'entityKind',
				'targetIds', CASE WHEN v_target_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_target_id) END,
				'requiredFields', '[]'::jsonb,
				'minimumSuccessfulEffects', 1
			));
		END LOOP;
	END IF;

	IF jsonb_array_length(v_outcomes) = 0 THEN
		RETURN NEW;
	END IF;

	FOR v_outcome IN SELECT value FROM jsonb_array_elements(v_outcomes)
	LOOP
		v_action := v_outcome->>'action';
		v_entity_kind := v_outcome->>'entityKind';
		v_required_count := GREATEST(1, COALESCE((v_outcome->>'minimumSuccessfulEffects')::integer, 1));
		v_match_count := 0;
		v_matched_targets := '[]'::jsonb;
		v_matched_fields := '[]'::jsonb;
		v_matched_target_fields := '[]'::jsonb;
		v_matched_effects := '[]'::jsonb;

		FOR v_execution IN
			SELECT executions.*
			FROM public.chat_tool_executions executions
			WHERE executions.turn_run_id = NEW.id
				AND executions.session_id = NEW.session_id
				AND executions.success = true
			ORDER BY executions.sequence_index
		LOOP
			v_semantics := public.agentic_chat_contract_tool_semantics_v1(v_execution.tool_name);
			IF v_semantics IS NULL THEN CONTINUE; END IF;
			v_actual_action := v_semantics->>'action';
			v_actual_entity_kind := v_semantics->>'entityKind';
			IF NOT (
				(v_action = v_actual_action)
				OR (v_action = 'organize' AND v_actual_action IN ('move', 'organize'))
				OR (v_action = 'schedule' AND v_actual_action IN ('create', 'update', 'set'))
				OR (v_action = 'complete' AND v_actual_action = 'update')
			) OR NOT (v_entity_kind = 'entity' OR v_entity_kind = v_actual_entity_kind) THEN
				CONTINUE;
			END IF;
			v_target_id := public.agentic_chat_contract_effect_target_id_v1(
				v_execution.tool_name,
				v_execution.arguments,
				v_execution.result
			);
			-- Cardinality means distinct durable effects, not successful call
			-- count. Prefer the affected entity so retries/repeated calls against
			-- the same entity cannot satisfy a multi-entity commission.
			v_effect_key := COALESCE(
				v_target_id,
				v_execution.effect_id::text,
				v_execution.id::text
			);
			IF NOT v_matched_effects @> jsonb_build_array(v_effect_key) THEN
				v_matched_effects := v_matched_effects || jsonb_build_array(v_effect_key);
			END IF;
			IF v_target_id IS NOT NULL
				AND NOT v_matched_targets @> jsonb_build_array(v_target_id) THEN
				v_matched_targets := v_matched_targets || jsonb_build_array(v_target_id);
			END IF;
			FOR v_field IN
				SELECT to_jsonb(argument_key)
				FROM jsonb_object_keys(v_execution.arguments) argument_key
				WHERE argument_key NOT IN (
					'project_id', 'task_id', 'document_id', 'event_id', 'goal_id',
					'plan_id', 'milestone_id', 'risk_id', 'edge_id', 'entity_id',
					'new_parent_id', 'parent_id', 'update_strategy', 'confirm',
					'idempotency_key'
				)
			LOOP
				IF NOT v_matched_fields @> jsonb_build_array(v_field) THEN
					v_matched_fields := v_matched_fields || jsonb_build_array(v_field);
				END IF;
				IF v_target_id IS NOT NULL
					AND NOT v_matched_target_fields @> jsonb_build_array(jsonb_build_object(
						'targetId', v_target_id,
						'field', v_field #>> '{}'
					)) THEN
					v_matched_target_fields := v_matched_target_fields || jsonb_build_array(
						jsonb_build_object(
							'targetId', v_target_id,
							'field', v_field #>> '{}'
						)
					);
				END IF;
			END LOOP;
		END LOOP;
		v_match_count := jsonb_array_length(v_matched_effects);

		v_fulfilled := v_match_count >= v_required_count;
		IF v_fulfilled THEN
			FOR v_target IN SELECT value FROM jsonb_array_elements(v_outcome->'targetIds')
			LOOP
				IF NOT v_matched_targets @> jsonb_build_array(v_target) THEN
					v_fulfilled := false; EXIT;
				END IF;
			END LOOP;
		END IF;
		IF v_fulfilled AND jsonb_array_length(v_outcome->'targetIds') > 0 THEN
			-- Required fields apply to every declared target. A title update on
			-- one task cannot satisfy a title update commissioned for two tasks.
			FOR v_target IN SELECT value FROM jsonb_array_elements(v_outcome->'targetIds')
			LOOP
				FOR v_field IN SELECT value FROM jsonb_array_elements(v_outcome->'requiredFields')
				LOOP
					IF NOT v_matched_target_fields @> jsonb_build_array(jsonb_build_object(
						'targetId', v_target #>> '{}',
						'field', v_field #>> '{}'
					)) THEN
						v_fulfilled := false; EXIT;
					END IF;
				END LOOP;
				EXIT WHEN NOT v_fulfilled;
			END LOOP;
		ELSIF v_fulfilled THEN
			FOR v_field IN SELECT value FROM jsonb_array_elements(v_outcome->'requiredFields')
			LOOP
				IF NOT v_matched_fields @> jsonb_build_array(v_field) THEN
					v_fulfilled := false; EXIT;
				END IF;
			END LOOP;
		END IF;
		IF NOT v_fulfilled THEN
			v_unfinished := v_unfinished || jsonb_build_array(v_outcome);
		END IF;
	END LOOP;

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

DROP TRIGGER IF EXISTS trg_chat_turn_runs_terminal_pending_intent
	ON public.chat_turn_runs;
DROP TRIGGER IF EXISTS trg_chat_turn_runs_terminal_pending_contract
	ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_terminal_pending_contract
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1();

REVOKE ALL ON FUNCTION public.agentic_chat_contract_tool_semantics_v1(text)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_effect_target_id_v1(text, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1()
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_contract_tool_semantics_v1(text)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.agentic_chat_contract_effect_target_id_v1(text, jsonb, jsonb)
	TO service_role;

COMMENT ON FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1() IS
	'Atomically persists only unfinished semantic turn outcomes from model declarations, prior contracts, or observed failed writes.';

COMMIT;
