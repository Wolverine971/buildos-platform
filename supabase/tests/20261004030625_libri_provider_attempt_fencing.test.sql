-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_research_tasks_base.sql
\ir ../migrations/20260830224500_libri_provider_cost_ledger.sql
\ir ../migrations/20261004022726_libri_research_task_dispatch.sql
\ir ../migrations/20261004030625_libri_provider_attempt_fencing.sql

CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES ('00000000-0000-4000-8000-000000000010','fencing','Fencing','00000000-0000-4000-8000-000000000001');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner');
INSERT INTO libri.research_runs(id,library_id,idempotency_key,queue_family,kind,subject_type,requested_by_actor,status,started_at,planned_steps,cost_budget_microusd)
 SELECT gen_random_uuid(),'00000000-0000-4000-8000-000000000010',s,'libri_ingest','ocr_image','maintenance','system','running',now(),1,100 FROM unnest(ARRAY['reserved','started','settled']) s;
INSERT INTO libri.research_steps(library_id,run_id,idempotency_key,queue_family,kind,stage,position,status,active_queue_job_id,active_processing_token,execution_generation,lease_token,lease_owner,leased_at,lease_expires_at,last_heartbeat_at,started_at)
 SELECT library_id,id,idempotency_key,'libri_ingest','ocr_image','capture_sources',0,'leased',gen_random_uuid(),gen_random_uuid(),1,'00000000-0000-4000-8000-000000000020','offline-worker',now(),now()+interval '5 minutes',now(),now() FROM libri.research_runs;

SET ROLE libri_worker;
DO $$ DECLARE step record; receipt record; BEGIN
 FOR step IN SELECT * FROM libri.research_steps LOOP
  SELECT * INTO receipt FROM libri.reserve_provider_cost(step.id,1,step.lease_token,'original','openrouter','offline-model',20);
  PERFORM pg_temp.assert_true(receipt.outcome='reserved','first reservation allowed');
  IF step.idempotency_key<>'reserved' THEN
   PERFORM libri.start_provider_cost(receipt.reservation_id,1,step.lease_token);
  END IF;
  IF step.idempotency_key='settled' THEN
   PERFORM libri.settle_provider_cost(receipt.reservation_id,1,step.lease_token,10,1,1,'offline-result');
  END IF;
 END LOOP;
END $$;
RESET ROLE;
-- Simulate an older worker version that reclaims despite uncertain provider work.
UPDATE libri.research_steps SET execution_generation=2,lease_token='00000000-0000-4000-8000-000000000021';
SET ROLE libri_worker;
DO $$ DECLARE step record; receipt record; BEGIN
 FOR step IN SELECT * FROM libri.research_steps LOOP
  SELECT * INTO receipt FROM libri.reserve_provider_cost(step.id,2,step.lease_token,'different-key','openrouter','different-model',20);
  PERFORM pg_temp.assert_true(receipt.outcome=CASE WHEN step.idempotency_key='reserved' THEN 'reserved' ELSE 'reconciliation_required' END,'cross-generation paid attempt must not reserve again');
  IF step.idempotency_key<>'reserved' THEN
   BEGIN
    INSERT INTO libri.provider_cost_reservations(library_id,run_id,step_id,execution_generation,lease_token,reservation_key,provider,model,reserved_microusd)
     VALUES(step.library_id,step.run_id,step.id,2,step.lease_token,'raw-bypass','openrouter','offline-model',20);
    RAISE EXCEPTION 'raw INSERT bypassed replay protection';
   EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  END IF;
 END LOOP;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=4 FROM libri.provider_cost_reservations),'denied replay cannot create a new ledger row');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','libri.guard_provider_attempt()','EXECUTE'),'client cannot call guard');
SELECT pg_temp.assert_true((SELECT NOT prosecdef FROM pg_proc WHERE oid='libri.guard_provider_attempt()'::regprocedure),'guard stays invoker');

INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types,task_budget_microusd,daily_budget_microusd)
 VALUES('00000000-0000-4000-8000-000000000010',true,ARRAY['synthesize_book'],100,1000);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"synthesize_book","priority":"high","title":"Synthesize","idempotencyKey":"00000000-0000-4000-8000-000000000030"}');
SELECT libri.admit_research_task_batch('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000031','round_now','{}') AS batch \gset
RESET ROLE;
UPDATE libri.research_runs SET status='running',started_at=now() WHERE id=(:'batch'::jsonb->>'runId')::uuid;
UPDATE libri.research_steps SET status='leased',active_queue_job_id=gen_random_uuid(),active_processing_token=gen_random_uuid(),execution_generation=1,
 lease_token='00000000-0000-4000-8000-000000000040',lease_owner='offline-worker',leased_at=now(),lease_expires_at=now()+interval '5 minutes',last_heartbeat_at=now(),started_at=now()
 WHERE run_id=(:'batch'::jsonb->>'runId')::uuid;
SELECT id AS task_step FROM libri.research_steps WHERE run_id=(:'batch'::jsonb->>'runId')::uuid \gset
SET ROLE libri_worker;
SELECT reservation_id FROM libri.reserve_provider_cost(:'task_step',1,'00000000-0000-4000-8000-000000000040','synthesis','openrouter','offline-model',20) \gset
RESET ROLE;
UPDATE libri.library_members SET role='viewer';
SET ROLE libri_worker;
DO $$ BEGIN
 BEGIN
  PERFORM libri.start_provider_cost((SELECT id FROM libri.provider_cost_reservations WHERE reservation_key='synthesis'),1,'00000000-0000-4000-8000-000000000040');
  RAISE EXCEPTION 'revoked owner authorized paid call';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE libri.library_members SET role='owner';
UPDATE libri.research_queue_controls SET dispatch_enabled=false;
SET ROLE libri_worker;
DO $$ BEGIN
 BEGIN
  PERFORM libri.start_provider_cost((SELECT id FROM libri.provider_cost_reservations WHERE reservation_key='synthesis'),1,'00000000-0000-4000-8000-000000000040');
  RAISE EXCEPTION 'disabled dispatch authorized paid call';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE libri.research_queue_controls SET dispatch_enabled=true,supported_task_types=ARRAY[]::text[];
SET ROLE libri_worker;
DO $$ BEGIN
 BEGIN
  PERFORM libri.start_provider_cost((SELECT id FROM libri.provider_cost_reservations WHERE reservation_key='synthesis'),1,'00000000-0000-4000-8000-000000000040');
  RAISE EXCEPTION 'removed task type authorized paid call';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT status='reserved' FROM libri.provider_cost_reservations WHERE reservation_key='synthesis'),'every rejected authorization remains unpaid');
UPDATE libri.research_queue_controls SET supported_task_types=ARRAY['synthesize_book'];
SET ROLE libri_worker;
SELECT pg_temp.assert_true((SELECT authorized FROM libri.start_provider_cost(:'reservation_id',1,'00000000-0000-4000-8000-000000000040')),'valid current authority can start exactly once');
SELECT pg_temp.assert_true(NOT (SELECT authorized FROM libri.start_provider_cost(:'reservation_id',1,'00000000-0000-4000-8000-000000000040')),'duplicate authorization never calls twice');
RESET ROLE;
