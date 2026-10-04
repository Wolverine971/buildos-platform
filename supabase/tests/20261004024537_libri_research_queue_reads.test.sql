-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_research_tasks_base.sql
\ir ../migrations/20261004022726_libri_research_task_dispatch.sql
\ir ../migrations/20261004024537_libri_research_queue_reads.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000002');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner');
INSERT INTO libri.research_tasks(library_id,task_type,title,priority,created_by,creation_key,creation_payload) VALUES
 ('00000000-0000-4000-8000-000000000010','find_book_info','Automatic','high','00000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}'),
 ('00000000-0000-4000-8000-000000000010','custom','Manual','low','00000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}'),
 ('00000000-0000-4000-8000-000000000011','custom','Other library','high','00000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT libri.read_research_queue_dashboard('00000000-0000-4000-8000-000000000010') AS dashboard \gset
SELECT pg_temp.assert_true((:'dashboard'::jsonb->'queue'->>'pending')::int=2 AND (:'dashboard'::jsonb->'queue'->>'pending_auto')::int=1 AND (:'dashboard'::jsonb->'queue'->>'pending_manual')::int=1,'exact library-scoped counts');
SELECT pg_temp.assert_true(jsonb_array_length(:'dashboard'::jsonb->'nextInLine')=2 AND :'dashboard'::jsonb->'controls'='null'::jsonb,'samples and absent controls preserve disabled state');
SELECT pg_temp.assert_true(NOT(:'dashboard'::jsonb->'nextInLine'->0 ? 'creation_payload'),'private idempotency payload never returned');
DO $$ BEGIN
 BEGIN PERFORM libri.read_research_queue_dashboard('00000000-0000-4000-8000-000000000011'); RAISE EXCEPTION 'cross-library dashboard'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM libri.read_research_queue_runs('00000000-0000-4000-8000-000000000011'); RAISE EXCEPTION 'cross-library history'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types) VALUES('00000000-0000-4000-8000-000000000010',true,ARRAY['find_book_info']);
SET ROLE authenticated;
SELECT libri.admit_research_task_batch('00000000-0000-4000-8000-000000000010',gen_random_uuid(),'round_now','{}') AS receipt \gset
SELECT libri.read_research_queue_runs('00000000-0000-4000-8000-000000000010',50,(:'receipt'::jsonb->>'runId')::uuid) AS runs \gset
SELECT pg_temp.assert_true(jsonb_array_length(:'runs'::jsonb)=1 AND :'runs'::jsonb->0->>'status'='queued' AND jsonb_array_length(:'runs'::jsonb->0->'results')=1,'real batch history includes only admitted tasks');
SELECT pg_temp.assert_true(:'runs'::jsonb->0->'results'->0->>'title'='Automatic' AND NOT(:'runs'::jsonb->0 ? 'request_payload'),'history retains immutable task label without request payload');
SELECT pg_temp.assert_true(libri.read_research_queue_runs('00000000-0000-4000-8000-000000000010',50,gen_random_uuid())='[]'::jsonb,'missing run is empty');
RESET ROLE;
INSERT INTO libri.research_queue_history(id,library_id,source_id,source_sha256,archive_sha256,source,original_status,started_at,finished_at,attempted,succeeded,failed,blocked,skipped_manual_only,results) VALUES
 ('00000000-0000-5000-8000-000000000080','00000000-0000-4000-8000-000000000010','old-run',repeat('a',64),repeat('b',64),'scheduled_dispatch','completed',now()-interval '1 year',now()-interval '1 year',120,100,10,10,2,'[{"taskId":"00000000-0000-5000-8000-000000000081","taskType":"find_book_info","status":"complete","message":"Historical result"}]'),
 ('00000000-0000-5000-8000-000000000082','00000000-0000-4000-8000-000000000011','other-run',repeat('a',64),repeat('b',64),'scheduled_dispatch','running',now()-interval '1 year',NULL,1,0,0,0,0,'[]');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.research_queue_history','INSERT') AND NOT has_table_privilege('libri_worker','libri.research_queue_history','SELECT'),'archives are client-read only and inaccessible to the worker');
SET ROLE authenticated;
SELECT libri.read_research_queue_runs('00000000-0000-4000-8000-000000000010') AS all_runs \gset
SELECT pg_temp.assert_true(jsonb_array_length(:'all_runs'::jsonb)=2 AND :'all_runs'::jsonb->0->>'status'='queued','current and historical runs are sorted together with tenant scope');
SELECT pg_temp.assert_true(:'all_runs'::jsonb->1->'archived'='true'::jsonb AND (:'all_runs'::jsonb->1->>'attempted')::int=120 AND :'all_runs'::jsonb->1->'results'='[]'::jsonb,'list uses original aggregate counts without downloading every outcome');
SELECT libri.read_research_queue_runs('00000000-0000-4000-8000-000000000010',50,'00000000-0000-5000-8000-000000000080') AS archived_run \gset
SELECT pg_temp.assert_true(:'archived_run'::jsonb->0->'results'->0->>'message'='Historical result','detail preserves historical result');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.research_runs),'history import never creates executable work');
RESET ROLE;
UPDATE libri.research_steps SET status='failed',completed_at=now(),error_message='Local failure',attempts=1;
SET ROLE authenticated;
SELECT libri.read_research_queue_dashboard('00000000-0000-4000-8000-000000000010') AS dashboard \gset
SELECT pg_temp.assert_true((:'dashboard'::jsonb->>'failedLast24h')::int=1 AND (:'dashboard'::jsonb->'queue'->>'blocked')::int=1,'failures derive from canonical outcomes');
SELECT pg_temp.assert_true(:'dashboard'::jsonb->'failures'->0->>'result_message'='Local failure','failure sample preserves message and exact version');
RESET ROLE;
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM libri.read_research_queue_dashboard('00000000-0000-4000-8000-000000000010'); RAISE EXCEPTION 'revoked dashboard'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
