-- supabase/tests/20260803019000_atomic_task_relationship_mutations.test.sql
-- Disposable PostgreSQL verification for task row/assignee/relationship
-- transactions. Load relationship_plan_base.sql, then migrations
-- 20260803015000, 20260501000000, 20260702010000, and 20260803019000.

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

CREATE OR REPLACE FUNCTION pg_temp.task_goal_plan(p_task_id uuid, p_goal_id uuid)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'references', jsonb_build_array(jsonb_build_object(
			'kind', 'goal',
			'id', p_goal_id
		)),
		'entityContainment', jsonb_build_object(
			'type', 'containment',
			'child', jsonb_build_object('kind', 'task', 'id', p_task_id),
			'expectedEdges', NULL,
			'desiredEdges', jsonb_build_array(jsonb_build_object(
				'project_id', '20000000-0000-0000-0000-000000000001',
				'src_kind', 'goal',
				'src_id', p_goal_id,
				'dst_kind', 'task',
				'dst_id', p_task_id,
				'rel', 'has_task',
				'props', jsonb_build_object('is_primary', true)
			))
		),
		'semantic', jsonb_build_array(),
		'projectEdges', jsonb_build_array(),
		'childContainment', jsonb_build_array()
	);
$$;

CREATE OR REPLACE FUNCTION pg_temp.task_missing_reference_plan(p_task_id uuid)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'references', jsonb_build_array(jsonb_build_object(
			'kind', 'document',
			'id', '90000000-0000-0000-0000-000000000099'
		)),
		'entityContainment', jsonb_build_object(
			'type', 'containment',
			'child', jsonb_build_object('kind', 'task', 'id', p_task_id),
			'expectedEdges', NULL,
			'desiredEdges', jsonb_build_array()
		),
		'semantic', jsonb_build_array(),
		'projectEdges', jsonb_build_array(),
		'childContainment', jsonb_build_array()
	);
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.onto_task_create_with_relationships_atomic(jsonb,jsonb,boolean,uuid[],uuid,text,text)',
		'EXECUTE'
	),
	'anon must not execute atomic task create with relationships'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.onto_task_create_with_relationships_atomic(jsonb,jsonb,boolean,uuid[],uuid,text,text)',
		'EXECUTE'
	),
	'authenticated must execute atomic task create with relationships'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.onto_task_update_with_relationships_atomic(uuid,jsonb,boolean,uuid[],uuid,jsonb,text)',
		'EXECUTE'
	),
	'anon must not execute atomic task update with relationships'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.onto_task_update_with_relationships_atomic(uuid,jsonb,boolean,uuid[],uuid,jsonb,text)',
		'EXECUTE'
	),
	'authenticated must execute atomic task update with relationships'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.onto_task_create_atomic(jsonb,boolean,uuid[],uuid,text,text)',
		'EXECUTE'
	),
	'anon must not execute the underlying task create command'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.onto_task_update_atomic(uuid,jsonb,boolean,uuid[],uuid,text)',
		'EXECUTE'
	),
	'anon must not execute the underlying task update command'
);

INSERT INTO public.onto_actors (id)
VALUES
	('10000000-0000-0000-0000-000000000001'),
	('10000000-0000-0000-0000-000000000002'),
	('10000000-0000-0000-0000-000000000003');

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES (
	'20000000-0000-0000-0000-000000000001',
	'Atomic tasks',
	'project.default',
	'10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.onto_goals (id, project_id, name, type_key, created_by)
VALUES
	(
		'30000000-0000-0000-0000-000000000001',
		'20000000-0000-0000-0000-000000000001',
		'First goal',
		'goal.default',
		'10000000-0000-0000-0000-000000000001'
	),
	(
		'30000000-0000-0000-0000-000000000002',
		'20000000-0000-0000-0000-000000000001',
		'Second goal',
		'goal.default',
		'10000000-0000-0000-0000-000000000001'
	);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.onto_task_create_with_relationships_atomic(
	jsonb_build_object(
		'id', '40000000-0000-0000-0000-000000000001',
		'project_id', '20000000-0000-0000-0000-000000000001',
		'title', 'Created atomically',
		'type_key', 'task.default',
		'state_key', 'todo',
		'priority', 2,
		'props', jsonb_build_object('source', 'test'),
		'created_by', '10000000-0000-0000-0000-000000000001'
	),
	pg_temp.task_goal_plan(
		'40000000-0000-0000-0000-000000000001',
		'30000000-0000-0000-0000-000000000001'
	),
	true,
	ARRAY['10000000-0000-0000-0000-000000000002']::uuid[],
	'10000000-0000-0000-0000-000000000001',
	'manual',
	'task-create-key'
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_tasks
		WHERE id = '40000000-0000-0000-0000-000000000001'
			AND title = 'Created atomically'
	),
	'atomic create must persist the task'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_task_assignees
		WHERE task_id = '40000000-0000-0000-0000-000000000001'
			AND assignee_actor_id = '10000000-0000-0000-0000-000000000002'
	),
	'atomic create must persist assignees'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_id = '30000000-0000-0000-0000-000000000001'
			AND rel = 'has_task'
			AND dst_id = '40000000-0000-0000-0000-000000000001'
	),
	'atomic create must persist task containment'
);

-- A stable idempotency key returns the original row and does not apply the
-- newly generated task ID or duplicate relationships.
SELECT public.onto_task_create_with_relationships_atomic(
	jsonb_build_object(
		'id', '40000000-0000-0000-0000-000000000002',
		'project_id', '20000000-0000-0000-0000-000000000001',
		'title', 'Replay',
		'created_by', '10000000-0000-0000-0000-000000000001'
	),
	pg_temp.task_goal_plan(
		'40000000-0000-0000-0000-000000000002',
		'30000000-0000-0000-0000-000000000002'
	),
	false,
	NULL,
	NULL,
	'manual',
	'task-create-key'
);

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM public.onto_tasks
		WHERE id = '40000000-0000-0000-0000-000000000002'
	),
	'idempotent replay must not create a second task'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.onto_edges
		WHERE dst_id = '40000000-0000-0000-0000-000000000001'),
	'idempotent replay must not duplicate or replace relationships'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_task_create_with_relationships_atomic(
			jsonb_build_object(
				'id', '40000000-0000-0000-0000-000000000003',
				'project_id', '20000000-0000-0000-0000-000000000001',
				'title', 'Must roll back',
				'created_by', '10000000-0000-0000-0000-000000000001'
			),
			pg_temp.task_missing_reference_plan(
				'40000000-0000-0000-0000-000000000003'
			),
			true,
			ARRAY['10000000-0000-0000-0000-000000000002']::uuid[],
			'10000000-0000-0000-0000-000000000001',
			'manual',
			'task-create-failure'
		);
		RAISE EXCEPTION 'expected atomic create failure';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		IF v_message = 'expected atomic create failure' THEN
			RAISE;
		END IF;
		PERFORM pg_temp.assert_true(
			v_message = 'relationship_reference_not_found:document',
			'create must surface relationship failure'
		);
	END;

	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.onto_tasks
			WHERE id = '40000000-0000-0000-0000-000000000003'
		),
		'failed relationships must roll back task create'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.onto_task_assignees
			WHERE task_id = '40000000-0000-0000-0000-000000000003'
		),
		'failed relationships must roll back assignee create'
	);
END;
$$;

SELECT public.onto_task_update_with_relationships_atomic(
	'40000000-0000-0000-0000-000000000001',
	jsonb_build_object('title', 'Updated atomically'),
	true,
	ARRAY['10000000-0000-0000-0000-000000000003']::uuid[],
	'10000000-0000-0000-0000-000000000001',
	pg_temp.task_goal_plan(
		'40000000-0000-0000-0000-000000000001',
		'30000000-0000-0000-0000-000000000002'
	),
	'manual'
);

SELECT pg_temp.assert_true(
	(SELECT title = 'Updated atomically' FROM public.onto_tasks
		WHERE id = '40000000-0000-0000-0000-000000000001'),
	'atomic update must persist task fields'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_task_assignees
		WHERE task_id = '40000000-0000-0000-0000-000000000001'
			AND assignee_actor_id = '10000000-0000-0000-0000-000000000003'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.onto_task_assignees
		WHERE task_id = '40000000-0000-0000-0000-000000000001'
			AND assignee_actor_id = '10000000-0000-0000-0000-000000000002'
	),
	'atomic update must replace assignees'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_id = '30000000-0000-0000-0000-000000000002'
			AND rel = 'has_task'
			AND dst_id = '40000000-0000-0000-0000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_id = '30000000-0000-0000-0000-000000000001'
			AND rel = 'has_task'
			AND dst_id = '40000000-0000-0000-0000-000000000001'
	),
	'atomic update must replace task containment'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_task_update_with_relationships_atomic(
			'40000000-0000-0000-0000-000000000001',
			jsonb_build_object('title', 'Must not persist'),
			true,
			ARRAY['10000000-0000-0000-0000-000000000002']::uuid[],
			'10000000-0000-0000-0000-000000000001',
			pg_temp.task_missing_reference_plan(
				'40000000-0000-0000-0000-000000000001'
			),
			'manual'
		);
		RAISE EXCEPTION 'expected atomic update failure';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		IF v_message = 'expected atomic update failure' THEN
			RAISE;
		END IF;
		PERFORM pg_temp.assert_true(
			v_message = 'relationship_reference_not_found:document',
			'update must surface relationship failure'
		);
	END;

	PERFORM pg_temp.assert_true(
		(SELECT title = 'Updated atomically' FROM public.onto_tasks
			WHERE id = '40000000-0000-0000-0000-000000000001'),
		'failed relationships must roll back task fields'
	);
	PERFORM pg_temp.assert_true(
		EXISTS (
			SELECT 1 FROM public.onto_task_assignees
			WHERE task_id = '40000000-0000-0000-0000-000000000001'
				AND assignee_actor_id = '10000000-0000-0000-0000-000000000003'
		)
		AND NOT EXISTS (
			SELECT 1 FROM public.onto_task_assignees
			WHERE task_id = '40000000-0000-0000-0000-000000000001'
				AND assignee_actor_id = '10000000-0000-0000-0000-000000000002'
		),
		'failed relationships must roll back assignee replacement'
	);
END;
$$;

SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_task_create_with_relationships_atomic(
			jsonb_build_object(
				'id', '40000000-0000-0000-0000-000000000004',
				'project_id', '20000000-0000-0000-0000-000000000001',
				'title', 'Denied',
				'created_by', '10000000-0000-0000-0000-000000000001'
			),
			pg_temp.task_goal_plan(
				'40000000-0000-0000-0000-000000000004',
				'30000000-0000-0000-0000-000000000001'
			)
		);
		RAISE EXCEPTION 'expected access denial';
	EXCEPTION WHEN insufficient_privilege THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		PERFORM pg_temp.assert_true(
			v_message LIKE 'access_denied:%',
			'authenticated caller without write access must be denied'
		);
	END;
END;
$$;

ROLLBACK;
