-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_book_synthesis_base.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT pg_temp.assert_true(has_function_privilege('libri_worker','libri.read_book_agent_input(uuid,integer,uuid)','EXECUTE'),'worker gets fenced agent read');
SELECT pg_temp.assert_true(has_function_privilege('libri_worker','libri.persist_book_agent_result(uuid,integer,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,bigint,bigint,bigint,text)','EXECUTE'),'worker gets fenced agent completion');
SELECT pg_temp.assert_true(NOT has_function_privilege('libri_worker','libri.build_book_research_input(uuid,uuid)','EXECUTE'),'worker cannot bypass task fence');
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','libri_frontend_reader'] LOOP
  PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,'libri.read_book_agent_input(uuid,integer,uuid)','EXECUTE'),'client cannot use agent worker read');
  PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,'libri.persist_book_agent_result(uuid,integer,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,bigint,bigint,bigint,text)','EXECUTE'),'client cannot use agent worker completion');
  PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,'libri.build_book_research_input(uuid,uuid)','EXECUTE'),'client cannot use private context helper');
 END LOOP;
END $$;
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.agent_profiles','INSERT'),'no raw profile writes');
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.derived_artifacts','INSERT'),'no raw artifact writes');
SET ROLE libri_worker;
DO $$ BEGIN
 BEGIN
  PERFORM libri.read_book_agent_input(gen_random_uuid(),1,gen_random_uuid());
  RAISE EXCEPTION 'missing lease exposed book context';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
