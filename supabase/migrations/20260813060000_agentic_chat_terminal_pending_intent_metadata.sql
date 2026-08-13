-- supabase/migrations/20260813060000_agentic_chat_terminal_pending_intent_metadata.sql
-- Agentic Chat Worker Phase 4 P5 S3: freeze structured turn intent and merge
-- pending-intent session metadata inside authoritative terminal truth.
--
-- The new prepared.turnIntent member is optional for rolling compatibility.
-- When present, admission validates the exact structured shape and derived
-- write-tool set. A completed worker turn then derives fulfillment exclusively
-- from that immutable snapshot plus durable successful write rows. The shallow
-- session metadata merge runs as an AFTER status trigger in the same finalizer
-- transaction; any failure rolls back message, event, turn, and metadata truth.

BEGIN;

CREATE OR REPLACE FUNCTION public.agentic_chat_expected_write_tool_names_v1(
	p_intent jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_operations jsonb;
	v_operation jsonb;
	v_action text;
	v_entity_kind text;
	v_tool_name text;
	v_result jsonb := '[]'::jsonb;
BEGIN
	v_operations := p_intent->'operations';
	IF jsonb_typeof(v_operations) <> 'array' THEN
		RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_operations';
	END IF;
	IF jsonb_array_length(v_operations) = 0
		AND COALESCE((p_intent->>'requiresWrite')::boolean, false)
		AND jsonb_typeof(p_intent->'action') = 'string' THEN
		v_operations := jsonb_build_array(jsonb_build_object(
			'action', p_intent->>'action',
			'entityKind', p_intent->>'entityKind'
		));
	END IF;

	FOR v_operation IN SELECT value FROM jsonb_array_elements(v_operations)
	LOOP
		v_action := v_operation->>'action';
		v_entity_kind := v_operation->>'entityKind';
		v_tool_name := NULL;

		IF v_action = 'link' THEN
			v_tool_name := 'link_onto_entities';
		ELSIF v_action = 'unlink' THEN
			v_tool_name := 'unlink_onto_edge';
		ELSIF v_entity_kind = 'document' THEN
			v_tool_name := CASE v_action
				WHEN 'create' THEN 'create_onto_document'
				WHEN 'organize' THEN 'move_document_in_tree'
				WHEN 'delete' THEN 'delete_onto_document'
				ELSE 'update_onto_document'
			END;
		ELSIF v_entity_kind = 'task' THEN
			v_tool_name := CASE v_action
				WHEN 'create' THEN 'create_onto_task'
				WHEN 'delete' THEN 'delete_onto_task'
				ELSE 'update_onto_task'
			END;
		ELSIF v_entity_kind = 'project' THEN
			v_tool_name := CASE v_action
				WHEN 'create' THEN 'create_onto_project'
				WHEN 'delete' THEN 'delete_onto_project'
				ELSE 'update_onto_project'
			END;
		ELSIF v_entity_kind = 'event' THEN
			v_tool_name := CASE v_action
				WHEN 'create' THEN 'create_calendar_event'
				WHEN 'delete' THEN 'delete_calendar_event'
				ELSE 'update_calendar_event'
			END;
		ELSIF v_entity_kind IN ('goal', 'plan', 'milestone', 'risk') THEN
			v_tool_name := CASE
				WHEN v_action = 'create' THEN 'create_onto_' || v_entity_kind
				WHEN v_action = 'delete' THEN 'delete_onto_' || v_entity_kind
				ELSE 'update_onto_' || v_entity_kind
			END;
		END IF;

		IF v_tool_name IS NOT NULL
			AND NOT v_result @> jsonb_build_array(v_tool_name) THEN
			v_result := v_result || jsonb_build_array(v_tool_name);
		END IF;
	END LOOP;

	RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_turn_intent_snapshot_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_intent jsonb := NEW.prepared->'turnIntent';
	v_operation jsonb;
	v_expected_name jsonb;
BEGIN
	IF NOT (NEW.prepared ? 'turnIntent') THEN
		RETURN NEW;
	END IF;
	IF NEW.artifact_version <> 'agentic_chat_input_v3'
		OR jsonb_typeof(v_intent) <> 'object'
		OR NOT v_intent ?& ARRAY[
			'version', 'requiresWrite', 'action', 'entityKind', 'operations',
			'source', 'originalRequestText', 'originatingTurnRunId',
			'clearPending', 'expectedWriteToolNames'
		]
		OR (v_intent - ARRAY[
			'version', 'requiresWrite', 'action', 'entityKind', 'operations',
			'source', 'originalRequestText', 'originatingTurnRunId',
			'clearPending', 'expectedWriteToolNames'
		]) <> '{}'::jsonb
		OR v_intent->>'version' <> '1'
		OR jsonb_typeof(v_intent->'requiresWrite') <> 'boolean'
		OR jsonb_typeof(v_intent->'clearPending') <> 'boolean'
		OR v_intent->>'entityKind' NOT IN (
			'document', 'task', 'project', 'event', 'goal', 'plan',
			'milestone', 'risk', 'unknown'
		)
		OR v_intent->>'source' NOT IN ('current_message', 'pending_continuation', 'none')
		OR jsonb_typeof(v_intent->'operations') <> 'array'
		OR jsonb_array_length(v_intent->'operations') > 16
		OR jsonb_typeof(v_intent->'expectedWriteToolNames') <> 'array'
		OR jsonb_array_length(v_intent->'expectedWriteToolNames') > 16
		OR NOT (
			jsonb_typeof(v_intent->'action') = 'null'
			OR (
				jsonb_typeof(v_intent->'action') = 'string'
				AND v_intent->>'action' IN (
					'create', 'update', 'delete', 'organize', 'link', 'unlink'
				)
			)
		)
		OR NOT (
			jsonb_typeof(v_intent->'originalRequestText') = 'null'
			OR (
				jsonb_typeof(v_intent->'originalRequestText') = 'string'
				AND length(v_intent->>'originalRequestText') BETWEEN 1 AND 1200
				AND v_intent->>'originalRequestText' = btrim(v_intent->>'originalRequestText')
			)
		)
		OR NOT (
			jsonb_typeof(v_intent->'originatingTurnRunId') = 'null'
			OR (
				jsonb_typeof(v_intent->'originatingTurnRunId') = 'string'
				AND length(v_intent->>'originatingTurnRunId') BETWEEN 1 AND 128
				AND v_intent->>'originatingTurnRunId'
					= btrim(v_intent->>'originatingTurnRunId')
			)
		) THEN
		RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_snapshot';
	END IF;

	FOR v_operation IN SELECT value FROM jsonb_array_elements(v_intent->'operations')
	LOOP
		IF jsonb_typeof(v_operation) <> 'object'
			OR NOT v_operation ?& ARRAY['action', 'entityKind']
			OR (v_operation - ARRAY['action', 'entityKind']) <> '{}'::jsonb
			OR v_operation->>'action' NOT IN (
				'create', 'update', 'delete', 'organize', 'link', 'unlink'
			)
			OR v_operation->>'entityKind' NOT IN (
				'document', 'task', 'project', 'event', 'goal', 'plan',
				'milestone', 'risk', 'unknown'
			) THEN
			RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_snapshot';
		END IF;
	END LOOP;

	FOR v_expected_name IN
		SELECT value FROM jsonb_array_elements(v_intent->'expectedWriteToolNames')
	LOOP
		IF jsonb_typeof(v_expected_name) <> 'string'
			OR v_expected_name#>>'{}' !~ '^[a-z][a-z0-9_]{0,127}$' THEN
			RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_snapshot';
		END IF;
	END LOOP;
	IF (
		SELECT count(*) <> count(DISTINCT value)
		FROM jsonb_array_elements(v_intent->'expectedWriteToolNames')
	) OR public.agentic_chat_expected_write_tool_names_v1(v_intent)
		IS DISTINCT FROM v_intent->'expectedWriteToolNames' THEN
		RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_expected_tools';
	END IF;

	IF (v_intent->>'requiresWrite')::boolean THEN
		IF jsonb_typeof(v_intent->'action') <> 'string'
			OR v_intent->>'source' = 'none'
			OR jsonb_array_length(v_intent->'operations') = 0
			OR (v_intent->>'clearPending')::boolean THEN
			RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_write_snapshot';
		END IF;
	ELSE
		IF jsonb_typeof(v_intent->'action') <> 'null'
			OR v_intent->>'entityKind' <> 'unknown'
			OR jsonb_array_length(v_intent->'operations') <> 0
			OR v_intent->>'source' <> 'none'
			OR jsonb_typeof(v_intent->'originalRequestText') <> 'null'
			OR jsonb_typeof(v_intent->'originatingTurnRunId') <> 'null'
			OR jsonb_array_length(v_intent->'expectedWriteToolNames') <> 0 THEN
			RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_read_snapshot';
		END IF;
	END IF;

	RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_z_turn_intent
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_z_turn_intent
BEFORE INSERT ON public.chat_turn_input_artifacts
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_turn_intent_snapshot_v1();

CREATE OR REPLACE FUNCTION public.apply_agentic_chat_terminal_pending_intent_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_intent jsonb;
	v_expected_tools jsonb;
	v_fulfilled boolean;
	v_pending_intent jsonb;
	v_session public.chat_sessions%ROWTYPE;
	v_now timestamptz;
	v_updated_at text;
	v_expires_at text;
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status <> 'completed'
		OR OLD.status IN ('completed', 'failed', 'cancelled')
		OR NEW.input_artifact_id IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT artifacts.prepared->'turnIntent'
	INTO v_intent
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = NEW.input_artifact_id
		AND artifacts.turn_run_id = NEW.id
		AND artifacts.session_id = NEW.session_id
		AND artifacts.user_id = NEW.user_id;
	IF NOT FOUND OR v_intent IS NULL THEN
		RETURN NEW;
	END IF;
	IF NOT COALESCE((v_intent->>'requiresWrite')::boolean, false)
		AND NOT COALESCE((v_intent->>'clearPending')::boolean, false) THEN
		RETURN NEW;
	END IF;

	v_expected_tools := public.agentic_chat_expected_write_tool_names_v1(v_intent);
	IF NOT (v_intent->>'requiresWrite')::boolean THEN
		v_fulfilled := true;
	ELSIF jsonb_array_length(v_expected_tools) > 0 THEN
		SELECT NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements_text(v_expected_tools) expected(tool_name)
			WHERE NOT EXISTS (
				SELECT 1
				FROM public.chat_tool_executions executions
				WHERE executions.turn_run_id = NEW.id
					AND executions.session_id = NEW.session_id
					AND executions.tool_category = 'write'
					AND executions.success = true
					AND executions.tool_name = expected.tool_name
			)
		)
		INTO v_fulfilled;
	ELSE
		SELECT EXISTS (
			SELECT 1
			FROM public.chat_tool_executions executions
			WHERE executions.turn_run_id = NEW.id
				AND executions.session_id = NEW.session_id
				AND executions.tool_category = 'write'
				AND executions.success = true
		)
		INTO v_fulfilled;
	END IF;

	SELECT sessions.*
	INTO v_session
	FROM public.chat_sessions sessions
	WHERE sessions.id = NEW.session_id
	FOR UPDATE;
	IF NOT FOUND OR v_session.user_id IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'agentic_chat_terminal_session_metadata_scope_mismatch';
	END IF;

	v_pending_intent := 'null'::jsonb;
	IF (v_intent->>'requiresWrite')::boolean AND NOT v_fulfilled THEN
		v_now := NEW.terminalized_at;
		IF v_now IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_terminal_session_metadata_missing_terminal_time';
		END IF;
		v_updated_at := to_char(
			v_now AT TIME ZONE 'UTC',
			'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
		);
		v_expires_at := to_char(
			(v_now + interval '24 hours') AT TIME ZONE 'UTC',
			'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
		);
		v_pending_intent := (v_intent - 'expectedWriteToolNames') || jsonb_build_object(
			'requiresWrite', true,
			'status', 'pending',
			'contextType', NEW.context_type,
			'projectId', NEW.project_id,
			'originatingTurnRunId', COALESCE(
				v_intent->'originatingTurnRunId',
				to_jsonb(NEW.id::text)
			),
			'updatedAt', v_updated_at,
			'expiresAt', v_expires_at,
			'lastFinishedReason', NEW.finished_reason
		);
		IF jsonb_typeof(v_pending_intent->'originatingTurnRunId') = 'null' THEN
			v_pending_intent := jsonb_set(
				v_pending_intent,
				'{originatingTurnRunId}',
				to_jsonb(NEW.id::text)
			);
		END IF;
	END IF;

	UPDATE public.chat_sessions sessions
	SET agent_metadata = COALESCE(sessions.agent_metadata, '{}'::jsonb)
			|| jsonb_build_object('fastchat_pending_turn_intent', v_pending_intent),
		updated_at = GREATEST(sessions.updated_at, NEW.terminalized_at)
	WHERE sessions.id = v_session.id;

	RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_chat_turn_runs_terminal_pending_intent
	ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_terminal_pending_intent
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.apply_agentic_chat_terminal_pending_intent_v1();

REVOKE ALL ON FUNCTION public.agentic_chat_expected_write_tool_names_v1(jsonb)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_turn_intent_snapshot_v1()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_agentic_chat_terminal_pending_intent_v1()
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_expected_write_tool_names_v1(jsonb)
	TO service_role;

COMMENT ON FUNCTION public.agentic_chat_expected_write_tool_names_v1(jsonb) IS
	'Derives the ordered unique write-tool expectation from one immutable Agentic Chat turn-intent snapshot.';
COMMENT ON FUNCTION public.validate_agentic_chat_turn_intent_snapshot_v1() IS
	'Validates optional rolling-v3 structured turn intent and its independently derived expected write tools.';
COMMENT ON FUNCTION public.apply_agentic_chat_terminal_pending_intent_v1() IS
	'Atomically shallow-merges pending-turn intent from immutable input plus durable write outcomes during completed worker terminalization.';

COMMIT;
