-- Disposable proof for the semantic-only task relationship wrapper correction.
-- Load relationship_plan_base.sql plus migrations 20260803015000,
-- 20260501000000, 20260803019000, and 20260810010000 before this file.

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
		'public.onto_apply_task_update_relationship_plan_atomic(uuid,uuid,jsonb)',
		'EXECUTE'
	),
	'anon must not execute the task relationship plan applier'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.onto_apply_task_update_relationship_plan_atomic(uuid,uuid,jsonb)',
		'EXECUTE'
	),
	'authenticated task updates need the guarded task relationship applier'
);
SELECT pg_temp.assert_true(
	NOT (
		SELECT prosecdef
		FROM pg_proc
		WHERE oid = 'public.onto_task_update_with_relationships_atomic(uuid,jsonb,boolean,uuid[],uuid,jsonb,text)'::regprocedure
	),
	'task update wrapper must remain SECURITY INVOKER'
);
SELECT pg_temp.assert_true(
	(
		SELECT proconfig @> ARRAY['search_path=public']
		FROM pg_proc
		WHERE oid = 'public.onto_task_update_with_relationships_atomic(uuid,jsonb,boolean,uuid[],uuid,jsonb,text)'::regprocedure
	),
	'task update wrapper must retain a fixed public search_path'
);

INSERT INTO public.onto_actors (id)
VALUES ('10000000-0000-0000-0000-000000000001');

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES (
	'20000000-0000-0000-0000-000000000001',
	'Semantic task update',
	'project.default',
	'10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.onto_goals (id, project_id, name, type_key, created_by)
VALUES (
	'30000000-0000-0000-0000-000000000001',
	'20000000-0000-0000-0000-000000000001',
	'Existing parent',
	'goal.default',
	'10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.onto_milestones (id, project_id, title, created_by)
VALUES (
	'35000000-0000-0000-0000-000000000001',
	'20000000-0000-0000-0000-000000000001',
	'Target milestone',
	'10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.onto_tasks (id, project_id, title, created_by)
VALUES (
	'40000000-0000-0000-0000-000000000001',
	'20000000-0000-0000-0000-000000000001',
	'Before semantic update',
	'10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.onto_edges (
	project_id, src_kind, src_id, rel, dst_kind, dst_id, props
)
VALUES (
	'20000000-0000-0000-0000-000000000001',
	'goal',
	'30000000-0000-0000-0000-000000000001',
	'has_task',
	'task',
	'40000000-0000-0000-0000-000000000001',
	jsonb_build_object('is_primary', true)
);

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.onto_task_update_with_relationships_atomic(
	'40000000-0000-0000-0000-000000000001',
	jsonb_build_object(
		'title', 'After semantic update',
		'props', jsonb_build_object(
			'supporting_milestone_id', '35000000-0000-0000-0000-000000000001'
		)
	),
	false,
	NULL,
	NULL,
	jsonb_build_object(
		'references', jsonb_build_array(jsonb_build_object(
			'kind', 'milestone',
			'id', '35000000-0000-0000-0000-000000000001'
		)),
		'entityContainment', NULL,
		'semantic', jsonb_build_array(jsonb_build_object(
			'type', 'semantic',
			'entity', jsonb_build_object(
				'kind', 'task',
				'id', '40000000-0000-0000-0000-000000000001'
			),
			'rel', 'targets_milestone',
			'direction', 'outgoing',
			'mode', 'replace',
			'desiredEdges', jsonb_build_array(jsonb_build_object(
				'project_id', '20000000-0000-0000-0000-000000000001',
				'src_kind', 'task',
				'src_id', '40000000-0000-0000-0000-000000000001',
				'dst_kind', 'milestone',
				'dst_id', '35000000-0000-0000-0000-000000000001',
				'rel', 'targets_milestone',
				'props', jsonb_build_object('is_primary', false)
			))
		)),
		'projectEdges', jsonb_build_array(),
		'childContainment', jsonb_build_array()
	),
	'manual'
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_kind = 'task'
			AND src_id = '40000000-0000-0000-0000-000000000001'
			AND rel = 'targets_milestone'
			AND dst_id = '35000000-0000-0000-0000-000000000001'
	),
	'semantic-only update must create the milestone edge'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_kind = 'goal'
			AND src_id = '30000000-0000-0000-0000-000000000001'
			AND rel = 'has_task'
			AND dst_id = '40000000-0000-0000-0000-000000000001'
	),
	'semantic-only update must preserve existing containment'
);
SELECT pg_temp.assert_true(
	(SELECT title = 'After semantic update'
		FROM public.onto_tasks
		WHERE id = '40000000-0000-0000-0000-000000000001'),
	'task row and semantic edge must commit together'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_task_update_with_relationships_atomic(
			'40000000-0000-0000-0000-000000000001',
			jsonb_build_object('title', 'Must roll back'),
			false,
			NULL,
			NULL,
			jsonb_build_object(
				'references', jsonb_build_array(),
				'entityContainment', NULL,
				'semantic', jsonb_build_array(jsonb_build_object(
					'type', 'semantic',
					'entity', jsonb_build_object(
						'kind', 'task',
						'id', '40000000-0000-0000-0000-000000000099'
					),
					'rel', 'targets_milestone',
					'direction', 'outgoing',
					'mode', 'replace',
					'desiredEdges', jsonb_build_array()
				)),
				'projectEdges', jsonb_build_array(),
				'childContainment', jsonb_build_array()
			),
			'manual'
		);
		RAISE EXCEPTION 'expected relationship-plan mismatch';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		IF v_message = 'expected relationship-plan mismatch' THEN
			RAISE;
		END IF;
		PERFORM pg_temp.assert_true(
			v_message = 'task_update_relationship_plan_mismatch',
			'mismatched semantic task must fail closed'
		);
	END;

	PERFORM pg_temp.assert_true(
		(SELECT title = 'After semantic update'
			FROM public.onto_tasks
			WHERE id = '40000000-0000-0000-0000-000000000001'),
		'mismatched semantic plan must not update the task'
	);
END;
$$;

ROLLBACK;
