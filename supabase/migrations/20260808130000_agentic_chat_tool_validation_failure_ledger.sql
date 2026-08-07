-- supabase/migrations/20260808130000_agentic_chat_tool_validation_failure_ledger.sql
-- Persist provider tool calls rejected by shared validation before execution.
-- These rows preserve legacy read-loop observability without allowing an
-- invalid call to reach the read adapter. The success-only read RPC remains
-- unchanged so its existing payload and replay contract stay narrow.

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_tool_validation_failure(
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
	p_error_message text
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
		RAISE EXCEPTION 'agentic_chat_tool_validation_failure_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_tool_validation_failure_invalid_identity';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_tool_validation_failure_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_tool_validation_failure_scope_mismatch';
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
		RAISE EXCEPTION 'agentic_chat_tool_validation_failure_not_started';
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
		RAISE EXCEPTION 'agentic_chat_tool_validation_failure_ownership_lost';
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
		))
		OR p_arguments IS NULL OR jsonb_typeof(p_arguments) <> 'object'
		OR pg_column_size(p_arguments) > 262144
		OR p_error_message IS NULL
		OR p_error_message IS DISTINCT FROM btrim(p_error_message)
		OR p_error_message = '' OR length(p_error_message) > 4000 THEN
		RAISE EXCEPTION 'agentic_chat_tool_validation_failure_invalid_payload';
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
			OR v_existing.result IS NOT NULL
			OR v_existing.result_count IS NOT NULL
			OR v_existing.zero_result IS NOT NULL
			OR v_existing.execution_time_ms IS NOT NULL
			OR v_existing.tokens_consumed IS NOT NULL
			OR v_existing.success IS DISTINCT FROM false
			OR v_existing.error_message IS DISTINCT FROM p_error_message
			OR v_existing.requires_user_action IS NOT NULL
			OR v_existing.affected_entities IS DISTINCT FROM '[]'::jsonb THEN
			RAISE EXCEPTION 'agentic_chat_tool_validation_failure_replay_conflict';
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
		NULL, NULL, p_sequence_index, p_arguments, NULL, NULL, NULL, NULL, NULL,
		false, p_error_message, NULL, '[]'::jsonb, v_created_at
	);

	UPDATE public.chat_turn_runs turns
	SET last_progress_at = v_created_at,
		updated_at = v_created_at
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_tool_validation_failure_compare_and_set_lost';
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

REVOKE ALL ON FUNCTION public.persist_agentic_chat_tool_validation_failure(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_tool_validation_failure(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, text
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_tool_validation_failure(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, text
) IS
'Fenced, idempotent worker ledger write for a provider tool call rejected by validation before execution.';
