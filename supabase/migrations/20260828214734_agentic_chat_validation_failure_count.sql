-- Count only provider tool calls rejected by shared validation. The historical
-- persistence RPC is also used for known mutation failures, supervisor blocks,
-- and dependency skips, so changing it in place would corrupt the aggregate
-- while an older worker release is still serving traffic.

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_counted_tool_validation_failure(
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
	v_receipt jsonb;
BEGIN
	v_receipt := public.persist_agentic_chat_tool_validation_failure(
		p_turn_run_id,
		p_user_id,
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		p_tool_execution_id,
		p_sequence_index,
		p_provider_tool_call_id,
		p_tool_name,
		p_tool_category,
		p_arguments,
		p_error_message
	);

	IF v_receipt->>'outcome' = 'persisted' THEN
		UPDATE public.chat_turn_runs turns
		SET validation_failure_count = turns.validation_failure_count + 1
		WHERE turns.id = p_turn_run_id
			AND turns.status = 'running'
			AND turns.execution_generation = p_execution_generation;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_validation_failure_count_compare_and_set_lost';
		END IF;
	END IF;

	RETURN v_receipt;
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_counted_tool_validation_failure(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_counted_tool_validation_failure(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, text
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_counted_tool_validation_failure(
	uuid, uuid, uuid, uuid, integer, uuid, integer, text, text, text, jsonb, text
) IS
'Fenced, idempotent worker ledger write that increments validation_failure_count exactly once for a provider tool call rejected before execution.';
