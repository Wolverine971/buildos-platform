-- supabase/migrations/20260930051136_chat_cleanup_provider_output_budget_signal.sql
-- Keep capped/pressure attempts observable as well as ordinary attempts.
DO $migration$
DECLARE
  v_body text;
  v_next text;
BEGIN
  SELECT prosrc INTO STRICT v_body FROM pg_catalog.pg_proc
  WHERE oid='public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;
  IF position('agentic_chat_execution_observation_invalid_output_budget_signal' IN v_body)>0 THEN RETURN; END IF;
  v_next := replace(v_body,
    $old$'max_output_tokens', 'reasoning_effort', 'output_budget_recovery'$old$,
    $new$'max_output_tokens', 'reasoning_effort', 'output_budget_recovery', 'output_budget'$new$);
  IF v_next=v_body THEN RAISE EXCEPTION 'chat_cleanup_output_budget_signal_allowlist_unexpected_body'; END IF;
  v_body := v_next;
  v_next := replace(v_body,
    $old$'acting', 'contract_review', 'mutation_review', 'repair', 'final_response'$old$,
    $new$'acting', 'contract_review', 'mutation_review', 'research_review', 'repair', 'final_response'$new$);
  IF v_next=v_body THEN RAISE EXCEPTION 'chat_cleanup_output_budget_pass_role_unexpected_body'; END IF;
  v_body := v_next;
  v_next := replace(v_body,
    $old$	IF p_payload ? 'logical_provider_round' AND ($old$,
    $new$	IF p_payload ? 'output_budget' AND (
    p_phase <> 'provider' OR p_event_type <> 'provider_attempt_ended'
    OR jsonb_typeof(p_payload->'output_budget') IS DISTINCT FROM 'object'
    OR NOT (p_payload->'output_budget' ?& ARRAY['kind','limit','completionTokens','reasoningTokens'])
    OR (p_payload->'output_budget') - ARRAY['kind','limit','completionTokens','reasoningTokens'] <> '{}'::jsonb
    OR jsonb_typeof(p_payload#>'{output_budget,kind}') IS DISTINCT FROM 'string'
    OR p_payload#>>'{output_budget,kind}' NOT IN ('pressure','exhausted')
    OR jsonb_typeof(p_payload#>'{output_budget,limit}') IS DISTINCT FROM 'number'
    OR COALESCE((p_payload#>>'{output_budget,limit}') !~ '^[1-9][0-9]*$',true)
    OR (p_payload#>>'{output_budget,limit}')::numeric > 1000000
    OR EXISTS (SELECT 1 FROM jsonb_each(p_payload->'output_budget') AS field(key,value)
      WHERE field.key IN ('completionTokens','reasoningTokens') AND field.value <> 'null'::jsonb
        AND (jsonb_typeof(field.value) IS DISTINCT FROM 'number'
          OR field.value::text !~ '^[0-9]+$'
          OR field.value::text::numeric > 2147483647))
  ) THEN
    RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_output_budget_signal';
  END IF;
	IF p_payload ? 'logical_provider_round' AND ($new$);
  IF v_next=v_body THEN RAISE EXCEPTION 'chat_cleanup_output_budget_signal_validator_unexpected_body'; END IF;
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
