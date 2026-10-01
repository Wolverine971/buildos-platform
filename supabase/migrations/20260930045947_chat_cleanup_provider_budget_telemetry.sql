-- supabase/migrations/20260930045947_chat_cleanup_provider_budget_telemetry.sql
-- Budget/recovery metadata already emitted by the worker was rejected by the
-- private observation allowlist, silently losing attempt receipts and pass counts.
DO $migration$
DECLARE
  v_body text;
  v_next text;
BEGIN
  SELECT prosrc INTO STRICT v_body FROM pg_catalog.pg_proc
  WHERE oid = 'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;
  IF position('agentic_chat_execution_observation_invalid_output_budget' IN v_body) > 0 THEN
    RETURN;
  END IF;
  v_next := replace(v_body,
    $old$'rejected_tool_name', 'advertised_tool_count'
	] <> '{}'::jsonb THEN$old$,
    $new$'rejected_tool_name', 'advertised_tool_count',
    'max_output_tokens', 'reasoning_effort', 'output_budget_recovery'
	] <> '{}'::jsonb THEN$new$);
  IF v_next = v_body THEN
    RAISE EXCEPTION 'chat_cleanup_provider_budget_allowlist_unexpected_body';
  END IF;
  v_body := v_next;
  v_next := replace(v_body,
    $old$	IF p_payload ? 'logical_provider_round' AND ($old$,
    $new$	IF (p_payload ? 'max_output_tokens' OR p_payload ? 'reasoning_effort'
    OR p_payload ? 'output_budget_recovery') AND (
    p_phase <> 'provider'
    OR p_event_type NOT IN ('provider_attempt_started', 'provider_attempt_ended')
    OR (p_payload ? 'max_output_tokens' AND (
      jsonb_typeof(p_payload->'max_output_tokens') IS DISTINCT FROM 'number'
      OR COALESCE((p_payload->>'max_output_tokens') !~ '^[1-9][0-9]*$', true)
      OR (p_payload->>'max_output_tokens')::numeric > 1000000
    ))
    OR (p_payload ? 'reasoning_effort' AND (
      jsonb_typeof(p_payload->'reasoning_effort') IS DISTINCT FROM 'string'
      OR p_payload->>'reasoning_effort' NOT IN ('default', 'low', 'none')
    ))
    OR (p_payload ? 'output_budget_recovery' AND
      jsonb_typeof(p_payload->'output_budget_recovery') IS DISTINCT FROM 'boolean')
  ) THEN
    RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_output_budget';
  END IF;
	IF p_payload ? 'logical_provider_round' AND ($new$);
  IF v_next = v_body THEN
    RAISE EXCEPTION 'chat_cleanup_provider_budget_validation_unexpected_body';
  END IF;
  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION public.persist_agentic_chat_execution_observation(
      p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid,
      p_processing_token uuid, p_execution_generation integer,
      p_observation_key text, p_phase text, p_event_type text, p_payload jsonb
    ) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
    SET search_path = pg_catalog, public AS %L
  $ddl$, v_next);
END;
$migration$;
REVOKE ALL ON FUNCTION public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb) TO service_role;
