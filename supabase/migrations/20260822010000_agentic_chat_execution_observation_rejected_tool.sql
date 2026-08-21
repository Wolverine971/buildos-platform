-- supabase/migrations/20260822010000_agentic_chat_execution_observation_rejected_tool.sql
-- Let the private provider-attempt ledger name the tool the worker rejected.
--
-- When a pass streams a tool call the worker cannot accept (a name outside the
-- advertised surface, or arguments that are not a JSON object), the durable
-- `provider_attempt_ended` receipt previously retained nothing about which tool
-- was involved. This extension admits two bounded diagnostic keys:
--
--   rejected_tool_name     text | null  — the tool name, only when it matches
--                                         ^[A-Za-z0-9_.:-]{1,256}$; otherwise null
--   advertised_tool_count  integer      — how many tools the request advertised
--
-- Names only. Tool arguments, prompt, response, and message content are still
-- refused at this boundary; the name pattern structurally excludes free text.

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc AS procedures
	WHERE procedures.oid =
		'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;

	IF position('''rejected_tool_name''' IN v_body) > 0 THEN
		RAISE NOTICE 'agentic_chat_execution_observation_rejected_tool already applied';
		RETURN;
	END IF;

	v_next := replace(
		v_body,
		$old$		'status', 'duration_ms', 'provider_timing', 'finish_reason', 'error_class', 'usage'$old$,
		$new$		'status', 'duration_ms', 'provider_timing', 'finish_reason', 'error_class', 'usage',
		'rejected_tool_name', 'advertised_tool_count'$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_rejected_tool_allowlist_unexpected_body';
	END IF;
	v_body := v_next;

	-- Both keys travel together on a completed provider attempt. The name is
	-- bounded to a tool-identifier token so argument or message text can never
	-- ride in under this key.
	v_next := replace(
		v_body,
		$old$	IF p_payload ? 'duration_ms' AND ($old$,
		$new$	IF (p_payload ? 'rejected_tool_name' OR p_payload ? 'advertised_tool_count') AND (
		p_event_type <> 'provider_attempt_ended'
		OR NOT (p_payload ?& ARRAY['rejected_tool_name', 'advertised_tool_count'])
		OR (
			p_payload->'rejected_tool_name' IS DISTINCT FROM 'null'::jsonb
			AND (
				jsonb_typeof(p_payload->'rejected_tool_name') <> 'string'
				OR (p_payload->>'rejected_tool_name') !~ '^[A-Za-z0-9_.:-]{1,256}$'
			)
		)
		OR jsonb_typeof(p_payload->'advertised_tool_count') <> 'number'
		OR COALESCE((p_payload->>'advertised_tool_count') !~ '^[0-9]+$', true)
		OR (p_payload->>'advertised_tool_count')::numeric > 1000
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_rejected_tool';
	END IF;
	IF p_payload ? 'duration_ms' AND ($new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_rejected_tool_validation_missing';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.persist_agentic_chat_execution_observation(p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_observation_key text, p_phase text, p_event_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

COMMENT ON FUNCTION public.persist_agentic_chat_execution_observation(
	uuid, uuid, uuid, uuid, integer, text, text, text, jsonb
) IS
	'Persists generation-fenced redacted worker lifecycle evidence, including bounded provider usage counters, provider-attempt deadline timing, and the name (never the arguments) of a tool call the worker rejected.';
