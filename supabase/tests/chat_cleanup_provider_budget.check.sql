-- supabase/tests/chat_cleanup_provider_budget.check.sql
-- Disposable rehearsal only; never run against a linked database.
\ir fixtures/tasker114_terminal_timing.sql
INSERT INTO auth.users(id,email) VALUES ('fa100000-0000-4000-8000-000000000001','budget-fixture@example.com') ON CONFLICT DO NOTHING;
INSERT INTO public.users(id,email) VALUES ('fa100000-0000-4000-8000-000000000001','budget-fixture@example.com') ON CONFLICT DO NOTHING;
SELECT pg_temp.seed_timing_turn(
  'fc114000-0000-4000-8000-000000000101','fc114000-0000-4000-8000-000000000102',
  'fc114000-0000-4000-8000-000000000103','fc114000-0000-4000-8000-000000000104',
  'fc114000-0000-4000-8000-000000000105','cleanup-provider-budget',2,true,false);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
DO $$
DECLARE
  payload jsonb := '{"round":"synthesis","logical_provider_round":3,"pass_role":"acting","provider_attempt":2,"attempt_kind":"retry","route_id":"openrouter","model_requested":"fixture/model","max_output_tokens":18000,"reasoning_effort":"none","output_budget_recovery":true}';
  receipt jsonb;
  invalid jsonb;
BEGIN
  ASSERT NOT has_function_privilege('authenticated','public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)','EXECUTE');
  receipt := public.persist_agentic_chat_provider_attempt_observation(
    'fc114000-0000-4000-8000-000000000101','fa100000-0000-4000-8000-000000000001',
    'fc114000-0000-4000-8000-000000000102','fc114000-0000-4000-8000-000000000103',1,
    repeat('a',64),'provider','provider_attempt_started',payload);
  ASSERT receipt->>'outcome' = 'persisted';
  payload := payload || '{"status":"success","duration_ms":25,"finish_reason":"tool_calls","output_budget":{"kind":"pressure","limit":18000,"completionTokens":16000,"reasoningTokens":12000}}';
  receipt := public.persist_agentic_chat_provider_attempt_observation(
    'fc114000-0000-4000-8000-000000000101','fa100000-0000-4000-8000-000000000001',
    'fc114000-0000-4000-8000-000000000102','fc114000-0000-4000-8000-000000000103',1,
    repeat('b',64),'provider','provider_attempt_ended',payload);
  ASSERT receipt->>'outcome' = 'persisted';
  ASSERT (SELECT llm_pass_count = 1 FROM public.chat_turn_runs WHERE id='fc114000-0000-4000-8000-000000000101');
  receipt := public.persist_agentic_chat_provider_attempt_observation(
    'fc114000-0000-4000-8000-000000000101','fa100000-0000-4000-8000-000000000001',
    'fc114000-0000-4000-8000-000000000102','fc114000-0000-4000-8000-000000000103',1,
    repeat('b',64),'provider','provider_attempt_ended',payload);
  ASSERT receipt->>'outcome' = 'already_persisted';
  FOREACH invalid IN ARRAY ARRAY[
    payload || '{"output_budget":null}', payload || '{"output_budget":{"kind":"exhausted","limit":18000}}',
    payload || '{"output_budget":{"kind":"exhausted","limit":18000,"completionTokens":-1,"reasoningTokens":null}}',
    payload || '{"output_budget":{"kind":"exhausted","limit":18000,"completionTokens":"private","reasoningTokens":null}}',
    payload || '{"output_budget":{"kind":"exhausted","limit":18000,"completionTokens":1,"reasoningTokens":null,"prompt":"private"}}'
  ] LOOP
    BEGIN
      PERFORM public.persist_agentic_chat_provider_attempt_observation(
        'fc114000-0000-4000-8000-000000000101','fa100000-0000-4000-8000-000000000001',
        'fc114000-0000-4000-8000-000000000102','fc114000-0000-4000-8000-000000000103',1,
        repeat('c',64),'provider','provider_attempt_ended',invalid);
      RAISE EXCEPTION 'invalid output budget signal accepted';
    EXCEPTION WHEN OTHERS THEN
      ASSERT SQLERRM = 'agentic_chat_execution_observation_invalid_output_budget_signal' OR SQLERRM LIKE 'invalid input syntax for type numeric:%';
    END;
  END LOOP;
  FOREACH invalid IN ARRAY ARRAY[
    payload || '{"max_output_tokens":null}', payload || '{"max_output_tokens":0}',
    payload || '{"max_output_tokens":"18000"}', payload || '{"max_output_tokens":1.5}',
    payload || '{"max_output_tokens":1000001}', payload || '{"reasoning_effort":null}',
    payload || '{"reasoning_effort":"some private prompt"}',
    payload || '{"output_budget_recovery":"true"}', payload || '{"output_budget_recovery":null}'
  ] LOOP
    BEGIN
      PERFORM public.persist_agentic_chat_provider_attempt_observation(
        'fc114000-0000-4000-8000-000000000101','fa100000-0000-4000-8000-000000000001',
        'fc114000-0000-4000-8000-000000000102','fc114000-0000-4000-8000-000000000103',1,
        repeat('c',64),'provider','provider_attempt_ended',invalid);
      RAISE EXCEPTION 'invalid budget metadata accepted';
    EXCEPTION WHEN OTHERS THEN
      ASSERT SQLERRM = 'agentic_chat_execution_observation_invalid_output_budget';
    END;
  END LOOP;
  BEGIN
    PERFORM public.persist_agentic_chat_provider_attempt_observation(
      'fc114000-0000-4000-8000-000000000101','fa100000-0000-4000-8000-000000000001',
      'fc114000-0000-4000-8000-000000000102','fc114000-0000-4000-8000-000000000103',1,
      repeat('d',64),'provider','provider_attempt_ended',payload || '{"prompt":"secret"}');
    RAISE EXCEPTION 'private content accepted';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM = 'agentic_chat_execution_observation_payload_not_redacted';
  END;
  ASSERT (SELECT llm_pass_count = 1 FROM public.chat_turn_runs WHERE id='fc114000-0000-4000-8000-000000000101');
  receipt := public.persist_agentic_chat_provider_attempt_observation(
    'fc114000-0000-4000-8000-000000000101','fa100000-0000-4000-8000-000000000001',
    'fc114000-0000-4000-8000-000000000102','fc114000-0000-4000-8000-000000000103',1,
    repeat('e',64),'provider','provider_attempt_ended',
    payload || '{"pass_role":"research_review","provider_attempt":1,"attempt_kind":"primary","output_budget":{"kind":"exhausted","limit":18000,"completionTokens":null,"reasoningTokens":null}}');
  ASSERT receipt->>'outcome'='persisted';
  ASSERT (SELECT llm_pass_count=2 FROM public.chat_turn_runs WHERE id='fc114000-0000-4000-8000-000000000101');
END;
$$;
SELECT 'chat_cleanup_provider_budget_ok';
