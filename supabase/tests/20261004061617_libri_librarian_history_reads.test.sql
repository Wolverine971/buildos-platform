-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_chapter_research_base.sql
\ir ../migrations/20261004061617_libri_librarian_history_reads.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000002');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000003','viewer'),('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','owner');
INSERT INTO libri.books(id,library_id,title,slug) VALUES('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','One','one');
INSERT INTO libri.librarian_history(id,library_id,kind,book_id,source_id,source_sha256,archive_sha256,original_status,trigger,created_at,record) VALUES
 ('00000000-0000-5000-8000-000000000040','00000000-0000-4000-8000-000000000010','run','00000000-0000-4000-8000-000000000020','old-run',repeat('a',64),repeat('b',64),'running','nightly',now(),'{}');
INSERT INTO libri.librarian_history(id,library_id,kind,book_id,run_id,source_id,source_sha256,archive_sha256,duty,action,message,created_at,record) VALUES
 ('00000000-0000-5000-8000-000000000041','00000000-0000-4000-8000-000000000010','event','00000000-0000-4000-8000-000000000020','00000000-0000-5000-8000-000000000040','old-event',repeat('a',64),repeat('b',64),'score_refresh','info','Historical message',now(),'{}');
SELECT pg_temp.assert_true((SELECT relforcerowsecurity FROM pg_class WHERE oid='libri.librarian_history'::regclass),'forced RLS');
SELECT pg_temp.assert_true(NOT has_table_privilege('anon','libri.librarian_history','SELECT') AND NOT has_table_privilege('libri_worker','libri.librarian_history','SELECT') AND NOT has_table_privilege('libri_frontend_reader','libri.librarian_history','SELECT'),'no anonymous/worker/reader access');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.librarian_history','INSERT') AND NOT has_table_privilege('authenticated','libri.librarian_history','UPDATE') AND NOT has_table_privilege('authenticated','libri.librarian_history','DELETE'),'archive cannot be mutated by clients');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.librarian_history),'owner sees both inert rows');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.librarian_history),'other library owner sees none');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.librarian_history),'viewer sees none');
RESET ROLE;
UPDATE libri.library_members SET role='editor' WHERE user_id='00000000-0000-4000-8000-000000000003';
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.librarian_history),'editor sees none');
RESET ROLE;
DO $$ BEGIN
 BEGIN UPDATE libri.librarian_history SET run_id='00000000-0000-5000-8000-000000000041' WHERE kind='event'; RAISE EXCEPTION 'event as parent accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN UPDATE libri.librarian_history SET library_id='00000000-0000-4000-8000-000000000011' WHERE kind='event'; RAISE EXCEPTION 'cross library reference accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
DELETE FROM libri.books WHERE id='00000000-0000-4000-8000-000000000020';
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.librarian_history WHERE book_id IS NULL),'book deletion preserves audit records');
DELETE FROM libri.librarian_history WHERE kind='run';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.librarian_history WHERE kind='event' AND run_id IS NULL),'run deletion preserves event');
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.librarian_history),'revocation takes effect immediately');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.research_tasks),'history never creates tasks');
