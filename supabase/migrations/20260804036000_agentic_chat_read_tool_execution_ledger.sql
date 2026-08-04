-- supabase/migrations/20260804036000_agentic_chat_read_tool_execution_ledger.sql
-- Agentic Chat Worker, Phase 4 Slice 10: generation-fenced, replay-safe
-- persistence for one completed read-only tool execution.

BEGIN;

GRANT SELECT, INSERT, UPDATE ON TABLE public.chat_tool_executions TO service_role;

-- Terminal message ownership is decided by the finalizer. Attach every
-- already-persisted tool row only after the assistant message wins the same
-- terminal transaction, and derive the legacy-compatible turn counters from
-- the durable rows instead of trusting worker metadata.
DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid =
		'public.finalize_agentic_chat_turn(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,jsonb,integer,integer,integer,jsonb,jsonb)'::regprocedure;

	v_next := replace(
		v_body,
		$old$	v_message_metadata jsonb;
	v_authoritative_message_metadata jsonb;$old$,
		$new$	v_message_metadata jsonb;
	v_tool_round_count integer;
	v_tool_call_count integer;
	v_authoritative_message_metadata jsonb;$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_ledger_unexpected_finalizer_declarations';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	v_message_metadata := COALESCE(p_assistant_metadata, '{}'::jsonb);
	v_projection := COALESCE(p_projection, '{}'::jsonb);$old$,
		$new$	v_message_metadata := COALESCE(p_assistant_metadata, '{}'::jsonb);
	IF (v_message_metadata ? 'tool_round_count' AND (
		jsonb_typeof(v_message_metadata->'tool_round_count') <> 'number'
		OR v_message_metadata->>'tool_round_count' !~ '^[0-9]+$'
		OR length(v_message_metadata->>'tool_round_count') > 4
	)) OR (v_message_metadata ? 'tool_call_count' AND (
		jsonb_typeof(v_message_metadata->'tool_call_count') <> 'number'
		OR v_message_metadata->>'tool_call_count' !~ '^[0-9]+$'
		OR length(v_message_metadata->>'tool_call_count') > 4
	)) THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
	END IF;
	SELECT count(*)::integer
	INTO v_tool_call_count
	FROM public.chat_tool_executions executions
	WHERE executions.turn_run_id = v_turn.id;
	IF v_tool_call_count > 1024 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
	END IF;
	v_tool_round_count := CASE WHEN v_tool_call_count > 0 THEN 1 ELSE 0 END;
	v_message_metadata := v_message_metadata || jsonb_build_object(
		'tool_round_count', v_tool_round_count,
		'tool_call_count', v_tool_call_count
	);
	v_projection := COALESCE(p_projection, '{}'::jsonb);$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_ledger_unexpected_finalizer_metadata';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$		v_message_id := v_message.id;
	END IF;

	v_projection := v_projection || jsonb_build_object($old$,
		$new$		v_message_id := v_message.id;
		UPDATE public.chat_tool_executions executions
		SET message_id = v_message_id
		WHERE executions.turn_run_id = v_turn.id
			AND executions.session_id = v_turn.session_id
			AND executions.message_id IS NULL;
	END IF;

	v_projection := v_projection || jsonb_build_object($new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_ledger_unexpected_finalizer_attachment';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	SET status = p_status,
		assistant_message_id = v_message_id,
		finished_reason = p_finished_reason,$old$,
		$new$	SET status = p_status,
		assistant_message_id = v_message_id,
		tool_round_count = v_tool_round_count,
		tool_call_count = v_tool_call_count,
		finished_reason = p_finished_reason,$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_ledger_unexpected_finalizer_turn_counts';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
		CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn(
			p_turn_run_id uuid,
			p_user_id uuid,
			p_queue_job_id uuid,
			p_processing_token uuid,
			p_execution_generation integer,
			p_status text,
			p_finished_reason text,
			p_failure_code text,
			p_assistant_message_id uuid,
			p_assistant_text text,
			p_assistant_metadata jsonb,
			p_prompt_tokens integer,
			p_completion_tokens integer,
			p_total_tokens integer,
			p_projection jsonb,
			p_event_payload jsonb
		)
		RETURNS jsonb
		LANGUAGE plpgsql
		SECURITY INVOKER
		SET search_path = pg_catalog, public
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_read_tool_execution(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_tool_execution_id uuid,
	p_sequence_index integer,
	p_provider_tool_call_id text,
	p_tool_name text,
	p_tool_category text,
	p_arguments jsonb,
	p_result jsonb,
	p_result_count integer,
	p_zero_result boolean,
	p_execution_time_ms integer,
	p_tokens_consumed integer,
	p_requires_user_action boolean,
	p_affected_entities jsonb
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
	v_existing public.chat_tool_executions%ROWTYPE;
	v_created_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_invalid_identity';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_scope_mismatch';
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation
		);
	END IF;
	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation
		);
	END IF;
	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation
		);
	END IF;
	IF v_turn.status <> 'running' OR v_turn.execution_started_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_not_started';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;
	IF NOT FOUND OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_ownership_lost';
	END IF;

	IF p_tool_execution_id IS NULL OR p_sequence_index IS NULL
		OR p_sequence_index < 1 OR p_sequence_index > 1024
		OR p_provider_tool_call_id IS NULL
		OR p_provider_tool_call_id IS DISTINCT FROM btrim(p_provider_tool_call_id)
		OR p_provider_tool_call_id = '' OR length(p_provider_tool_call_id) > 512
		OR p_tool_name IS NULL OR p_tool_name IS DISTINCT FROM btrim(p_tool_name)
		OR p_tool_name = '' OR length(p_tool_name) > 256
		OR (p_tool_category IS NOT NULL AND (
			p_tool_category IS DISTINCT FROM btrim(p_tool_category)
			OR p_tool_category = '' OR length(p_tool_category) > 128
		)) OR p_arguments IS NULL OR jsonb_typeof(p_arguments) <> 'object'
		OR p_result IS NULL
		OR jsonb_typeof(p_result) <> 'object'
		OR p_affected_entities IS NULL
		OR jsonb_typeof(p_affected_entities) <> 'array'
		OR pg_column_size(p_arguments) > 262144
		OR pg_column_size(p_result) > 524288
		OR pg_column_size(p_affected_entities) > 262144
		OR COALESCE(p_result_count, 0) < 0
		OR COALESCE(p_execution_time_ms, 0) < 0
		OR COALESCE(p_tokens_consumed, 0) < 0 THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_invalid_payload';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_affected_entities) entities(value)
		WHERE jsonb_typeof(entities.value) <> 'object'
	) OR (p_result_count IS NULL) IS DISTINCT FROM (p_zero_result IS NULL)
		OR (
			p_result_count IS NOT NULL
			AND p_zero_result IS DISTINCT FROM (p_result_count = 0)
		) THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_invalid_payload';
	END IF;

	SELECT executions.*
	INTO v_existing
	FROM public.chat_tool_executions executions
	WHERE executions.id = p_tool_execution_id
		OR (
			executions.turn_run_id = v_turn.id
			AND executions.provider_tool_call_id = p_provider_tool_call_id
		)
	ORDER BY (executions.id = p_tool_execution_id) DESC
	LIMIT 1
	FOR UPDATE;
	IF FOUND THEN
		IF v_existing.id IS DISTINCT FROM p_tool_execution_id
			OR v_existing.session_id IS DISTINCT FROM v_turn.session_id
			OR v_existing.turn_run_id IS DISTINCT FROM v_turn.id
			OR v_existing.stream_run_id IS DISTINCT FROM v_turn.stream_run_id
			OR v_existing.client_turn_id IS DISTINCT FROM v_turn.client_turn_id
			OR v_existing.provider_tool_call_id IS DISTINCT FROM p_provider_tool_call_id
			OR v_existing.tool_name IS DISTINCT FROM p_tool_name
			OR v_existing.tool_category IS DISTINCT FROM p_tool_category
			OR v_existing.sequence_index IS DISTINCT FROM p_sequence_index
			OR v_existing.arguments IS DISTINCT FROM p_arguments
			OR v_existing.result IS DISTINCT FROM p_result
			OR v_existing.result_count IS DISTINCT FROM p_result_count
			OR v_existing.zero_result IS DISTINCT FROM p_zero_result
			OR v_existing.execution_time_ms IS DISTINCT FROM p_execution_time_ms
			OR v_existing.tokens_consumed IS DISTINCT FROM p_tokens_consumed
			OR v_existing.success IS DISTINCT FROM true
			OR v_existing.error_message IS NOT NULL
			OR v_existing.requires_user_action IS DISTINCT FROM p_requires_user_action
			OR v_existing.affected_entities IS DISTINCT FROM p_affected_entities THEN
			RAISE EXCEPTION 'agentic_chat_read_tool_execution_replay_conflict';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_persisted',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', v_turn.execution_generation,
			'tool_execution_id', v_existing.id,
			'sequence_index', v_existing.sequence_index,
			'provider_tool_call_id', v_existing.provider_tool_call_id,
			'tool_name', v_existing.tool_name,
			'message_id', v_existing.message_id,
			'created_at', v_existing.created_at
		);
	END IF;

	v_created_at := transaction_timestamp();
	INSERT INTO public.chat_tool_executions (
		id, session_id, message_id, turn_run_id, stream_run_id, client_turn_id,
		provider_tool_call_id, tool_name, tool_category, gateway_op, help_path,
		sequence_index, arguments, result, result_count, zero_result,
		execution_time_ms, tokens_consumed, success, error_message,
		requires_user_action, affected_entities, created_at
	) VALUES (
		p_tool_execution_id, v_turn.session_id, NULL, v_turn.id, v_turn.stream_run_id,
		v_turn.client_turn_id, p_provider_tool_call_id, p_tool_name, p_tool_category,
		NULL, NULL, p_sequence_index, p_arguments, p_result, p_result_count,
		p_zero_result, p_execution_time_ms, p_tokens_consumed, true, NULL,
		p_requires_user_action, p_affected_entities, v_created_at
	);

	UPDATE public.chat_turn_runs turns
	SET last_progress_at = v_created_at,
		updated_at = v_created_at
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_read_tool_execution_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'persisted',
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'execution_generation', v_turn.execution_generation,
		'tool_execution_id', p_tool_execution_id,
		'sequence_index', p_sequence_index,
		'provider_tool_call_id', p_provider_tool_call_id,
		'tool_name', p_tool_name,
		'message_id', NULL,
		'created_at', v_created_at
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_read_tool_execution(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text,
	jsonb, jsonb, integer, boolean, integer, integer, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_read_tool_execution(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text,
	jsonb, jsonb, integer, boolean, integer, integer, boolean, jsonb
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_read_tool_execution(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text,
	jsonb, jsonb, integer, boolean, integer, integer, boolean, jsonb
) IS
	'Service-only worker read-tool ledger write. Fences current generation/queue ownership, persists one deterministic execution row, and replays only exact content.';

COMMIT;
