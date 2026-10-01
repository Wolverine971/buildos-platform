-- supabase/tests/chat_cleanup_failed_partial_receipt.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
\ir fixtures/tasker114_terminal_timing.sql
INSERT INTO auth.users (id,email) VALUES ('fa100000-0000-4000-8000-000000000001','failed-partial@example.com');
INSERT INTO public.users (id,email) VALUES ('fa100000-0000-4000-8000-000000000001','failed-partial@example.com') ON CONFLICT DO NOTHING;
DO $$
DECLARE
  metadata jsonb := '{"completion_status":"failed","answer_source":"harness","failure_disclosure_version":1,"completion_receipt":{"version":1,"request":{"disposition":"request_uncertain"},"stages":[{"executedCallIds":["saved-call"]}],"unreviewedWriteCallIds":[]}}';
BEGIN
  ASSERT NOT has_function_privilege('authenticated','public.agentic_chat_failed_partial_receipt_valid(text,text,text,jsonb)','EXECUTE');
  ASSERT public.agentic_chat_failed_partial_receipt_valid('failed','uncertain_external_commit','Saved receipt',metadata);
  ASSERT NOT public.agentic_chat_failed_partial_receipt_valid('failed','permanent','Saved receipt',metadata);
  ASSERT NOT public.agentic_chat_failed_partial_receipt_valid('failed','uncertain_external_commit','',metadata);
  ASSERT NOT public.agentic_chat_failed_partial_receipt_valid('failed','uncertain_external_commit','Raw model prefix',metadata - 'failure_disclosure_version');
  ASSERT NOT public.agentic_chat_failed_partial_receipt_valid('failed','uncertain_external_commit','Raw model prefix',jsonb_set(metadata,'{answer_source}','"model"'));
  ASSERT NOT public.agentic_chat_failed_partial_receipt_valid('failed','uncertain_external_commit','No saves',jsonb_set(metadata,'{completion_receipt,stages}','[]'));
END;
$$;
SELECT pg_temp.seed_timing_turn(
  'fc114000-0000-4000-8000-000000000001','fc114000-0000-4000-8000-000000000002',
  'fc114000-0000-4000-8000-000000000003','fc114000-0000-4000-8000-000000000004',
  'fc114000-0000-4000-8000-000000000005','cleanup-failed-partial',2,true,false);
SELECT pg_temp.seed_timing_turn(
  'fc114000-0000-4000-8000-000000000011','fc114000-0000-4000-8000-000000000012',
  'fc114000-0000-4000-8000-000000000013','fc114000-0000-4000-8000-000000000014',
  'fc114000-0000-4000-8000-000000000015','cleanup-raw-failed-prefix',2,true,false);
-- Keep the disposable schema owner for synthetic evidence reads (the local
-- service role does not carry hosted BYPASSRLS). RPCs still require service-role claims.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
DO $$
DECLARE
  receipt jsonb;
  replay jsonb;
  metadata jsonb := '{"completion_status":"failed","answer_source":"harness","failure_disclosure_version":1,"completion_receipt":{"version":1,"request":{"disposition":"request_uncertain"},"stages":[{"executedCallIds":["saved-call"]}],"unreviewedWriteCallIds":[]}}';
  timing jsonb := jsonb_set(pg_temp.timing_draft('fc114000-0000-4000-8000-000000000001'),'{finished_reason}','"error"');
BEGIN
  receipt := public.finalize_agentic_chat_turn_with_failure_events(
    'fc114000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001',
    'fc114000-0000-4000-8000-000000000002','fc114000-0000-4000-8000-000000000003',1,
    'failed','error','uncertain_external_commit','fc114000-0000-4000-8000-000000000006',
    'Saved changes are retained. One attempted change is uncertain.',metadata,NULL,NULL,NULL,
    '{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}',
    '{"type":"done","status":"failed","finished_reason":"error","failure_code":"uncertain_external_commit","usage":{"total_tokens":0}}',
    'Some changes were saved. An attempted change has an uncertain outcome.',
    'fc114000-0000-5000-8000-000000000007',timing,'fc114000-0000-5000-8000-000000000008');
  ASSERT receipt->>'outcome'='finalized' AND receipt->>'status'='failed';
  ASSERT receipt->>'assistant_message_id'='fc114000-0000-4000-8000-000000000006';
  ASSERT (SELECT m.content='Saved changes are retained. One attempted change is uncertain.' AND
    m.metadata->'completion_receipt'->'request'->>'disposition'='request_uncertain'
    FROM public.chat_messages m WHERE m.id='fc114000-0000-4000-8000-000000000006');
  ASSERT receipt->'preterminal_events'->1->'event_payload'->'timing'->>'assistant_persisted_at' = receipt->>'terminalized_at';
  ASSERT receipt->'preterminal_events'->0->>'event_type'='error';
  ASSERT (SELECT assistant_text=E'fixture answer\n\nSaved changes are retained. One attempted change is uncertain.'
    FROM public.chat_turn_stream_state WHERE turn_run_id='fc114000-0000-4000-8000-000000000001');
  ASSERT (SELECT payload->>'content'='fixture answer' FROM public.chat_turn_events
    WHERE turn_run_id='fc114000-0000-4000-8000-000000000001' AND event_type='text_delta');
  -- Replaying the terminal CAS never inserts another assistant row.
  replay := public.finalize_agentic_chat_turn(
    'fc114000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001',
    'fc114000-0000-4000-8000-000000000002','fc114000-0000-4000-8000-000000000003',1,
    'failed','error','uncertain_external_commit','fc114000-0000-4000-8000-000000000009',
    'Duplicate receipt',metadata,NULL,NULL,NULL,'{}','{}');
  ASSERT replay->>'outcome'='already_terminal';
  ASSERT NOT EXISTS(SELECT 1 FROM public.chat_messages WHERE id='fc114000-0000-4000-8000-000000000009');
  -- Raw provider text remains reconnect-only even for the uncertain code.
  receipt := public.finalize_agentic_chat_turn(
    'fc114000-0000-4000-8000-000000000011','fa100000-0000-4000-8000-000000000001',
    'fc114000-0000-4000-8000-000000000012','fc114000-0000-4000-8000-000000000013',1,
    'failed','error','uncertain_external_commit',NULL,'fixture answer','{}',NULL,NULL,NULL,
    '{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}',
    '{"type":"done","status":"failed","finished_reason":"error","failure_code":"uncertain_external_commit"}');
  ASSERT receipt->>'status'='failed' AND receipt->'assistant_message_id'='null'::jsonb;
  ASSERT NOT EXISTS(SELECT 1 FROM public.chat_messages WHERE session_id='fc114000-0000-4000-8000-000000000011' AND role='assistant');
END;
$$;
RESET ROLE;
