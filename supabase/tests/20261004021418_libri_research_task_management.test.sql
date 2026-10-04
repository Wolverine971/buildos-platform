-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
SET timezone='UTC';
\ir fixtures/libri_research_orchestration_base.sql
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='libri_worker') THEN CREATE ROLE libri_worker NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='libri_frontend_reader') THEN CREATE ROLE libri_frontend_reader NOLOGIN; END IF;
END $$;
\ir ../migrations/20261004012951_libri_application_activity.sql
\ir ../migrations/20261004015552_libri_manual_book_edits.sql
\ir ../migrations/20261004021418_libri_research_task_management.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES ('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000003');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','editor'),('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000003','owner');
INSERT INTO libri.books(id,library_id,title,slug) VALUES ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','Book','book'),('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','Foreign','foreign');
CREATE TABLE public.buildos_control(value text);
INSERT INTO public.buildos_control VALUES ('unchanged');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.manage_research_tasks(uuid,text,jsonb)','EXECUTE') AND NOT has_function_privilege('libri_worker','libri.manage_research_tasks(uuid,text,jsonb)','EXECUTE'),'no anonymous or worker mutation authority');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.research_tasks','INSERT,UPDATE,DELETE'),'no raw task writes');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN
 BEGIN PERFORM libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{}'); RAISE EXCEPTION 'editor permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN
 BEGIN PERFORM libri.manage_research_tasks('00000000-0000-4000-8000-000000000011','create','{}'); RAISE EXCEPTION 'foreign library permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"custom","priority":"medium","title":"A","idempotencyKey":"00000000-0000-4000-8000-000000000040","bookId":"00000000-0000-4000-8000-000000000021"}'); RAISE EXCEPTION 'foreign book permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"custom","priority":"medium","title":"A","idempotencyKey":"00000000-0000-4000-8000-000000000040","createdByActorId":"forged"}'); RAISE EXCEPTION 'forged actor permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"custom","priority":"medium","title":"A","idempotencyKey":"00000000-0000-4000-8000-000000000040"}') AS receipt \gset
SELECT libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"custom","priority":"medium","title":"A","idempotencyKey":"00000000-0000-4000-8000-000000000040"}') AS retry_receipt \gset
SELECT pg_temp.assert_true((:'receipt'::jsonb->>'id')=(:'retry_receipt'::jsonb->>'id') AND (:'retry_receipt'::jsonb->>'deduped')::boolean,'same request returns stable receipt');
DO $$ BEGIN
 BEGIN PERFORM libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"custom","priority":"medium","title":"Different","idempotencyKey":"00000000-0000-4000-8000-000000000040"}'); RAISE EXCEPTION 'key reuse allowed'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
SELECT libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{"type":"paste_text","priority":"high","title":"B","idempotencyKey":"00000000-0000-4000-8000-000000000041","bookId":"00000000-0000-4000-8000-000000000020"}') AS second_receipt \gset
SELECT pg_temp.assert_true((libri.read_research_tasks('00000000-0000-4000-8000-000000000010','{"limit":1}')->>'total')::integer=2,'read count covers the complete filtered result');
SELECT pg_temp.assert_true(libri.read_research_tasks('00000000-0000-4000-8000-000000000010','{"limit":1}')->'rows'->0->>'title'='B','pending tasks preserve priority order');
SELECT pg_temp.assert_true(libri.read_research_tasks('00000000-0000-4000-8000-000000000010','{"search":"Book","limit":1}')->'rows'->0->>'title'='B','search includes current book title');
SELECT pg_temp.assert_true(libri.read_research_tasks('00000000-0000-4000-8000-000000000010','{"limit":1,"cursor":"1"}')->'rows'->0->>'title'='A','bounded pagination reaches the next row');
SELECT pg_temp.assert_true(NOT (libri.read_research_tasks('00000000-0000-4000-8000-000000000010','{}')->'rows'->0 ? 'creation_payload'),'read excludes internal creation payload');
SELECT libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','update',jsonb_build_object('tasks',jsonb_build_array(jsonb_build_object('id',:'receipt'::jsonb->>'id','expectedUpdatedAt',:'receipt'::jsonb->>'updatedAt')),'changes',jsonb_build_object('status','complete','dataAdded',false))) AS updated_receipt \gset
DO $$ DECLARE tasks jsonb; BEGIN
 SELECT jsonb_agg(jsonb_build_object('id',id,'expectedUpdatedAt',CASE WHEN title='B' THEN '2000-01-01'::timestamptz ELSE updated_at END)) INTO tasks FROM libri.research_tasks;
 BEGIN PERFORM libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','update',jsonb_build_object('tasks',tasks,'changes',jsonb_build_object('priority','critical'))); RAISE EXCEPTION 'partial stale bulk accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.research_tasks),'only two tasks created');
SELECT pg_temp.assert_true((SELECT bool_and(priority<>'critical') FROM libri.research_tasks),'bulk rollback leaves every task unchanged');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM libri.activity_events),'duplicate and failed writes add no activity');
SELECT pg_temp.assert_true((SELECT status='complete' AND completed_at IS NOT NULL AND data_added=false AND created_by='00000000-0000-4000-8000-000000000001' FROM libri.research_tasks WHERE title='A'),'completion and actor pinned');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.research_tasks),'cross-library reads empty');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.research_tasks),'members can read tasks');
RESET ROLE;
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN
 BEGIN PERFORM libri.manage_research_tasks('00000000-0000-4000-8000-000000000010','create','{}'); RAISE EXCEPTION 'revoked owner permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value='unchanged' FROM public.buildos_control),'shared data unchanged');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.research_runs),'management never enqueues research');
