-- supabase/migrations/20260804032000_agentic_chat_prompt_snapshot.sql
-- Agentic Chat Worker Phase 4 Slice 7: exact first-response prompt snapshots.
--
-- This service-only RPC persists the exact prepared model messages after the
-- first response has become durable. Snapshot metadata is derived from the
-- locked turn and immutable input artifact; no internal observability row is
-- added to chat_turn_events because that table is also the public worker
-- reconciliation log.

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_prompt_snapshot(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_prompt_snapshot_id uuid,
	p_model_messages jsonb,
	p_system_prompt_sha256 text,
	p_messages_sha256 text,
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
	v_job public.queue_jobs%ROWTYPE;
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
	v_existing public.chat_prompt_snapshots%ROWTYPE;
	v_history_messages jsonb;
	v_expected_messages jsonb;
	v_prompt_sections jsonb;
	v_context_payload jsonb;
	v_system_prompt text;
	v_prompt_variant text;
	v_created_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_user_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_prompt_snapshot_id IS NULL
		OR substring(p_prompt_snapshot_id::text FROM 15 FOR 1) <> '5'
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_identity';
	END IF;
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
		AND turns.user_id = p_user_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_turn_relationship_mismatch';
	END IF;
	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'snapshot_available', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation,
			'status', v_turn.status
		);
	END IF;

	SELECT snapshots.*
	INTO v_existing
	FROM public.chat_prompt_snapshots snapshots
	WHERE snapshots.turn_run_id = v_turn.id;

	IF FOUND THEN
		IF v_turn.prompt_snapshot_id IS DISTINCT FROM v_existing.id
			OR v_existing.id IS DISTINCT FROM p_prompt_snapshot_id
			OR v_existing.session_id IS DISTINCT FROM v_turn.session_id
			OR v_existing.user_id IS DISTINCT FROM v_turn.user_id
			OR v_existing.snapshot_version <> 'agentic_chat_worker_prompt_v1'
			OR v_existing.model_messages IS DISTINCT FROM p_model_messages
			OR v_existing.system_prompt_sha256 IS DISTINCT FROM p_system_prompt_sha256
			OR v_existing.messages_sha256 IS DISTINCT FROM p_messages_sha256
			OR v_existing.system_prompt_chars IS DISTINCT FROM p_system_prompt_chars
			OR v_existing.message_chars IS DISTINCT FROM p_message_chars
			OR v_existing.approx_prompt_tokens IS DISTINCT FROM p_approx_prompt_tokens THEN
			RAISE EXCEPTION 'agentic_chat_prompt_snapshot_replay_conflict';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_persisted',
			'snapshot_available', true,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'prompt_snapshot_id', v_existing.id,
			'snapshot_version', v_existing.snapshot_version,
			'prompt_variant', v_existing.prompt_variant,
			'system_prompt_sha256', v_existing.system_prompt_sha256,
			'messages_sha256', v_existing.messages_sha256,
			'system_prompt_chars', v_existing.system_prompt_chars,
			'message_chars', v_existing.message_chars,
			'approx_prompt_tokens', v_existing.approx_prompt_tokens,
			'created_at', v_existing.created_at
		);
	END IF;
	IF v_turn.prompt_snapshot_id IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_link_corrupt';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM public.chat_prompt_snapshots snapshots
		WHERE snapshots.id = p_prompt_snapshot_id
	) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_identity_conflict';
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'snapshot_available', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.status <> 'running' OR v_turn.execution_started_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_status';
	END IF;
	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'snapshot_available', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'cancel_requested_at', v_turn.cancel_requested_at,
			'cancel_reason', v_turn.cancel_reason
		);
	END IF;
	IF p_model_messages IS NULL
		OR jsonb_typeof(p_model_messages) <> 'array'
		OR jsonb_array_length(p_model_messages) < 2
		OR octet_length(p_model_messages::text) > 2097152
		OR p_system_prompt_sha256 IS NULL
		OR p_system_prompt_sha256 !~ '^[0-9a-f]{64}$'
		OR p_messages_sha256 IS NULL
		OR p_messages_sha256 !~ '^[0-9a-f]{64}$'
		OR p_system_prompt_chars IS NULL
		OR p_system_prompt_chars < 1
		OR p_message_chars IS NULL
		OR p_message_chars < p_system_prompt_chars
		OR p_approx_prompt_tokens IS NULL
		OR p_approx_prompt_tokens < 1 THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_invalid_payload';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_ownership_lost';
	END IF;

	SELECT artifacts.*
	INTO v_artifact
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = v_turn.input_artifact_id
		AND artifacts.turn_run_id = v_turn.id
		AND artifacts.session_id = v_turn.session_id
		AND artifacts.user_id = v_turn.user_id;

	IF NOT FOUND
		OR v_artifact.artifact_version NOT IN ('agentic_chat_input_v2', 'agentic_chat_input_v3')
		OR jsonb_typeof(v_artifact.history) <> 'array'
		OR jsonb_typeof(v_artifact.prepared) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_artifact_invalid';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(v_artifact.history) history(item)
		WHERE COALESCE(jsonb_typeof(item) <> 'object', true)
			OR COALESCE(item->>'role' NOT IN ('user', 'assistant', 'system', 'tool'), true)
			OR COALESCE(jsonb_typeof(item->'content') <> 'string', true)
			OR COALESCE(item->'attachments' IS DISTINCT FROM '[]'::jsonb, true)
			OR COALESCE(jsonb_typeof(item->'toolCalls') <> 'array', true)
			OR NOT (item ? 'toolCallId')
			OR (
				item->'toolCallId' <> 'null'::jsonb
				AND COALESCE(jsonb_typeof(item->'toolCallId') <> 'string', true)
			)
	) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_artifact_history_invalid';
	END IF;

	v_system_prompt := v_artifact.prepared->>'systemPrompt';
	v_context_payload := v_artifact.prepared->'contextPayload';
	v_prompt_variant := v_turn.request_payload->>'promptVariant';
	IF v_system_prompt IS NULL OR v_system_prompt = ''
		OR COALESCE(jsonb_typeof(v_context_payload) <> 'object', true)
		OR COALESCE(jsonb_typeof(v_artifact.prepared->'promptSections') <> 'array', true)
		OR COALESCE(jsonb_typeof(v_artifact.prepared->'toolSurface') <> 'object', true)
		OR v_prompt_variant IS NULL
		OR v_prompt_variant = ''
		OR v_prompt_variant <> btrim(v_prompt_variant)
		OR char_length(v_prompt_variant) > 128
		OR COALESCE(jsonb_typeof(v_turn.request_payload->'attachments') <> 'array', true)
		OR jsonb_array_length(v_turn.request_payload->'attachments') <> 0
		OR COALESCE(v_turn.request_payload->>'message', '') = '' THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_artifact_prepared_invalid';
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

	v_expected_messages :=
		jsonb_build_array(jsonb_build_object('role', 'system', 'content', v_system_prompt))
		|| v_history_messages
		|| jsonb_build_array(
			jsonb_build_object(
				'role', 'user',
				'content', v_turn.request_payload->>'message'
			)
		);
	IF p_model_messages IS DISTINCT FROM v_expected_messages THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_messages_mismatch';
	END IF;
	IF p_system_prompt_chars < char_length(v_system_prompt)
		OR p_system_prompt_chars > octet_length(v_system_prompt)
		OR p_message_chars < (
			SELECT COALESCE(sum(char_length(item->>'content')), 0)::integer
			FROM jsonb_array_elements(p_model_messages) messages(item)
		)
		OR p_message_chars > (
			SELECT COALESCE(sum(octet_length(item->>'content')), 0)::integer
			FROM jsonb_array_elements(p_model_messages) messages(item)
		) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_size_mismatch';
	END IF;
	IF v_artifact.artifact_version = 'agentic_chat_input_v3'
		AND (
			COALESCE((v_artifact.prepared->'contextUsageSnapshot'->>'estimatedTokens') !~ '^[0-9]+$', true)
			OR (v_artifact.prepared->'contextUsageSnapshot'->>'estimatedTokens')::numeric > 2147483647
			OR (v_artifact.prepared->'contextUsageSnapshot'->>'estimatedTokens')::integer
				IS DISTINCT FROM p_approx_prompt_tokens
		) THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_token_estimate_mismatch';
	END IF;

	v_prompt_sections := jsonb_strip_nulls(
		jsonb_build_object(
			'artifact_version', v_artifact.artifact_version,
			'content_hash', v_artifact.content_hash,
			'history_source', v_artifact.history_source,
			'prompt_variant', v_prompt_variant,
			'source_prepared_prompt_id', v_artifact.source_prepared_prompt_id,
			'surface_profile', v_artifact.prepared->>'surfaceProfile',
			'sections', v_artifact.prepared->'promptSections',
			'tool_surface', v_artifact.prepared->'toolSurface',
			'context_usage', v_artifact.prepared->'contextUsageSnapshot'
		)
	);
	v_created_at := clock_timestamp();

	INSERT INTO public.chat_prompt_snapshots (
		id,
		turn_run_id,
		session_id,
		user_id,
		snapshot_version,
		prompt_variant,
		system_prompt,
		model_messages,
		tool_definitions,
		request_payload,
		prompt_sections,
		context_payload,
		rendered_dump_text,
		system_prompt_sha256,
		messages_sha256,
		tools_sha256,
		system_prompt_chars,
		message_chars,
		approx_prompt_tokens,
		created_at
	) VALUES (
		p_prompt_snapshot_id,
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		'agentic_chat_worker_prompt_v1',
		v_prompt_variant,
		v_system_prompt,
		p_model_messages,
		NULL,
		v_turn.request_payload,
		v_prompt_sections,
		v_context_payload,
		NULL,
		p_system_prompt_sha256,
		p_messages_sha256,
		NULL,
		p_system_prompt_chars,
		p_message_chars,
		p_approx_prompt_tokens,
		v_created_at
	);

	UPDATE public.chat_turn_runs turns
	SET prompt_snapshot_id = p_prompt_snapshot_id,
		updated_at = v_created_at
	WHERE turns.id = v_turn.id
		AND turns.user_id = v_turn.user_id
		AND turns.status = 'running'
		AND turns.execution_generation = v_turn.execution_generation
		AND turns.queue_job_id = v_turn.queue_job_id
		AND turns.prompt_snapshot_id IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_prompt_snapshot_turn_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'persisted',
		'snapshot_available', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'execution_generation', v_turn.execution_generation,
		'status', v_turn.status,
		'prompt_snapshot_id', p_prompt_snapshot_id,
		'snapshot_version', 'agentic_chat_worker_prompt_v1',
		'prompt_variant', v_prompt_variant,
		'system_prompt_sha256', p_system_prompt_sha256,
		'messages_sha256', p_messages_sha256,
		'system_prompt_chars', p_system_prompt_chars,
		'message_chars', p_message_chars,
		'approx_prompt_tokens', p_approx_prompt_tokens,
		'created_at', v_created_at
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_prompt_snapshot(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, text, text, integer, integer, integer
)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_prompt_snapshot(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, text, text, integer, integer, integer
)
	TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_prompt_snapshot(
	uuid, uuid, uuid, uuid, integer, uuid, jsonb, text, text, integer, integer, integer
) IS
	'Service-only, generation-fenced first-response prompt snapshot. Derives metadata from the immutable input artifact and atomically links one exact snapshot without adding a public stream event.';
