-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
SET timezone='UTC';
\ir fixtures/libri_derived_artifacts_profiles_base.sql
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='libri_worker') THEN CREATE ROLE libri_worker NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='libri_frontend_reader') THEN CREATE ROLE libri_frontend_reader NOLOGIN; END IF;
END $$;
\ir ../migrations/20261004012951_libri_application_activity.sql
\ir ../migrations/20261004015552_libri_manual_book_edits.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
INSERT INTO libri.libraries(id,slug,name,created_by) VALUES ('00000000-0000-4000-8000-000000000010','one','One','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','two','Two','00000000-0000-4000-8000-000000000003');
INSERT INTO libri.library_members(library_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','editor'),('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000003','owner');
INSERT INTO libri.books(id,library_id,title,slug,updated_at,indexing) VALUES ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','Book','book','2000-01-01','{"hasToc":true}'),('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','Foreign','foreign','2000-01-01','{}');
INSERT INTO libri.chapters(id,library_id,book_id,position,number,title,summary,research_payload,updated_at) VALUES ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',0,'1','Chapter','Retained','{"evidence":"retained"}','2000-01-01');
INSERT INTO libri.agent_profiles(id,library_id,book_id,name,slug,kind,primary_model,configuration,updated_at) VALUES ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','Expert','expert','book_expert','existing','{"legacy_profile_version":2,"agent_blueprint":{"retained":true}}','2000-01-01');
INSERT INTO libri.derived_artifacts(id,library_id,agent_profile_id,artifact_type,content,content_sha256,idempotency_key,version,updated_at) VALUES
 ('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000040','agent_prompt','Original prompt',repeat('a',64),'prompt',3,'2000-01-01'),
 ('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000040','agent_knowledge_doc','Existing knowledge',repeat('b',64),'knowledge',2,'2000-01-01');
INSERT INTO libri.derived_artifacts(library_id,book_id,artifact_type,content,content_sha256,idempotency_key) VALUES ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','book_analysis','Existing analysis',repeat('c',64),'analysis');
CREATE TABLE public.buildos_control(value text);
INSERT INTO public.buildos_control VALUES ('unchanged');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.edit_application_record(uuid,text,uuid,timestamptz,jsonb)','EXECUTE') AND NOT has_function_privilege('libri_worker','libri.edit_application_record(uuid,text,uuid,timestamptz,jsonb)','EXECUTE'),'no new anonymous or worker authority');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.derived_artifacts','INSERT,UPDATE,DELETE'),'no raw artifact writes');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000020','2000-01-01','{"title":"No"}'); RAISE EXCEPTION 'editor permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000011','book','00000000-0000-4000-8000-000000000021','2000-01-01','{"title":"No"}'); RAISE EXCEPTION 'foreign library permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000021','2000-01-01','{"title":"No"}'); RAISE EXCEPTION 'foreign row permitted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000020','2000-01-01','{"indexing":{}}'); RAISE EXCEPTION 'research overwrite permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000020','2000-01-01','{"year":1.5}'); RAISE EXCEPTION 'bad year permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000020','2000-01-01','{"domains":[null]}'); RAISE EXCEPTION 'null domain permitted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT libri.edit_application_record('00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000020','2000-01-01','{"title":"New café","year":2001,"pageCount":120,"isbn10":"0-123-45678-X","domains":["Systems"," systems ","Writing"],"subtitle":null}');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT title='New café' AND title_normalized='new cafe' AND slug='book' AND year=2001 AND page_count=120 AND isbn10_normalized='012345678X' AND indexing='{"hasToc":true}'::jsonb FROM libri.books WHERE id='00000000-0000-4000-8000-000000000020'),'atomic normalized book edit and preserved URL/research');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.book_domains),'domain labels dedupe case-insensitively');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.activity_events WHERE event_type='book.updated' AND book_title='New café' AND actor_user_id='00000000-0000-4000-8000-000000000001'),'book activity commits with update');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM libri.derived_artifacts WHERE status='outdated' AND content IN ('Existing analysis','Existing knowledge')),'dependent content retained and marked outdated');
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000020','2000-01-01','{"title":"Stale"}'); RAISE EXCEPTION 'stale edit permitted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
BEGIN;
SELECT libri.edit_application_record('00000000-0000-4000-8000-000000000010','chapter','00000000-0000-4000-8000-000000000030','2000-01-01','{"title":"Rolled back","number":"I","page":"iv"}');
ROLLBACK;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT title='Chapter' FROM libri.chapters),'rollback preserves chapter');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM libri.activity_events),'rollback removes chapter event');
SET ROLE authenticated;
SELECT libri.edit_application_record('00000000-0000-4000-8000-000000000010','chapter','00000000-0000-4000-8000-000000000030','2000-01-01','{"title":"Renamed chapter","number":"I","page":"iv"}');
SELECT libri.edit_application_record('00000000-0000-4000-8000-000000000010','agent_prompt','00000000-0000-4000-8000-000000000040','2000-01-01','{"agentPrompt":"  Revised prompt  ","expectedPromptId":"00000000-0000-4000-8000-000000000050","expectedPromptUpdatedAt":"2000-01-01T00:00:00Z"}');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT title='Renamed chapter' AND page_start='iv' AND position=0 AND summary='Retained' AND research_payload='{"evidence":"retained"}'::jsonb FROM libri.chapters),'chapter metadata preserves evidence');
SELECT pg_temp.assert_true((SELECT content='Revised prompt' AND version=4 AND model='manual' AND supersedes_artifact_id='00000000-0000-4000-8000-000000000050' AND content_sha256=encode(sha256(convert_to('Revised prompt','UTF8')),'hex') FROM libri.derived_artifacts WHERE artifact_type='agent_prompt' AND is_current),'new prompt version preserves provenance and checksum');
SELECT pg_temp.assert_true((SELECT NOT is_current AND content='Original prompt' FROM libri.derived_artifacts WHERE id='00000000-0000-4000-8000-000000000050'),'old prompt retained');
SELECT pg_temp.assert_true((SELECT configuration->>'legacy_profile_version'='3' AND configuration->'agent_blueprint'='{"retained":true}'::jsonb FROM libri.agent_profiles),'profile version increments without losing configuration');
-- A prompt changed independently of the profile is also rejected.
SELECT updated_at AS profile_version FROM libri.agent_profiles WHERE id='00000000-0000-4000-8000-000000000040' \gset
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000010','agent_prompt','00000000-0000-4000-8000-000000000040',(SELECT updated_at FROM libri.agent_profiles WHERE id='00000000-0000-4000-8000-000000000040'),'{"agentPrompt":"Stale","expectedPromptId":"00000000-0000-4000-8000-000000000050","expectedPromptUpdatedAt":"2000-01-01T00:00:00Z"}'); RAISE EXCEPTION 'stale prompt permitted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM libri.library_members WHERE user_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM libri.edit_application_record('00000000-0000-4000-8000-000000000010','book','00000000-0000-4000-8000-000000000020','2000-01-01','{"title":"No"}'); RAISE EXCEPTION 'revoked owner permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM value FROM public.buildos_control; RAISE EXCEPTION 'shared read permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value='unchanged' FROM public.buildos_control),'shared data unchanged');
