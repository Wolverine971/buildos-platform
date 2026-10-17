-- supabase/migrations/20261017182000_agentic_chat_observation_progress_keys.sql
-- Provider attempt receipts for slow streams and first-content stalls carry
-- progress_window_ms / progress_output_bytes, and truncated tool calls carry
-- tool_call_truncation. The redaction allowlist rejected all three, so those
-- attempts were never recorded (audit 2026-10-17). Allow them, typed.
DO $migration$
DECLARE
  v_body text;
  v_next text;
BEGIN
  SELECT prosrc INTO STRICT v_body FROM pg_catalog.pg_proc
  WHERE oid='public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;
  IF position('agentic_chat_execution_observation_invalid_progress_receipt' IN v_body)>0 THEN RETURN; END IF;
  v_next := replace(v_body,
    $old$'output_budget_recovery', 'output_budget'$old$,
    $new$'output_budget_recovery', 'output_budget',
    'progress_window_ms', 'progress_output_bytes', 'tool_call_truncation'$new$);
  IF v_next=v_body THEN RAISE EXCEPTION 'agentic_chat_observation_progress_allowlist_unexpected_body'; END IF;
  v_body := v_next;
  v_next := replace(v_body,
    $old$	IF p_payload ? 'output_budget' AND ($old$,
    $new$	IF p_payload ?| ARRAY['progress_window_ms','progress_output_bytes','tool_call_truncation'] AND (
    p_phase <> 'provider' OR p_event_type <> 'provider_attempt_ended'
    OR EXISTS (SELECT 1 FROM jsonb_each(p_payload) AS field(key,value)
      WHERE field.key IN ('progress_window_ms','progress_output_bytes')
        AND (jsonb_typeof(field.value) IS DISTINCT FROM 'number'
          OR field.value::text !~ '^[0-9]+(\.[0-9]+)?$'
          OR field.value::text::numeric > 2147483647))
    OR (p_payload ? 'tool_call_truncation'
      AND (jsonb_typeof(p_payload->'tool_call_truncation') IS DISTINCT FROM 'string'
        OR p_payload->>'tool_call_truncation' NOT IN ('finish_reason','arguments')))
  ) THEN
    RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_progress_receipt';
  END IF;
	IF p_payload ? 'output_budget' AND ($new$);
  IF v_next=v_body THEN RAISE EXCEPTION 'agentic_chat_observation_progress_validator_unexpected_body'; END IF;
  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION public.persist_agentic_chat_execution_observation(
      p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid,
      p_processing_token uuid, p_execution_generation integer,
      p_observation_key text, p_phase text, p_event_type text, p_payload jsonb
    ) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
    SET search_path = pg_catalog, public AS %L
  $ddl$,v_next);
END;
$migration$;
REVOKE ALL ON FUNCTION public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb) TO service_role;
