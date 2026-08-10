-- Disposable proof for task-create milestone handling and idempotent replay.
-- Load relationship_plan_base.sql plus migrations 20260803015000,
-- 20260702010000, 20260803019000, 20260810010000, and 20260810020000 first.

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

INSERT INTO public.onto_actors (id)
VALUES ('11000000-0000-0000-0000-000000000001');

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES (
	'21000000-0000-0000-0000-000000000001',
	'Idempotent task create',
	'project.default',
	'11000000-0000-0000-0000-000000000001'
);

INSERT INTO public.onto_milestones (id, project_id, title, created_by)
VALUES (
	'31000000-0000-0000-0000-000000000001',
	'21000000-0000-0000-0000-000000000001',
	'Target milestone',
	'11000000-0000-0000-0000-000000000001'
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

CREATE TEMP TABLE task_create_result AS
SELECT public.onto_task_create_with_relationships_atomic(
	jsonb_build_object(
		'id', '41000000-0000-0000-0000-000000000001',
		'project_id', '21000000-0000-0000-0000-000000000001',
		'title', 'Created once',
		'type_key', 'task.default',
		'state_key', 'todo',
		'priority', 3,
		'props', jsonb_build_object(
			'supporting_milestone_id', '31000000-0000-0000-0000-000000000001'
		),
		'created_by', '11000000-0000-0000-0000-000000000001'
	),
	jsonb_build_object(
		'references', jsonb_build_array(jsonb_build_object(
			'kind', 'milestone',
			'id', '31000000-0000-0000-0000-000000000001'
		)),
		'entityContainment', jsonb_build_object(
			'type', 'containment',
			'child', jsonb_build_object(
				'kind', 'task',
				'id', '41000000-0000-0000-0000-000000000001'
			),
			'expectedEdges', NULL,
			'desiredEdges', jsonb_build_array(jsonb_build_object(
				'project_id', '21000000-0000-0000-0000-000000000001',
				'src_kind', 'project',
				'src_id', '21000000-0000-0000-0000-000000000001',
				'dst_kind', 'task',
				'dst_id', '41000000-0000-0000-0000-000000000001',
				'rel', 'has_task',
				'props', jsonb_build_object('is_primary', true)
			))
		),
		'semantic', jsonb_build_array(jsonb_build_object(
			'type', 'semantic',
			'entity', jsonb_build_object(
				'kind', 'task',
				'id', '41000000-0000-0000-0000-000000000001'
			),
			'rel', 'targets_milestone',
			'direction', 'outgoing',
			'mode', 'replace',
			'desiredEdges', jsonb_build_array(jsonb_build_object(
				'project_id', '21000000-0000-0000-0000-000000000001',
				'src_kind', 'task',
				'src_id', '41000000-0000-0000-0000-000000000001',
				'dst_kind', 'milestone',
				'dst_id', '31000000-0000-0000-0000-000000000001',
				'rel', 'targets_milestone',
				'props', jsonb_build_object('is_primary', false)
			))
		)),
		'projectEdges', jsonb_build_array(),
		'childContainment', jsonb_build_array()
	),
	false,
	NULL,
	NULL,
	'manual',
	'chat-effect:create-once'
) AS result;

SELECT pg_temp.assert_true(
	(SELECT NOT coalesce((result->>'idempotent_replay')::boolean, false) FROM task_create_result),
	'first create must not report a replay'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_kind = 'task'
			AND src_id = '41000000-0000-0000-0000-000000000001'
			AND rel = 'targets_milestone'
			AND dst_id = '31000000-0000-0000-0000-000000000001'
	),
	'create must atomically add the milestone edge'
);

CREATE TEMP TABLE task_create_replay AS
SELECT public.onto_task_create_with_relationships_atomic(
	jsonb_build_object(
		'id', '41000000-0000-0000-0000-000000000002',
		'project_id', '21000000-0000-0000-0000-000000000001',
		'title', 'Created once',
		'created_by', '11000000-0000-0000-0000-000000000001'
	),
	jsonb_build_object(
		'references', jsonb_build_array(),
		'entityContainment', jsonb_build_object(
			'type', 'containment',
			'child', jsonb_build_object(
				'kind', 'task',
				'id', '41000000-0000-0000-0000-000000000002'
			),
			'expectedEdges', NULL,
			'desiredEdges', jsonb_build_array()
		),
		'semantic', jsonb_build_array(),
		'projectEdges', jsonb_build_array(),
		'childContainment', jsonb_build_array()
	),
	false,
	NULL,
	NULL,
	'manual',
	'chat-effect:create-once'
) AS result;

SELECT pg_temp.assert_true(
	(SELECT (result->>'idempotent_replay')::boolean FROM task_create_replay),
	'same downstream key must report an idempotent replay'
);
SELECT pg_temp.assert_true(
	(SELECT result->'task'->>'id' = '41000000-0000-0000-0000-000000000001'
	 FROM task_create_replay),
	'replay must return the original task'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.onto_tasks WHERE idempotency_key = 'chat-effect:create-once'),
	'replay must not create a duplicate task'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.onto_edges
	 WHERE src_kind = 'task'
		AND src_id = '41000000-0000-0000-0000-000000000001'
		AND rel = 'targets_milestone'),
	'replay must not duplicate the milestone edge'
);

ROLLBACK;
