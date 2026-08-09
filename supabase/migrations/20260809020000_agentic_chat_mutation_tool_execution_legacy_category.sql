-- Agentic Chat Worker, Phase 4 P2 Slice 2: preserve the legacy mutation
-- category while retaining the Slice 1 effect-linked receipt fence.
--
-- The two-sided update_onto_task golden proved that legacy writes use the
-- deployed ontology_action category. Production mutations remain disabled.

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_mutation_tool_execution(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_effect_id uuid,
	p_canonical_argument_hash text,
	p_tool_execution_id uuid,
	p_sequence_index integer,
	p_provider_tool_call_id text,
	p_tool_name text,
	p_operation_name text,
	p_arguments jsonb,
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
	v_effect public.chat_turn_effects%ROWTYPE;
	v_existing public.chat_tool_executions%ROWTYPE;
	v_created_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL OR p_execution_generation IS NULL
		OR p_execution_generation < 1 OR p_effect_id IS NULL
		OR p_canonical_argument_hash IS NULL
		OR p_canonical_argument_hash !~ '^[0-9a-f]{64}$' THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_invalid_identity';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_scope_mismatch';
	END IF;

	SELECT effects.*
	INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_effect_not_found';
	END IF;
	IF v_effect.turn_run_id IS DISTINCT FROM v_turn.id
		OR v_effect.session_id IS DISTINCT FROM v_turn.session_id
		OR v_effect.user_id IS DISTINCT FROM v_turn.user_id
		OR v_effect.tool_name IS DISTINCT FROM p_tool_name
		OR v_effect.operation_name IS DISTINCT FROM p_operation_name
		OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_effect_conflict'
			USING ERRCODE = '23505';
	END IF;
	IF v_effect.state <> 'succeeded'
		OR v_effect.downstream_receipt IS NULL
		OR jsonb_typeof(v_effect.downstream_receipt) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_effect_not_succeeded';
	END IF;

	IF p_tool_execution_id IS NULL OR p_sequence_index IS NULL
		OR p_sequence_index < 1 OR p_sequence_index > 1024
		OR p_provider_tool_call_id IS NULL
		OR p_provider_tool_call_id IS DISTINCT FROM btrim(p_provider_tool_call_id)
		OR p_provider_tool_call_id = '' OR length(p_provider_tool_call_id) > 512
		OR p_tool_name IS NULL OR p_tool_name IS DISTINCT FROM btrim(p_tool_name)
		OR p_tool_name = '' OR length(p_tool_name) > 256
		OR p_operation_name IS NULL OR p_operation_name IS DISTINCT FROM btrim(p_operation_name)
		OR p_operation_name = '' OR length(p_operation_name) > 256
		OR p_arguments IS NULL OR jsonb_typeof(p_arguments) <> 'object'
		OR p_affected_entities IS NULL OR jsonb_typeof(p_affected_entities) <> 'array'
		OR pg_column_size(p_arguments) > 262144
		OR pg_column_size(v_effect.downstream_receipt) > 524288
		OR pg_column_size(p_affected_entities) > 262144
		OR COALESCE(p_execution_time_ms, 0) < 0
		OR COALESCE(p_tokens_consumed, 0) < 0 THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_invalid_payload';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_affected_entities) entities(value)
		WHERE jsonb_typeof(entities.value) <> 'object'
	) THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_invalid_payload';
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
			OR v_existing.tool_category IS DISTINCT FROM 'ontology_action'
			OR v_existing.gateway_op IS DISTINCT FROM p_operation_name
			OR v_existing.effect_id IS DISTINCT FROM p_effect_id
			OR v_existing.sequence_index IS DISTINCT FROM p_sequence_index
			OR v_existing.arguments IS DISTINCT FROM p_arguments
			OR v_existing.result IS DISTINCT FROM v_effect.downstream_receipt
			OR v_existing.result_count IS NOT NULL
			OR v_existing.zero_result IS NOT NULL
			OR v_existing.execution_time_ms IS DISTINCT FROM p_execution_time_ms
			OR v_existing.tokens_consumed IS DISTINCT FROM p_tokens_consumed
			OR v_existing.success IS DISTINCT FROM true
			OR v_existing.error_message IS NOT NULL
			OR v_existing.requires_user_action IS DISTINCT FROM p_requires_user_action
			OR v_existing.affected_entities IS DISTINCT FROM p_affected_entities THEN
			RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_replay_conflict';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_persisted',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'execution_generation', p_execution_generation,
			'tool_execution_id', v_existing.id,
			'effect_id', v_existing.effect_id,
			'sequence_index', v_existing.sequence_index,
			'provider_tool_call_id', v_existing.provider_tool_call_id,
			'tool_name', v_existing.tool_name,
			'message_id', v_existing.message_id,
			'created_at', v_existing.created_at
		);
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
	IF v_turn.status <> 'running' OR v_turn.execution_started_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_not_started';
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
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_ownership_lost';
	END IF;

	v_created_at := transaction_timestamp();
	INSERT INTO public.chat_tool_executions (
		id, session_id, message_id, turn_run_id, stream_run_id, client_turn_id,
		provider_tool_call_id, tool_name, tool_category, gateway_op, help_path,
		sequence_index, arguments, result, result_count, zero_result,
		execution_time_ms, tokens_consumed, success, error_message,
		requires_user_action, affected_entities, effect_id, created_at
	) VALUES (
		p_tool_execution_id, v_turn.session_id, NULL, v_turn.id, v_turn.stream_run_id,
		v_turn.client_turn_id, p_provider_tool_call_id, p_tool_name, 'ontology_action',
		p_operation_name, NULL, p_sequence_index, p_arguments,
		v_effect.downstream_receipt, NULL, NULL, p_execution_time_ms,
		p_tokens_consumed, true, NULL, p_requires_user_action,
		p_affected_entities, p_effect_id, v_created_at
	);

	UPDATE public.chat_turn_runs turns
	SET last_progress_at = v_created_at,
		updated_at = v_created_at
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_mutation_tool_execution_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'persisted',
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'execution_generation', v_turn.execution_generation,
		'tool_execution_id', p_tool_execution_id,
		'effect_id', p_effect_id,
		'sequence_index', p_sequence_index,
		'provider_tool_call_id', p_provider_tool_call_id,
		'tool_name', p_tool_name,
		'message_id', NULL,
		'created_at', v_created_at
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_mutation_tool_execution(
	uuid, uuid, uuid, uuid, integer, uuid, text, uuid, integer, text, text,
	text, jsonb, integer, integer, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_mutation_tool_execution(
	uuid, uuid, uuid, uuid, integer, uuid, text, uuid, integer, text, text,
	text, jsonb, integer, integer, boolean, jsonb
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_mutation_tool_execution(
	uuid, uuid, uuid, uuid, integer, uuid, text, uuid, integer, text, text,
	text, jsonb, integer, integer, boolean, jsonb
) IS
	'Service-only worker mutation telemetry. Requires a matching succeeded effect, preserves legacy mutation category ontology_action, fences current ownership for new rows, and replays only exact effect-linked content.';

COMMIT;
