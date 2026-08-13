-- supabase/migrations/20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql
-- Agentic Chat Worker, Phase 4 P5 S2: exact provider tool-definition snapshots.
--
-- The original prompt-snapshot RPC intentionally persisted exact model text but
-- left tool_definitions/tools_sha256 null. This rollout-safe v2 wrapper keeps
-- the original generation/ownership/message validation and atomically fills the
-- exact provider-filtered tool request. The legacy service grant remains until
-- every deployed worker has moved to v2.

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_prompt_snapshot_v2(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_prompt_snapshot_id uuid,
	p_model_messages jsonb,
	p_tool_definitions jsonb,
	p_system_prompt_sha256 text,
	p_messages_sha256 text,
	p_tools_sha256 text,
	p_system_prompt_chars integer,
	p_message_chars integer,
	p_approx_prompt_tokens integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_receipt jsonb;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
	v_snapshot public.chat_prompt_snapshots%ROWTYPE;
	v_actual_tool_names jsonb;
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	-- The v1 call owns all identity, generation, status, artifact-message, and
	-- queue-ownership checks. Any later exception rolls its insert back because
	-- both function calls execute in this transaction.
	v_receipt := public.persist_agentic_chat_prompt_snapshot(
		p_turn_run_id,
		p_user_id,
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		p_prompt_snapshot_id,
		p_model_messages,
		p_system_prompt_sha256,
		p_messages_sha256,
		p_system_prompt_chars,
		p_message_chars,
		p_approx_prompt_tokens
	);

	IF v_receipt->>'outcome' NOT IN ('persisted', 'already_persisted') THEN
		RETURN v_receipt;
	END IF;

	IF p_tool_definitions IS NULL
		OR jsonb_typeof(p_tool_definitions) <> 'array'
		OR octet_length(p_tool_definitions::text) > 2097152
		OR p_tools_sha256 IS NULL
		OR p_tools_sha256 !~ '^[0-9a-f]{64}$' THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_tool_payload';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_tool_definitions) definitions(item)
		WHERE COALESCE(jsonb_typeof(item) <> 'object', true)
			OR item->>'type' IS DISTINCT FROM 'function'
			OR COALESCE(jsonb_typeof(item->'function') <> 'object', true)
			OR COALESCE(jsonb_typeof(item->'function'->'name') <> 'string', true)
			OR COALESCE(item->'function'->>'name' = '', true)
			OR item->'function'->>'name' IS DISTINCT FROM btrim(item->'function'->>'name')
			OR char_length(item->'function'->>'name') > 256
			OR COALESCE(jsonb_typeof(item->'function'->'description') <> 'string', true)
			OR COALESCE(btrim(item->'function'->>'description') = '', true)
			OR COALESCE(jsonb_typeof(item->'function'->'parameters') <> 'object', true)
			OR item->'function'->'parameters'->>'type' IS DISTINCT FROM 'object'
	) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_tool_definition';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_tool_definitions) definitions(item)
		GROUP BY item->'function'->>'name'
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_duplicate_tool_definition';
	END IF;

	SELECT turns.* INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
		AND turns.user_id = p_user_id
	FOR UPDATE;
	IF NOT FOUND OR v_turn.prompt_snapshot_id IS DISTINCT FROM p_prompt_snapshot_id THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_v2_link_mismatch';
	END IF;

	SELECT artifacts.* INTO v_artifact
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = v_turn.input_artifact_id
		AND artifacts.turn_run_id = v_turn.id
		AND artifacts.session_id = v_turn.session_id
		AND artifacts.user_id = v_turn.user_id;
	IF NOT FOUND
		OR COALESCE(jsonb_typeof(v_artifact.prepared->'toolSurface') <> 'object', true)
		OR COALESCE(jsonb_typeof(v_artifact.prepared->'toolSurface'->'toolNames') <> 'array', true)
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_artifact.prepared->'toolSurface'->'toolNames') names(item)
			WHERE COALESCE(jsonb_typeof(item) <> 'string', true)
		) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_artifact_tool_surface_invalid';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_tool_definitions) definitions(item)
		WHERE NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements_text(
				v_artifact.prepared->'toolSurface'->'toolNames'
			) surface(name)
			WHERE surface.name = definitions.item->'function'->>'name'
		)
	) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_tool_not_in_artifact_surface';
	END IF;

	SELECT snapshots.* INTO v_snapshot
	FROM public.chat_prompt_snapshots snapshots
	WHERE snapshots.id = p_prompt_snapshot_id
		AND snapshots.turn_run_id = v_turn.id
		AND snapshots.session_id = v_turn.session_id
		AND snapshots.user_id = v_turn.user_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_v2_snapshot_missing';
	END IF;
	IF (v_snapshot.tool_definitions IS NULL) <> (v_snapshot.tools_sha256 IS NULL)
		OR (
			v_snapshot.tool_definitions IS NOT NULL
			AND (
				v_snapshot.tool_definitions IS DISTINCT FROM p_tool_definitions
				OR v_snapshot.tools_sha256 IS DISTINCT FROM p_tools_sha256
			)
		) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_tool_replay_conflict';
	END IF;

	SELECT COALESCE(
		jsonb_agg(item->'function'->'name' ORDER BY ordinal),
		'[]'::jsonb
	)
	INTO v_actual_tool_names
	FROM jsonb_array_elements(p_tool_definitions) WITH ORDINALITY definitions(item, ordinal);

	UPDATE public.chat_prompt_snapshots snapshots
	SET tool_definitions = p_tool_definitions,
		tools_sha256 = p_tools_sha256,
		prompt_sections = jsonb_set(
			COALESCE(snapshots.prompt_sections, '{}'::jsonb),
			'{actual_tool_surface}',
			jsonb_build_object(
				'tool_names', v_actual_tool_names,
				'tool_definition_count', jsonb_array_length(p_tool_definitions),
				'tools_sha256', p_tools_sha256
			),
			true
		)
	WHERE snapshots.id = v_snapshot.id;

	RETURN v_receipt || jsonb_build_object(
		'tools_sha256', p_tools_sha256,
		'tool_definition_count', jsonb_array_length(p_tool_definitions)
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_prompt_snapshot_v2(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, jsonb, text, text, text,
	integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_prompt_snapshot_v2(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, jsonb, text, text, text,
	integer, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_prompt_snapshot_v2(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, jsonb, text, text, text,
	integer, integer, integer
) IS
	'P5 S2: rollout-safe service-only exact text/tool prompt snapshot with generation and queue ownership fencing.';

COMMIT;
