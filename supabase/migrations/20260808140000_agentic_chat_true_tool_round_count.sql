-- supabase/migrations/20260808140000_agentic_chat_true_tool_round_count.sql
-- Agentic Chat Worker, Phase 4 Slice 18 S5: preserve the executor's true
-- provider tool-round count while keeping tool-call count ledger-derived.

BEGIN;

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
		$old$	v_tool_round_count := CASE WHEN v_tool_call_count > 0 THEN 1 ELSE 0 END;$old$,
		$new$	IF v_tool_call_count = 0 THEN
		v_tool_round_count := COALESCE((v_message_metadata->>'tool_round_count')::integer, 0);
		IF v_tool_round_count <> 0 THEN
			RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
		END IF;
	ELSIF NOT (v_message_metadata ? 'tool_round_count') THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
	ELSE
		v_tool_round_count := (v_message_metadata->>'tool_round_count')::integer;
		IF v_tool_round_count > v_tool_call_count THEN
			RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
		ELSIF v_tool_round_count = 0 THEN
			-- A cancelled/failed worker may lose the response to the fenced ledger
			-- write that committed immediately before interruption. Completion has
			-- no such ambiguity and must always carry the exact executor count.
			IF p_status = 'completed' THEN
				RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
			END IF;
			v_tool_round_count := 1;
		END IF;
	END IF;$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_true_tool_round_count_unexpected_finalizer';
	END IF;

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
		v_next
	);
END;
$migration$;

COMMENT ON FUNCTION public.finalize_agentic_chat_turn(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb
) IS
'Atomically finalizes an Agentic Chat worker turn with ledger-derived tool-call count and validated executor-owned tool-round count.';

COMMIT;
