-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_chapter_research_base.sql
\ir ../migrations/20261004044437_libri_research_history_reads.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000002');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000003','viewer');
INSERT INTO libri.books(id,library_id,title) VALUES('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','One'),('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','Two');
INSERT INTO libri.chapters(id,library_id,book_id,position,number,title) VALUES('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',0,'1','First');
INSERT INTO libri.research_history(id,library_id,book_id,chapter_id,source_id,source_sha256,archive_sha256,scope,operation,original_status,created_at,updated_at,record) VALUES
 ('00000000-0000-5000-8000-000000000040','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','archived-one',repeat('a',64),repeat('b',64),'chapter','research_chapter','running',now()-interval '1 day',now()-interval '1 day','{"_id":"old-id","bookId":"old-book","chapterId":"old-chapter","status":"running","inputPayload":{"private":"owner evidence"}}');
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.research_history','SELECT') AND NOT has_table_privilege('authenticated','libri.research_history','INSERT'),'history cannot be consumed or written by clients');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.read_book_research_history(uuid,uuid,uuid,integer)','EXECUTE'),'anonymous history denied');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020') AS history \gset
SELECT pg_temp.assert_true(:'history'::jsonb->0->>'status'='archived' AND :'history'::jsonb->0->>'originalStatus'='running' AND :'history'::jsonb->0->'archived'='true','unfinished history is explicitly archived, never live');
SELECT pg_temp.assert_true(:'history'::jsonb->0->>'_id'='00000000-0000-5000-8000-000000000040' AND :'history'::jsonb->0->>'chapterId'='00000000-0000-4000-8000-000000000030','legacy references mapped');
SELECT pg_temp.assert_true(:'history'::jsonb->0->'inputPayload'->>'private'='owner evidence','owner history preserves original evidence');
DO $$ BEGIN
 BEGIN PERFORM libri.read_book_research_history('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021'); RAISE EXCEPTION 'cross-library history'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021'); RAISE EXCEPTION 'cross-book history'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',NULL,101); RAISE EXCEPTION 'unbounded history'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.research_history),'viewer cannot read legacy raw evidence');
SELECT pg_temp.assert_true(libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020')='[]','viewer projection preserves archive boundary');
RESET ROLE;
INSERT INTO libri.research_queue_controls(library_id,dispatch_enabled,supported_task_types) VALUES('00000000-0000-4000-8000-000000000010',true,ARRAY['find_book_info']);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT libri.enqueue_book_research('00000000-0000-4000-8000-000000000010',gen_random_uuid(),'00000000-0000-4000-8000-000000000020','chapter_details');
SELECT libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020') AS history \gset
SELECT pg_temp.assert_true(jsonb_array_length(:'history'::jsonb)=2 AND :'history'::jsonb->0->>'status'='running' AND :'history'::jsonb->0->>'operation'='research_all_chapters','live parent precedes archive and does not report success on admission');
SELECT pg_temp.assert_true(jsonb_array_length(libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030'))=1,'chapter filter excludes book parent');
RESET ROLE;
UPDATE libri.research_steps SET status='waiting',result='{"workflowVersion":1,"message":"Research in progress"}';
SET ROLE authenticated;
SELECT pg_temp.assert_true(libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020')->0->>'status'='running','waiting parent stays running');
RESET ROLE;
UPDATE libri.research_steps SET status='needs_review',completed_at=now(),result='{"outcome":"insufficient_evidence","message":"Thin evidence"}';
SET ROLE authenticated;
SELECT pg_temp.assert_true(libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020')->0->>'status'='insufficient_evidence','insufficient evidence does not become success');
RESET ROLE;
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM libri.read_book_research_history('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020'); RAISE EXCEPTION 'revoked history'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
