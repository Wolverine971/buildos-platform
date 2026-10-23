-- supabase/tests/agent_run_durable_transitions.check.sql
-- Disposable production-schema rehearsal; every invented fixture rolls back.
\set ON_ERROR_STOP on
BEGIN;
-- Local schema rehearsals do not install Supabase Realtime. Keep the real event
-- trigger active, but replace its external transport with an inert local stub.
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE OR REPLACE FUNCTION realtime.broadcast_changes(text, text, text, text, text, record, record)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION pg_temp.check_run(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'assertion failed: %', message; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES ('b7000000-0000-4000-8000-000000000001','agent-run-test@example.com');
INSERT INTO public.users(id,email,name,username) VALUES ('b7000000-0000-4000-8000-000000000001','agent-run-test@example.com','Run Test','runtest') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.chat_sessions(id,user_id,title,context_type,chat_type) VALUES ('b7000000-0000-4000-8000-000000000002','b7000000-0000-4000-8000-000000000001','Run test','global','general');
INSERT INTO public.agent_runs(id,user_id,trigger,label,goal,context_type,scope_mode,status,execution_generation,parent_session_id,review_required)
VALUES ('b7000000-0000-4000-8000-000000000003','b7000000-0000-4000-8000-000000000001','chat','Run','Test','global','read_write','running',1,'b7000000-0000-4000-8000-000000000002',true);
INSERT INTO public.agent_run_signals(id,run_id,kind,source,payload) VALUES
('b7000000-0000-4000-8000-000000000004','b7000000-0000-4000-8000-000000000003','cancel','user','{}'),
('b7000000-0000-4000-8000-000000000005','b7000000-0000-4000-8000-000000000003','steer','user','{"message":"Use tomorrow"}');
SELECT pg_temp.check_run(NOT public.checkpoint_agent_run_execution('b7000000-0000-4000-8000-000000000003',0,'{"status":"cancelled"}',ARRAY['b7000000-0000-4000-8000-000000000004']::uuid[],'Stale'), 'stale generation is fenced');
SELECT pg_temp.check_run((SELECT count(*)=0 FROM public.chat_messages WHERE session_id='b7000000-0000-4000-8000-000000000002'),'stale executor publishes nothing');

-- Force chat delivery to fail after the status write. Everything must roll back.
CREATE FUNCTION pg_temp.reject_test_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.content='injected failure' THEN RAISE EXCEPTION 'injected_delivery_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER audit_fail_delivery BEFORE INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_message();
DO $$ BEGIN
  PERFORM public.checkpoint_agent_run_execution('b7000000-0000-4000-8000-000000000003',1,'{"status":"cancelled"}',ARRAY['b7000000-0000-4000-8000-000000000004','b7000000-0000-4000-8000-000000000005']::uuid[],'injected failure');
  RAISE EXCEPTION 'expected delivery failure';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'injected_delivery_failure' THEN RAISE; END IF; END $$;
SELECT pg_temp.check_run((SELECT status='running' FROM public.agent_runs WHERE id='b7000000-0000-4000-8000-000000000003'),'failed delivery rolls back status');
SELECT pg_temp.check_run((SELECT bool_and(consumed_at IS NULL) FROM public.agent_run_signals WHERE run_id='b7000000-0000-4000-8000-000000000003'),'failed delivery keeps cancel/steer pending');
SELECT pg_temp.check_run((SELECT count(*)=0 FROM public.agent_run_events WHERE run_id='b7000000-0000-4000-8000-000000000003' AND event_type='run.steer'),'failed delivery rolls back steering receipt');
DROP TRIGGER audit_fail_delivery ON public.chat_messages;

-- A staged proposal and its receipt are one checkpoint.
SELECT pg_temp.check_run(public.checkpoint_agent_run_execution('b7000000-0000-4000-8000-000000000003',1,
'{"change_set":{"status":"pending","changes":[{"id":"b7000000-0000-4000-8000-000000000006","op":"onto.task.create","action":"create","after":{"title":"Task"}}]}}', '{}',NULL,
'{"op":"onto.task.create","tool_category":"write","arguments":{"title":"Task"},"result":{"staged":true},"success":true,"mutation_mode":"stage","proposed_change_id":"b7000000-0000-4000-8000-000000000006","execution_time_ms":2}'),'proposal checkpoint succeeds');
SELECT pg_temp.check_run((SELECT count(*)=1 FROM public.agent_tool_executions WHERE agent_run_id='b7000000-0000-4000-8000-000000000003'),'execution receipt persists');
SELECT pg_temp.check_run(public.checkpoint_agent_run_execution('b7000000-0000-4000-8000-000000000003',1,'{"status":"needs_input","result":{"answer":"Which date?"}}',ARRAY['b7000000-0000-4000-8000-000000000005']::uuid[],'Which date?'),'first outcome commits');
SELECT pg_temp.check_run(NOT public.checkpoint_agent_run_execution('b7000000-0000-4000-8000-000000000003',1,'{"status":"needs_input"}','{}','duplicate'),'same outcome is not delivered twice');
UPDATE public.agent_runs SET status='running',execution_generation=2 WHERE id='b7000000-0000-4000-8000-000000000003';
SELECT pg_temp.check_run((SELECT jsonb_array_length(change_set->'changes')=1 FROM public.agent_runs WHERE id='b7000000-0000-4000-8000-000000000003'),'continuation retains proposal');
SELECT pg_temp.check_run(public.checkpoint_agent_run_execution('b7000000-0000-4000-8000-000000000003',2,'{"status":"cancelled"}',ARRAY['b7000000-0000-4000-8000-000000000004']::uuid[],'Cancelled'),'cancel retry settles');
SELECT pg_temp.check_run((SELECT count(*)=2 FROM public.chat_messages WHERE session_id='b7000000-0000-4000-8000-000000000002'),'continuation delivers a distinct outcome');
SELECT pg_temp.check_run((SELECT bool_and(consumed_at IS NOT NULL) FROM public.agent_run_signals WHERE run_id='b7000000-0000-4000-8000-000000000003'),'successful transitions acknowledge only read signals');

-- Worker cannot overwrite an approval commit, even with a matching generation.
UPDATE public.agent_runs SET status='running',commit_started_at=now() WHERE id='b7000000-0000-4000-8000-000000000003';
SELECT pg_temp.check_run(NOT public.checkpoint_agent_run_execution('b7000000-0000-4000-8000-000000000003',2,'{"status":"failed"}'),'approval owns its commit');
SELECT pg_temp.check_run(NOT has_function_privilege('authenticated','public.checkpoint_agent_run_execution(uuid,integer,jsonb,uuid[],text,jsonb)','execute'),'authenticated cannot checkpoint');
SELECT pg_temp.check_run(NOT has_function_privilege('anon','public.checkpoint_agent_run_execution(uuid,integer,jsonb,uuid[],text,jsonb)','execute'),'anon cannot checkpoint');
SELECT pg_temp.check_run(has_function_privilege('service_role','public.checkpoint_agent_run_execution(uuid,integer,jsonb,uuid[],text,jsonb)','execute'),'worker can checkpoint');
SELECT pg_temp.check_run(to_regprocedure('public.queue_deep_research_synthesis(uuid)') IS NULL,'retired synthesis RPC removed');
DO $$ BEGIN
 INSERT INTO public.agent_runs(user_id,trigger,label,goal,context_type,scope_mode,run_template,effort) VALUES ('b7000000-0000-4000-8000-000000000001','chat','Retired','Test','global','read_only','deep_research','deep');
 RAISE EXCEPTION 'expected retirement rejection';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'deep_research_retired' THEN RAISE; END IF; END $$;
-- Exercise the real upstream dispatch RPC and its queue contract after retirement.
CREATE TEMP TABLE dispatched_runs AS
SELECT public.create_agent_run_with_job(
  '{"user_id":"b7000000-0000-4000-8000-000000000001","trigger":"chat","label":"Proposal","goal":"Stage a task","context_type":"global","scope_mode":"read_write","effort":"standard","run_template":"agent","review_required":true,"budgets":{"max_cost_usd":0.5}}',
  '{"trigger":"chat","context_type":"global","scope_mode":"read_write","review_required":true}'
) AS receipt;
SELECT pg_temp.check_run((SELECT count(*)=1 FROM public.queue_jobs q JOIN dispatched_runs d ON q.id=(d.receipt->>'job_id')::uuid AND q.metadata->>'run_id'=d.receipt->'run'->>'id' AND q.job_type='agent_run'),'dispatch atomically links the run and queue metadata');
UPDATE public.agent_runs SET status='running',execution_generation=1 WHERE id=(SELECT (receipt->'run'->>'id')::uuid FROM dispatched_runs);
SELECT pg_temp.check_run(public.checkpoint_agent_run_execution((SELECT (receipt->'run'->>'id')::uuid FROM dispatched_runs),1,
 '{"status":"proposal_ready","change_set":{"status":"pending","changes":[{"id":"b7000000-0000-4000-8000-000000000007","op":"onto.task.create","action":"create","after":{"title":"Review me"}}]}}'), 'ordinary reviewed run still reaches proposal-ready');
-- This is the same conditional claim used by commitChangeSet; it must still win.
WITH claimed AS (
 UPDATE public.agent_runs SET status='running',commit_started_at=now()
 WHERE id=(SELECT (receipt->'run'->>'id')::uuid FROM dispatched_runs) AND status='proposal_ready' AND commit_started_at IS NULL
 RETURNING id
) SELECT pg_temp.check_run(count(*)=1,'approval can claim the saved proposal') FROM claimed;
SELECT pg_temp.check_run(NOT public.checkpoint_agent_run_execution((SELECT (receipt->'run'->>'id')::uuid FROM dispatched_runs),1,'{"status":"failed"}'),'worker cannot overwrite the approval claim');
UPDATE public.agent_runs SET status='completed',change_set=jsonb_set(change_set,'{status}','"committed"') WHERE id=(SELECT (receipt->'run'->>'id')::uuid FROM dispatched_runs);
SELECT pg_temp.check_run((SELECT status='completed' FROM public.agent_runs WHERE id=(SELECT (receipt->'run'->>'id')::uuid FROM dispatched_runs)), 'review completion guard allows an approved proposal');

-- Fill the remaining two slots: paused and proposal-ready still count as active.
INSERT INTO public.agent_runs(id,user_id,trigger,label,goal,context_type,status) VALUES
 ('b7000000-0000-4000-8000-000000000008','b7000000-0000-4000-8000-000000000001','manual','Paused','Test','global','paused'),
 ('b7000000-0000-4000-8000-000000000009','b7000000-0000-4000-8000-000000000001','manual','Review','Test','global','proposal_ready');
DO $$ BEGIN
 PERFORM public.create_agent_run_with_job(
  '{"user_id":"b7000000-0000-4000-8000-000000000001","trigger":"chat","label":"Fourth","goal":"Must not start","context_type":"global","scope_mode":"read_only","effort":"standard","run_template":"agent"}', '{}');
 RAISE EXCEPTION 'expected capacity rejection';
EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'agent_run_limit_exceeded:%' THEN RAISE; END IF; END $$;
SELECT pg_temp.check_run((SELECT count(*)=1 FROM public.queue_jobs WHERE user_id='b7000000-0000-4000-8000-000000000001'),'rejected fourth admission leaves no queue job');
DO $$ BEGIN
 UPDATE public.agent_runs SET status='queued' WHERE id=(SELECT (receipt->'run'->>'id')::uuid FROM dispatched_runs);
 RAISE EXCEPTION 'expected reactivation rejection';
EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'agent_run_limit_exceeded:%' THEN RAISE; END IF; END $$;
UPDATE public.agent_runs SET status='running' WHERE id='b7000000-0000-4000-8000-000000000008';
SELECT pg_temp.check_run((SELECT status='running' FROM public.agent_runs WHERE id='b7000000-0000-4000-8000-000000000008'),'resuming an active slot works at capacity');
ROLLBACK;
