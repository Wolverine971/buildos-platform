-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_chapter_note_core_base.sql
CREATE ROLE libri_worker NOLOGIN;
CREATE ROLE libri_frontend_reader NOLOGIN;
\ir ../migrations/20261004012951_libri_application_activity.sql
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES
 ('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000003');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','viewer'),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000003','owner');
INSERT INTO libri.books(id,library_id,title,slug) VALUES
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','Book','book'),
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','Foreign','foreign');
INSERT INTO libri.chapters(id,library_id,book_id,position,number,title) VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',0,'1','Chapter');
CREATE TABLE public.buildos_control(value text);
INSERT INTO public.buildos_control VALUES ('unchanged');
SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='libri.activity_events'::regclass),'forced RLS');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.log_application_activity(uuid,text,text,uuid,uuid,text,text)','EXECUTE'),'anon RPC denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('libri_worker','libri.log_application_activity(uuid,text,text,uuid,uuid,text,text)','EXECUTE'),'worker RPC denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','libri.record_note_created_activity()','EXECUTE'),'trigger cannot be invoked by client');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.activity_events','INSERT,UPDATE,DELETE'),'raw activity writes denied');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true(libri.log_application_activity('00000000-0000-4000-8000-000000000010','search.query',p_query=>'  Systems   thinking ')='{"logged":true}'::jsonb,'first search logged');
SELECT pg_temp.assert_true(libri.log_application_activity('00000000-0000-4000-8000-000000000010','search.query',p_query=>'systems thinking')='{"logged":false,"deduped":true}'::jsonb,'search deduped');
SELECT pg_temp.assert_true(libri.log_application_activity('00000000-0000-4000-8000-000000000010','search.query',p_query=>'a')->>'reason'='too_short','short search ignored');
SELECT pg_temp.assert_true(libri.log_application_activity('00000000-0000-4000-8000-000000000010','book.viewed',p_book_id=>'00000000-0000-4000-8000-000000000020')->>'logged'='true','book logged');
SELECT pg_temp.assert_true(libri.log_application_activity('00000000-0000-4000-8000-000000000010','chapter.viewed',p_book_id=>'00000000-0000-4000-8000-000000000020',p_chapter_id=>'00000000-0000-4000-8000-000000000030')->>'logged'='true','chapter logged');
SELECT pg_temp.assert_true(libri.log_application_activity('00000000-0000-4000-8000-000000000010','domain.filtered',p_domain=>' Psychology ')->>'logged'='true','domain logged');
SELECT pg_temp.assert_true(libri.log_application_activity('00000000-0000-4000-8000-000000000010','book.viewed',p_book_id=>'00000000-0000-4000-8000-000000000021')->>'reason'='book_not_found','foreign subject not disclosed');
DO $$ BEGIN
 BEGIN PERFORM libri.log_application_activity('00000000-0000-4000-8000-000000000011','search.query',p_query=>'foreign'); RAISE EXCEPTION 'foreign library permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM libri.log_application_activity('00000000-0000-4000-8000-000000000010','note.created'); RAISE EXCEPTION 'forged note event permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM libri.log_application_activity('00000000-0000-4000-8000-000000000010','search.query',p_query=>repeat('x',281)); RAISE EXCEPTION 'unbounded search permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM libri.log_application_activity('00000000-0000-4000-8000-000000000010','domain.filtered',p_query=>'unexpected'); RAISE EXCEPTION 'extra context permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=4 FROM libri.activity_events),'owner sees actual events');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.activity_events),'viewer activity invisible');
DO $$ BEGIN
 BEGIN PERFORM libri.log_application_activity('00000000-0000-4000-8000-000000000010','search.query',p_query=>'viewer'); RAISE EXCEPTION 'viewer log permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,message) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','search.query','forged','forged'); RAISE EXCEPTION 'raw forgery permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
BEGIN;
INSERT INTO libri.notes(library_id,book_id,chapter_id,owner_user_id,content) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000002','Private secret');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.activity_events WHERE event_type='note.created' AND actor_user_id='00000000-0000-4000-8000-000000000002' AND chapter_title='Chapter'),'note atomically creates actor-pinned event');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM libri.activity_events WHERE message LIKE '%secret%'),'note content never copied');
ROLLBACK;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.activity_events WHERE event_type='note.created'),'rollback removes event');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.notes),'rollback removes note');
SET ROLE authenticated;
INSERT INTO libri.notes(library_id,book_id,owner_user_id,content) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','Private secret');
UPDATE libri.notes SET content='Changed secret' WHERE owner_user_id='00000000-0000-4000-8000-000000000002';
DELETE FROM libri.notes WHERE owner_user_id='00000000-0000-4000-8000-000000000002';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.activity_events WHERE event_type='note.created'),'editing/deleting does not fabricate more creation events');
-- Service imports do not replay historical activity.
SELECT set_config('request.jwt.claim.sub','',false);
INSERT INTO libri.notes(library_id,book_id,owner_user_id,content) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','Imported');
SELECT pg_temp.assert_true((SELECT count(*)=5 FROM libri.activity_events),'imports produce no current activity');
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.activity_events),'revoked owner loses reads');
DO $$ BEGIN
 BEGIN PERFORM libri.log_application_activity('00000000-0000-4000-8000-000000000010','search.query',p_query=>'revoked'); RAISE EXCEPTION 'revoked owner log permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM value FROM public.buildos_control; RAISE EXCEPTION 'shared data permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Cascades cover both a deleted member in a surviving library and library purge.
DELETE FROM libri.notes WHERE owner_user_id='00000000-0000-4000-8000-000000000002';
DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.activity_events WHERE event_type='note.created'),'actor purge removes own activity');
DELETE FROM libri.libraries WHERE id='00000000-0000-4000-8000-000000000010';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM libri.activity_events),'library purge removes activity');
SELECT pg_temp.assert_true((SELECT value='unchanged' FROM public.buildos_control),'shared data unchanged');
