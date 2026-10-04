-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_chapter_research_base.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT pg_temp.assert_true(has_function_privilege('libri_worker','libri.read_chapter_research_input(uuid,integer,uuid)','EXECUTE'),'worker leased input granted');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','libri.read_chapter_research_input(uuid,integer,uuid)','EXECUTE'),'session worker input denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('libri_worker','libri.build_chapter_research_input(uuid,uuid,uuid,boolean)','EXECUTE'),'unfenced worker input denied');
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.chapter_research_evidence','SELECT'),'worker raw evidence denied');
SELECT pg_temp.assert_true(NOT has_column_privilege('libri_worker','libri.chapters','summary','UPDATE'),'worker canonical writes denied');
