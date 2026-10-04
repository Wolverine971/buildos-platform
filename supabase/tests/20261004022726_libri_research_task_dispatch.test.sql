-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
SET timezone='UTC';
\ir fixtures/libri_research_tasks_base.sql
\ir ../migrations/20261004022726_libri_research_task_dispatch.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES ('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','viewer');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.research_queue_controls','UPDATE'),'clients cannot enable dispatch or raise budgets');
SELECT pg_temp.assert_true(NOT has_function_privilege('libri_worker','libri.admit_research_task_batch(uuid,uuid,text,jsonb)','EXECUTE'),'worker cannot impersonate user admission');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"find_book_info","priority":"medium","title":"Find details","idempotencyKey":"00000000-0000-4000-8000-000000000020"}');
SELECT libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"custom","priority":"critical","title":"Manual","idempotencyKey":"00000000-0000-4000-8000-000000000021"}');
DO $$ BEGIN
 BEGIN PERFORM libri.admit_research_task_batch('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','round_now','{}'); RAISE EXCEPTION 'default dispatch enabled'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types,max_batch_tasks,task_budget_microusd,daily_budget_microusd)
 VALUES('00000000-0000-4000-8000-000000000010',true,ARRAY['find_book_info'],1,100,100);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN
 BEGIN PERFORM libri.admit_research_task_batch('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','round_now','{}'); RAISE EXCEPTION 'viewer dispatch enabled'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT libri.admit_research_task_batch('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','round_now','{}') AS receipt \gset
SELECT libri.admit_research_task_batch('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','round_now','{}') AS retry_receipt \gset
SELECT pg_temp.assert_true((:'receipt'::jsonb->>'runId')=(:'retry_receipt'::jsonb->>'runId') AND (:'retry_receipt'::jsonb->>'deduped')::boolean,'dispatch retry returns original batch');
DO $$ BEGIN
 BEGIN PERFORM libri.admit_research_task_batch('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030','round_now','{"priority":"high"}'); RAISE EXCEPTION 'key reused'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.research_runs),'one durable run');
SELECT pg_temp.assert_true((SELECT max_steps=60 AND planned_steps=1 AND max_concurrent_steps=1 AND cost_budget_microusd=100 AND requested_by='00000000-0000-4000-8000-000000000001' FROM libri.research_runs),'run limits and actor pinned');
SELECT pg_temp.assert_true((SELECT status='pending' AND active_queue_job_id IS NULL FROM libri.research_steps),'admission remains a durable outbox before worker dispatch');
SELECT pg_temp.assert_true((SELECT status='pending' AND active_run_id IS NULL FROM libri.research_tasks WHERE title='Manual'),'manual task never selected');
SELECT pg_temp.assert_true((SELECT status='in_progress' AND active_run_id IS NOT NULL FROM libri.research_tasks WHERE title='Find details'),'task linked atomically');
SET ROLE libri_worker;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.pending_research_task_batches()),'worker sees the pending outbox');
SELECT pg_temp.assert_true(NOT libri.acknowledge_research_task_dispatch((:'receipt'::jsonb->>'runId')::uuid),'missing queue evidence cannot finalize');
RESET ROLE;
INSERT INTO public.queue_jobs(id,queue_job_id,user_id,job_type,metadata) VALUES('00000000-0000-4000-8000-000000000050','task-queue-test','00000000-0000-4000-8000-000000000001','libri_research','{}');
UPDATE libri.research_steps SET active_queue_job_id='00000000-0000-4000-8000-000000000050',status='queued';
SET ROLE libri_worker;
SELECT pg_temp.assert_true(NOT libri.acknowledge_research_task_dispatch((:'receipt'::jsonb->>'runId')::uuid),'wrong queue metadata cannot finalize');
RESET ROLE;
UPDATE public.queue_jobs SET dedup_key=(SELECT 'libri:research-step:'||id FROM libri.research_steps),metadata=(SELECT jsonb_build_object('researchStepId',step.id,'researchRunId',run_id,'libraryId',step.library_id,'payloadVersion',step.payload_version,'correlationId',run.correlation_id) FROM libri.research_steps step JOIN libri.research_runs run ON run.id=step.run_id);
SET ROLE libri_worker;
SELECT pg_temp.assert_true(libri.acknowledge_research_task_dispatch((:'receipt'::jsonb->>'runId')::uuid),'durable queue evidence acknowledges the outbox');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.pending_research_task_batches()),'acknowledged outbox no longer dispatches');
RESET ROLE;
UPDATE libri.research_steps SET status='completed',completed_at=clock_timestamp(),result='{"message":"Saved source-backed details."}';
SELECT pg_temp.assert_true((SELECT status='complete' AND completed_at IS NOT NULL AND active_run_id IS NULL AND result_message='Saved source-backed details.' FROM libri.research_tasks WHERE title='Find details'),'terminal step publishes task outcome and clears ownership');
SET ROLE authenticated;
SELECT libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"find_book_info","priority":"high","title":"Another","idempotencyKey":"00000000-0000-4000-8000-000000000022"}');
DO $$ BEGIN
 BEGIN PERFORM libri.admit_research_task_batch('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000031','round_now','{}'); RAISE EXCEPTION 'daily budget bypassed'; EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.research_runs),'budget refusal creates no run');
SELECT pg_temp.assert_true((SELECT status='pending' AND active_run_id IS NULL FROM libri.research_tasks WHERE title='Another'),'budget refusal leaves task pending');
