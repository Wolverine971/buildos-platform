-- supabase/tests/20260803018000_atomic_plan_mutations.test.sql
-- Disposable PostgreSQL verification for atomic plan create/update commands.
-- Prerequisites: load relationship_plan_base.sql, then apply migrations
-- 20260803015000_atomic_relationship_plan.sql and
-- 20260803018000_atomic_plan_mutations.sql.

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
	NOT has_function_privilege('anon', 'public.onto_plan_create_atomic(jsonb,jsonb)', 'EXECUTE'),
	'anon must not execute atomic plan create'
);
SELECT pg_temp.assert_true(
	has_function_privilege('authenticated', 'public.onto_plan_create_atomic(jsonb,jsonb)', 'EXECUTE'),
	'authenticated must execute atomic plan create'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege('anon', 'public.onto_plan_update_atomic(uuid,jsonb,jsonb)', 'EXECUTE'),
	'anon must not execute atomic plan update'
);
SELECT pg_temp.assert_true(
	has_function_privilege('authenticated', 'public.onto_plan_update_atomic(uuid,jsonb,jsonb)', 'EXECUTE'),
	'authenticated must execute atomic plan update'
);

INSERT INTO public.onto_actors (id)
VALUES ('10000000-0000-0000-0000-000000000001');

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES (
	'20000000-0000-0000-0000-000000000001',
	'Atomic plans',
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

SELECT public.onto_plan_create_atomic(
	jsonb_build_object(
		'id', '40000000-0000-0000-0000-000000000001',
		'project_id', '20000000-0000-0000-0000-000000000001',
		'name', 'Created atomically',
		'type_key', 'plan.phase.project',
		'state_key', 'active',
		'plan', '# Execution plan',
		'description', 'Plan synopsis',
		'props', jsonb_build_object('start_date', '2026-08-03'),
		'created_by', '10000000-0000-0000-0000-000000000001'
	),
	jsonb_build_object(
		'references', jsonb_build_array(jsonb_build_object(
			'kind', 'goal',
			'id', '30000000-0000-0000-0000-000000000001'
		)),
		'entityContainment', jsonb_build_object(
			'type', 'containment',
			'child', jsonb_build_object(
				'kind', 'plan',
				'id', '40000000-0000-0000-0000-000000000001'
			),
			'expectedEdges', NULL,
			'desiredEdges', jsonb_build_array(jsonb_build_object(
				'project_id', '20000000-0000-0000-0000-000000000001',
				'src_kind', 'goal',
				'src_id', '30000000-0000-0000-0000-000000000001',
				'dst_kind', 'plan',
				'dst_id', '40000000-0000-0000-0000-000000000001',
				'rel', 'has_plan',
				'props', jsonb_build_object('is_primary', true)
			))
		),
		'semantic', jsonb_build_array(),
		'projectEdges', jsonb_build_array(),
		'childContainment', jsonb_build_array()
	)
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_plans
		WHERE id = '40000000-0000-0000-0000-000000000001'
			AND name = 'Created atomically'
			AND state_key = 'active'
			AND plan = '# Execution plan'
	),
	'atomic create must persist the plan row'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_kind = 'goal'
			AND src_id = '30000000-0000-0000-0000-000000000001'
			AND rel = 'has_plan'
			AND dst_id = '40000000-0000-0000-0000-000000000001'
	),
	'atomic create must persist plan containment'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_plan_create_atomic(
			jsonb_build_object(
				'id', '40000000-0000-0000-0000-000000000002',
				'project_id', '20000000-0000-0000-0000-000000000001',
				'name', 'Must roll back',
				'type_key', 'plan.default',
				'created_by', '10000000-0000-0000-0000-000000000001'
			),
			jsonb_build_object(
				'references', jsonb_build_array(jsonb_build_object(
					'kind', 'document',
					'id', '50000000-0000-0000-0000-000000000099'
				)),
				'entityContainment', jsonb_build_object(
					'type', 'containment',
					'child', jsonb_build_object(
						'kind', 'plan',
						'id', '40000000-0000-0000-0000-000000000002'
					),
					'expectedEdges', NULL,
					'desiredEdges', jsonb_build_array()
				),
				'semantic', jsonb_build_array(),
				'projectEdges', jsonb_build_array(),
				'childContainment', jsonb_build_array()
			)
		);
		RAISE EXCEPTION 'expected atomic create failure';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		IF v_message = 'expected atomic create failure' THEN
			RAISE;
		END IF;
		PERFORM pg_temp.assert_true(
			v_message = 'relationship_reference_not_found:document',
			'create must surface the relationship failure'
		);
	END;

	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.onto_plans
			WHERE id = '40000000-0000-0000-0000-000000000002'
		),
		'failed relationship application must roll back plan insert'
	);
END;
$$;

SELECT public.onto_plan_update_atomic(
	'40000000-0000-0000-0000-000000000001',
	jsonb_build_object('name', 'Updated atomically'),
	jsonb_build_object(
		'references', jsonb_build_array(jsonb_build_object(
			'kind', 'goal',
			'id', '30000000-0000-0000-0000-000000000002'
		)),
		'entityContainment', jsonb_build_object(
			'type', 'containment',
			'child', jsonb_build_object(
				'kind', 'plan',
				'id', '40000000-0000-0000-0000-000000000001'
			),
			'expectedEdges', NULL,
			'desiredEdges', jsonb_build_array(jsonb_build_object(
				'project_id', '20000000-0000-0000-0000-000000000001',
				'src_kind', 'goal',
				'src_id', '30000000-0000-0000-0000-000000000002',
				'dst_kind', 'plan',
				'dst_id', '40000000-0000-0000-0000-000000000001',
				'rel', 'has_plan',
				'props', jsonb_build_object('is_primary', true)
			))
		),
		'semantic', jsonb_build_array(),
		'projectEdges', jsonb_build_array(),
		'childContainment', jsonb_build_array()
	)
);

SELECT pg_temp.assert_true(
	(SELECT name = 'Updated atomically' FROM public.onto_plans
		WHERE id = '40000000-0000-0000-0000-000000000001'),
	'atomic update must persist the plan row'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_id = '30000000-0000-0000-0000-000000000001'
			AND rel = 'has_plan'
			AND dst_id = '40000000-0000-0000-0000-000000000001'
	),
	'atomic update must replace previous plan containment'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.onto_edges
		WHERE src_id = '30000000-0000-0000-0000-000000000002'
			AND rel = 'has_plan'
			AND dst_id = '40000000-0000-0000-0000-000000000001'
	),
	'atomic update must insert desired plan containment'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_plan_update_atomic(
			'40000000-0000-0000-0000-000000000001',
			jsonb_build_object('name', 'Must not persist'),
			jsonb_build_object(
				'references', jsonb_build_array(jsonb_build_object(
					'kind', 'document',
					'id', '50000000-0000-0000-0000-000000000099'
				)),
				'entityContainment', jsonb_build_object(
					'type', 'containment',
					'child', jsonb_build_object(
						'kind', 'plan',
						'id', '40000000-0000-0000-0000-000000000001'
					),
					'expectedEdges', NULL,
					'desiredEdges', jsonb_build_array()
				),
				'semantic', jsonb_build_array(),
				'projectEdges', jsonb_build_array(),
				'childContainment', jsonb_build_array()
			)
		);
		RAISE EXCEPTION 'expected atomic update failure';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		IF v_message = 'expected atomic update failure' THEN
			RAISE;
		END IF;
		PERFORM pg_temp.assert_true(
			v_message = 'relationship_reference_not_found:document',
			'update must surface the relationship failure'
		);
	END;

	PERFORM pg_temp.assert_true(
		(SELECT name = 'Updated atomically' FROM public.onto_plans
			WHERE id = '40000000-0000-0000-0000-000000000001'),
		'failed relationship application must roll back plan update'
	);
END;
$$;

SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_plan_create_atomic(
			jsonb_build_object(
				'id', '40000000-0000-0000-0000-000000000003',
				'project_id', '20000000-0000-0000-0000-000000000001',
				'name', 'Denied',
				'type_key', 'plan.default',
				'created_by', '10000000-0000-0000-0000-000000000001'
			),
			jsonb_build_object(
				'references', jsonb_build_array(),
				'entityContainment', jsonb_build_object(
					'type', 'containment',
					'child', jsonb_build_object(
						'kind', 'plan',
						'id', '40000000-0000-0000-0000-000000000003'
					),
					'expectedEdges', NULL,
					'desiredEdges', jsonb_build_array()
				),
				'semantic', jsonb_build_array(),
				'projectEdges', jsonb_build_array(),
				'childContainment', jsonb_build_array()
			)
		);
		RAISE EXCEPTION 'expected access denial';
	EXCEPTION WHEN insufficient_privilege THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		PERFORM pg_temp.assert_true(
			v_message = 'plan_create_access_denied',
			'authenticated caller without write access must be denied'
		);
	END;
END;
$$;

ROLLBACK;
