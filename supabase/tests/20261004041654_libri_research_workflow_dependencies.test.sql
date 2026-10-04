-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_research_workflow_base.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
SELECT pg_temp.assert_true(has_function_privilege('libri_worker','libri.prepare_research_workflow(uuid,integer,uuid,jsonb)','EXECUTE'),'worker planner granted');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','libri.prepare_research_workflow(uuid,integer,uuid,jsonb)','EXECUTE'),'session planner denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','libri.prepare_research_workflow(uuid,integer,uuid,jsonb)','EXECUTE'),'anonymous planner denied');
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.research_step_dependencies','INSERT'),'no raw dependency writes');
SELECT pg_temp.assert_true(NOT has_table_privilege('libri_worker','libri.research_steps','INSERT'),'no raw step creation');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','libri.research_step_dependencies','SELECT'),'private workflow graph');
