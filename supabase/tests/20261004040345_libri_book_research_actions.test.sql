-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_book_research_actions_base.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT pg_temp.assert_true(has_function_privilege('authenticated','libri.enqueue_book_research(uuid,uuid,uuid,text,text,text)','EXECUTE'),'owner session entry granted');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.enqueue_book_research(uuid,uuid,uuid,text,text,text)','EXECUTE'),'anonymous entry denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('libri_worker','libri.enqueue_book_research(uuid,uuid,uuid,text,text,text)','EXECUTE'),'worker cannot create owner requests');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.book_research_requests','INSERT'),'no raw session writes');
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM libri.enqueue_book_research(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'agent_profile');
  RAISE EXCEPTION 'no-session request was admitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
