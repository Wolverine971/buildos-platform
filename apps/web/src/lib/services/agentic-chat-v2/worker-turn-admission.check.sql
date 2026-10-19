-- apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.check.sql
-- Tasker 135: disposable rehearsal only; never run against production.
\set ON_ERROR_STOP on
BEGIN;
ALTER ROLE service_role BYPASSRLS;
INSERT INTO auth.users(id,email) VALUES ('af100000-0000-4000-8000-000000000135','tasker135@example.com');
INSERT INTO public.users(id,email) VALUES ('af100000-0000-4000-8000-000000000135','tasker135@example.com') ON CONFLICT DO NOTHING;

CREATE FUNCTION pg_temp.admit(p_client text, p_session uuid DEFAULT NULL, p_hash text DEFAULT repeat('a',64))
RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.create_agentic_chat_turn_with_job(
  p_user_id => 'af100000-0000-4000-8000-000000000135',
  p_session_id => p_session,
  p_turn_run_id => gen_random_uuid(), p_user_message_id => gen_random_uuid(),
  p_input_artifact_id => gen_random_uuid(), p_stream_run_id => 'stream-' || p_client,
  p_client_turn_id => p_client, p_request_hash => p_hash,
  p_request_hash_version => 'agentic_chat_request_hash_v2',
  p_transport_contract_version => 'agentic_chat_worker_v1',
  p_transport_decision_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
  p_context_type => 'global', p_entity_id => NULL, p_project_id => NULL,
  p_source => 'live_ui', p_gateway_enabled => true, p_request_message => 'Fixture',
  p_request_payload => '{}'::jsonb, p_request_payload_version => 'agentic_chat_request_v1',
  p_user_message_content => 'Fixture', p_user_message_metadata => '{}'::jsonb,
  p_history_limit => 10, p_history_source => 'admission_window',
  p_artifact_history => '[]'::jsonb,
  p_artifact_prepared => '{"sourcePreparedPromptId":null,"contextPayload":{},"conversationSummary":null,"surfaceProfile":"global_basic","systemPrompt":"system","promptSections":[],"toolSurface":{}}'::jsonb,
  p_artifact_content_hash => repeat('c',64), p_artifact_history_bytes => 2,
  p_artifact_content_bytes => 256, p_prepared_prompt_id => NULL,
  p_prepared_context_payload_sha256 => NULL, p_prepared_surface_profile => NULL,
  p_session_agent_metadata => '{"fixture":135}'::jsonb, p_capacity_available => true
 );
$$;
GRANT EXECUTE ON FUNCTION pg_temp.admit(text,uuid,text) TO service_role;
SET LOCAL ROLE service_role;
DO $$
DECLARE
 v jsonb;
 v_retry jsonb;
 v_row jsonb;
 v_session uuid;
 v_rpc regprocedure := 'public.create_agentic_chat_turn_with_job(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,uuid,uuid,text,boolean,text,jsonb,text,text,jsonb,integer,text,jsonb,jsonb,text,integer,integer,uuid,text,text,jsonb,boolean)'::regprocedure;
BEGIN
 v := pg_temp.admit('first');
 SELECT to_jsonb(s) INTO v_row FROM public.chat_sessions s WHERE s.id = (v->>'session_id')::uuid;
 IF v->>'outcome' IS DISTINCT FROM 'newly_admitted' OR v->>'session_created' IS DISTINCT FROM 'true'
  OR v->'session' IS DISTINCT FROM v_row THEN
  RAISE EXCEPTION 'first admission must return the full created session row: receipt %, stored %', v, v_row;
 END IF;
 v_retry := pg_temp.admit('first');
 IF v_retry->>'outcome' IS DISTINCT FROM 'matching_duplicate'
  OR v_retry->>'session_id' IS DISTINCT FROM v->>'session_id'
  OR (SELECT count(*) FROM public.chat_sessions WHERE user_id = 'af100000-0000-4000-8000-000000000135') <> 1 THEN
  RAISE EXCEPTION 'sessionless retry must keep the same session';
 END IF;
 IF pg_temp.admit('first', NULL, repeat('b',64))->>'outcome' IS DISTINCT FROM 'idempotency_conflict' THEN
  RAISE EXCEPTION 'changed retry must still conflict';
 END IF;
 INSERT INTO public.chat_sessions(user_id,context_type,status)
 VALUES ('af100000-0000-4000-8000-000000000135','global','active') RETURNING id INTO v_session;
 v := pg_temp.admit('existing', v_session);
 IF v->>'outcome' IS DISTINCT FROM 'newly_admitted' OR v->>'session_created' IS DISTINCT FROM 'false'
  OR v->>'session' IS NOT NULL THEN
  RAISE EXCEPTION 'existing-session admission must not include a bootstrap row';
 END IF;
 IF has_function_privilege('anon',v_rpc,'EXECUTE') OR has_function_privilege('authenticated',v_rpc,'EXECUTE')
  OR NOT has_function_privilege('service_role',v_rpc,'EXECUTE') THEN
  RAISE EXCEPTION 'admission must remain service-only';
 END IF;
 RAISE NOTICE 'Tasker 135: 5 admission/session assertions passed';
END $$;
ROLLBACK;
