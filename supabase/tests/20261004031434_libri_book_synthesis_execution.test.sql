-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_book_synthesis_base.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT pg_temp.assert_true(has_function_privilege('libri_worker','libri.read_book_synthesis_input(uuid,integer,uuid)','EXECUTE'),'worker context capability granted');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','libri.read_book_synthesis_input(uuid,integer,uuid)','EXECUTE'),'session cannot impersonate worker');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.read_book_synthesis_input(uuid,integer,uuid)','EXECUTE'),'anonymous context access denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('service_role','libri.read_book_synthesis_input(uuid,integer,uuid)','EXECUTE'),'service role does not inherit worker capability');
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.notes','SELECT'),'worker receives no raw private-note access');
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.derived_artifacts','INSERT'),'worker receives no raw artifact insertion');
SET ROLE libri_worker;
DO $$ BEGIN
 BEGIN
  PERFORM libri.read_book_synthesis_input(gen_random_uuid(),1,gen_random_uuid());
  RAISE EXCEPTION 'missing claim exposed synthesis context';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
