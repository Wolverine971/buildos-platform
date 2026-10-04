-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_single_chapter_research_base.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT pg_temp.assert_true(has_function_privilege('authenticated','libri.enqueue_chapter_research(uuid,uuid,uuid,text,text)','EXECUTE'),'owner entry point callable');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.enqueue_chapter_research(uuid,uuid,uuid,text,text)','EXECUTE') AND NOT has_function_privilege('libri_worker','libri.enqueue_chapter_research(uuid,uuid,uuid,text,text)','EXECUTE'),'no anonymous or worker admission');
