-- supabase/tests/20260830163828_fix_task_series_enable_schema_drift.test.sql
-- Disposable proof for recurring-task series creation against the current task schema.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

\ir fixtures/relationship_plan_base.sql
\ir ../migrations/20260830163828_fix_task_series_enable_schema_drift.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion failed: %', p_message;
	END IF;
END;
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.task_series_enable(uuid,uuid,jsonb,jsonb)',
		'EXECUTE'
	),
	'anon must not enable task series'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.task_series_enable(uuid,uuid,jsonb,jsonb)',
		'EXECUTE'
	),
	'authenticated users need to enable their own task series through RLS'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.task_series_enable(uuid,uuid,jsonb,jsonb)',
		'EXECUTE'
	),
	'background task processing needs to enable task series'
);
SELECT pg_temp.assert_true(
	NOT (
		SELECT prosecdef
		FROM pg_proc
		WHERE oid = 'public.task_series_enable(uuid,uuid,jsonb,jsonb)'::regprocedure
	),
	'task series creation must remain SECURITY INVOKER'
);
SELECT pg_temp.assert_true(
	(
		SELECT proconfig @> ARRAY['search_path=""']
		FROM pg_proc
		WHERE oid = 'public.task_series_enable(uuid,uuid,jsonb,jsonb)'::regprocedure
	),
	'task series creation must use a fixed empty search_path'
);

INSERT INTO public.onto_actors (id)
VALUES ('10000000-0000-0000-0000-000000000031');

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES (
	'20000000-0000-0000-0000-000000000031',
	'Recurring task proof',
	'project.default',
	'10000000-0000-0000-0000-000000000031'
);

INSERT INTO public.onto_tasks (id, project_id, type_key, title, created_by, props)
VALUES (
	'40000000-0000-0000-0000-000000000031',
	'20000000-0000-0000-0000-000000000031',
	'task.execute',
	'Master recurring task',
	'10000000-0000-0000-0000-000000000031',
	'{}'::jsonb
);

SELECT public.task_series_enable(
	'40000000-0000-0000-0000-000000000031',
	'50000000-0000-0000-0000-000000000031',
	jsonb_build_object(
		'is_recurring', true,
		'series_id', '50000000-0000-0000-0000-000000000031'
	),
	jsonb_build_array(jsonb_build_object(
		'project_id', '20000000-0000-0000-0000-000000000031',
		'type_key', 'task.review',
		'title', 'First recurring task instance',
		'state_key', 'todo',
		'due_at', '2026-09-01T14:00:00.000Z',
		'priority', 2,
		'props', jsonb_build_object(
			'series_id', '50000000-0000-0000-0000-000000000031'
		),
		'created_by', '10000000-0000-0000-0000-000000000031'
	))
);

SELECT pg_temp.assert_true(
	(
		SELECT props->>'series_id' = '50000000-0000-0000-0000-000000000031'
		FROM public.onto_tasks
		WHERE id = '40000000-0000-0000-0000-000000000031'
	),
	'enabling the series must update the master task props'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM public.onto_tasks
		WHERE project_id = '20000000-0000-0000-0000-000000000031'
			AND title = 'First recurring task instance'
			AND type_key = 'task.review'
			AND state_key = 'todo'
			AND priority = 2
			AND props->>'series_id' = '50000000-0000-0000-0000-000000000031'
	),
	'the first task instance must be inserted with the current schema and requested type'
);

ROLLBACK;
