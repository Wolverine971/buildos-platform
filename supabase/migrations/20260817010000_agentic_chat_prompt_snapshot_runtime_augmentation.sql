-- supabase/migrations/20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.sql
-- Preserve the exact first provider request when the worker inserts bounded
-- runtime-only system guidance after immutable history preparation.

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_prompt_snapshot_v3(
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
	v_turn public.chat_turn_runs%ROWTYPE;
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
	v_history_messages jsonb;
	v_base_messages jsonb;
	v_message jsonb;
	v_receipt jsonb;
	v_base_count integer;
	v_full_count integer;
	v_index integer;
	v_base_message_chars integer;
	v_base_approx_prompt_tokens integer;
	v_full_message_chars_min integer;
	v_full_message_chars_max integer;
	v_full_approx_tokens_min integer;
	v_full_approx_tokens_max integer;
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	-- Keep v2's established identity, generation, cancellation, terminal, and
	-- replay behavior. Only a new, currently-owned running snapshot needs the
	-- immutable base prompt reconstructed for the legacy v1 message fence.
	SELECT turns.* INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
		AND turns.user_id = p_user_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_turn.execution_generation IS DISTINCT FROM p_execution_generation
		OR v_turn.status <> 'running'
		OR v_turn.cancel_requested_at IS NOT NULL
		OR v_turn.prompt_snapshot_id IS NOT NULL
		OR EXISTS (
			SELECT 1
			FROM public.chat_prompt_snapshots snapshots
			WHERE snapshots.turn_run_id = p_turn_run_id
		) THEN
		RETURN public.persist_agentic_chat_prompt_snapshot_v2(
			p_turn_run_id,
			p_user_id,
			p_queue_job_id,
			p_processing_token,
			p_execution_generation,
			p_prompt_snapshot_id,
			p_model_messages,
			p_tool_definitions,
			p_system_prompt_sha256,
			p_messages_sha256,
			p_tools_sha256,
			p_system_prompt_chars,
			p_message_chars,
			p_approx_prompt_tokens
		);
	END IF;

	SELECT artifacts.* INTO v_artifact
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = v_turn.input_artifact_id
		AND artifacts.turn_run_id = v_turn.id
		AND artifacts.session_id = v_turn.session_id
		AND artifacts.user_id = v_turn.user_id;
	IF NOT FOUND
		OR jsonb_typeof(v_artifact.history) <> 'array'
		OR jsonb_typeof(v_artifact.prepared) <> 'object'
		OR COALESCE(v_artifact.prepared->>'systemPrompt', '') = ''
		OR COALESCE(v_turn.request_payload->>'message', '') = '' THEN
		-- Delegate malformed artifact classification to the existing fenced RPC.
		RETURN public.persist_agentic_chat_prompt_snapshot_v2(
			p_turn_run_id, p_user_id, p_queue_job_id, p_processing_token,
			p_execution_generation, p_prompt_snapshot_id, p_model_messages,
			p_tool_definitions, p_system_prompt_sha256, p_messages_sha256,
			p_tools_sha256, p_system_prompt_chars, p_message_chars,
			p_approx_prompt_tokens
		);
	END IF;

	SELECT COALESCE(
		jsonb_agg(
			jsonb_strip_nulls(
				jsonb_build_object(
					'role', item->>'role',
					'content', item->>'content',
					'tool_calls', CASE
						WHEN jsonb_array_length(item->'toolCalls') > 0 THEN item->'toolCalls'
						ELSE NULL
					END,
					'tool_call_id', CASE
						WHEN item->'toolCallId' <> 'null'::jsonb THEN item->>'toolCallId'
						ELSE NULL
					END
				)
			)
			ORDER BY ordinal
		),
		'[]'::jsonb
	)
	INTO v_history_messages
	FROM jsonb_array_elements(v_artifact.history) WITH ORDINALITY history(item, ordinal);

	v_base_messages :=
		jsonb_build_array(
			jsonb_build_object(
				'role', 'system',
				'content', v_artifact.prepared->>'systemPrompt'
			)
		)
		|| v_history_messages
		|| jsonb_build_array(
			jsonb_build_object('role', 'user', 'content', v_turn.request_payload->>'message')
		);

	IF p_model_messages IS NOT DISTINCT FROM v_base_messages THEN
		RETURN public.persist_agentic_chat_prompt_snapshot_v2(
			p_turn_run_id, p_user_id, p_queue_job_id, p_processing_token,
			p_execution_generation, p_prompt_snapshot_id, p_model_messages,
			p_tool_definitions, p_system_prompt_sha256, p_messages_sha256,
			p_tools_sha256, p_system_prompt_chars, p_message_chars,
			p_approx_prompt_tokens
		);
	END IF;

	IF jsonb_typeof(p_model_messages) <> 'array' THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_runtime_augmentation';
	END IF;
	v_base_count := jsonb_array_length(v_base_messages);
	v_full_count := jsonb_array_length(p_model_messages);
	IF v_full_count <= v_base_count THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_runtime_augmentation';
	END IF;

	-- Runtime guidance may only be inserted between the exact immutable
	-- system/history prefix and the exact current-user suffix.
	FOR v_index IN 0..(v_base_count - 2) LOOP
		IF p_model_messages->v_index IS DISTINCT FROM v_base_messages->v_index THEN
			RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_runtime_augmentation';
		END IF;
	END LOOP;
	IF p_model_messages->(v_full_count - 1) IS DISTINCT FROM
		v_base_messages->(v_base_count - 1) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_runtime_augmentation';
	END IF;
	FOR v_index IN (v_base_count - 1)..(v_full_count - 2) LOOP
		v_message := p_model_messages->v_index;
		IF jsonb_typeof(v_message) <> 'object'
			OR jsonb_typeof(v_message->'content') <> 'string'
			OR COALESCE(v_message->>'content', '') = ''
			OR v_message IS DISTINCT FROM jsonb_build_object(
				'role', 'system',
				'content', v_message->>'content'
			) THEN
			RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_runtime_augmentation';
		END IF;
	END LOOP;

	SELECT COALESCE(sum(char_length(item->>'content')), 0)::integer,
		COALESCE(sum(octet_length(item->>'content')), 0)::integer,
		COALESCE(sum(ceil(char_length(item->>'content') / 4.0)), 0)::integer,
		COALESCE(sum(ceil(octet_length(item->>'content') / 4.0)), 0)::integer
	INTO v_full_message_chars_min, v_full_message_chars_max,
		v_full_approx_tokens_min, v_full_approx_tokens_max
	FROM jsonb_array_elements(p_model_messages) messages(item);
	IF p_system_prompt_chars < char_length(v_artifact.prepared->>'systemPrompt')
		OR p_system_prompt_chars > octet_length(v_artifact.prepared->>'systemPrompt')
		OR p_message_chars < v_full_message_chars_min
		OR p_message_chars > v_full_message_chars_max
		OR p_approx_prompt_tokens < v_full_approx_tokens_min
		OR p_approx_prompt_tokens > v_full_approx_tokens_max THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_runtime_size_mismatch';
	END IF;

	SELECT COALESCE(sum(char_length(item->>'content')), 0)::integer
	INTO v_base_message_chars
	FROM jsonb_array_elements(v_base_messages) messages(item);
	v_base_approx_prompt_tokens :=
		(v_artifact.prepared->'contextUsageSnapshot'->>'estimatedTokens')::integer;

	-- v2 retains the established queue/artifact/tool fences. Persist its exact
	-- reconstructed base first, then atomically replace only the evidence fields
	-- with the already-validated provider request before this transaction exits.
	v_receipt := public.persist_agentic_chat_prompt_snapshot_v2(
		p_turn_run_id,
		p_user_id,
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		p_prompt_snapshot_id,
		v_base_messages,
		p_tool_definitions,
		p_system_prompt_sha256,
		p_messages_sha256,
		p_tools_sha256,
		p_system_prompt_chars,
		v_base_message_chars,
		v_base_approx_prompt_tokens
	);
	IF v_receipt->>'outcome' NOT IN ('persisted', 'already_persisted') THEN
		RETURN v_receipt;
	END IF;

	UPDATE public.chat_prompt_snapshots snapshots
	SET model_messages = p_model_messages,
		messages_sha256 = p_messages_sha256,
		message_chars = p_message_chars,
		approx_prompt_tokens = p_approx_prompt_tokens,
		prompt_sections = jsonb_set(
			COALESCE(snapshots.prompt_sections, '{}'::jsonb),
			'{runtime_message_augmentation}',
			jsonb_build_object(
				'inserted_system_message_count', v_full_count - v_base_count,
				'messages_sha256', p_messages_sha256
			),
			true
		)
	WHERE snapshots.id = p_prompt_snapshot_id
		AND snapshots.turn_run_id = p_turn_run_id
		AND snapshots.user_id = p_user_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_v3_snapshot_missing';
	END IF;

	RETURN v_receipt || jsonb_build_object(
		'messages_sha256', p_messages_sha256,
		'message_chars', p_message_chars,
		'approx_prompt_tokens', p_approx_prompt_tokens
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_prompt_snapshot_v3(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, jsonb, text, text, text,
	integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_prompt_snapshot_v3(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, jsonb, text, text, text,
	integer, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_prompt_snapshot_v3(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, jsonb, text, text, text,
	integer, integer, integer
) IS
	'P5 runtime augmentation: exact first provider request with bounded system-only guidance between immutable history and current user input.';

COMMIT;
