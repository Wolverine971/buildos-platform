-- Disposable PostgreSQL verification for the atomic relationship-plan RPC.
-- Prerequisites: apply migration 20260803015000_atomic_relationship_plan.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

INSERT INTO public.onto_actors (id)
VALUES ('a5000000-0000-4000-8000-000000000001');

INSERT INTO public.onto_projects (id, name, type_key, created_by)
VALUES (
	'b5000000-0000-4000-8000-000000000001',
	'Relationship plan test',
	'project.default',
	'a5000000-0000-4000-8000-000000000001'
);

INSERT INTO public.onto_goals (id, project_id, name, created_by)
VALUES (
	'c5000000-0000-4000-8000-000000000001',
	'b5000000-0000-4000-8000-000000000001',
	'Goal',
	'a5000000-0000-4000-8000-000000000001'
);

INSERT INTO public.onto_milestones (id, project_id, title, created_by)
VALUES (
	'e5000000-0000-4000-8000-000000000001',
	'b5000000-0000-4000-8000-000000000001',
	'Milestone',
	'a5000000-0000-4000-8000-000000000001'
);

INSERT INTO public.onto_plans (id, project_id, name, type_key, created_by)
VALUES (
	'd5000000-0000-4000-8000-000000000001',
	'b5000000-0000-4000-8000-000000000001',
	'Plan',
	'plan.default',
	'a5000000-0000-4000-8000-000000000001'
);

INSERT INTO public.onto_documents (id, project_id, title, type_key, created_by)
VALUES
	(
		'f5000000-0000-4000-8000-000000000001',
		'b5000000-0000-4000-8000-000000000001',
		'Old document',
		'document.default',
		'a5000000-0000-4000-8000-000000000001'
	),
	(
		'f5000000-0000-4000-8000-000000000002',
		'b5000000-0000-4000-8000-000000000001',
		'New document',
		'document.default',
		'a5000000-0000-4000-8000-000000000001'
	);

INSERT INTO public.onto_edges (
	id, project_id, src_kind, src_id, rel, dst_kind, dst_id, props
)
VALUES
	(
		'15000000-0000-4000-8000-000000000001',
		'b5000000-0000-4000-8000-000000000001',
		'milestone',
		'e5000000-0000-4000-8000-000000000001',
		'has_plan',
		'plan',
		'd5000000-0000-4000-8000-000000000001',
		'{"is_primary":true}'::jsonb
	),
	(
		'15000000-0000-4000-8000-000000000002',
		'b5000000-0000-4000-8000-000000000001',
		'goal',
		'c5000000-0000-4000-8000-000000000001',
		'references',
		'document',
		'f5000000-0000-4000-8000-000000000001',
		'{"is_primary":false}'::jsonb
	);

SELECT pg_temp.assert_true(
	not has_function_privilege(
		'anon',
		'public.onto_apply_relationship_plan_atomic(uuid,jsonb)',
		'execute'
	),
	'anon must not execute the relationship plan RPC'
);

SELECT pg_temp.assert_true(
	has_function_privilege(
		'authenticated',
		'public.onto_apply_relationship_plan_atomic(uuid,jsonb)',
		'execute'
	),
	'authenticated callers must be able to execute the relationship plan RPC'
);

SELECT pg_temp.assert_true(
	not has_function_privilege(
		'authenticated',
		'public.onto_relationship_entity_in_project(uuid,text,uuid)',
		'execute'
	),
	'the relationship reference helper must remain private'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_apply_relationship_plan_atomic(
			'b5000000-0000-4000-8000-000000000001',
			'{
				"references":[],
				"entityContainment":null,
				"projectEdges":[],
				"semantic":[],
				"childContainment":[]
			}'::jsonb
		);
		RAISE EXCEPTION 'expected access denial';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		PERFORM pg_temp.assert_true(
			v_message = 'relationship_plan_access_denied',
			'access denial returned the wrong error'
		);
	END;
END;
$$;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT public.onto_apply_relationship_plan_atomic(
	'b5000000-0000-4000-8000-000000000001',
	'{
		"references":[
			{"kind":"plan","id":"d5000000-0000-4000-8000-000000000001"},
			{"kind":"document","id":"f5000000-0000-4000-8000-000000000002"}
		],
		"entityContainment":{
			"type":"containment",
			"child":{"kind":"goal","id":"c5000000-0000-4000-8000-000000000001"},
			"expectedEdges":null,
			"desiredEdges":[]
		},
		"projectEdges":[],
		"semantic":[{
			"type":"semantic",
			"entity":{"kind":"goal","id":"c5000000-0000-4000-8000-000000000001"},
			"rel":"references",
			"direction":"outgoing",
			"mode":"replace",
			"desiredEdges":[{
				"project_id":"b5000000-0000-4000-8000-000000000001",
				"src_kind":"goal",
				"src_id":"c5000000-0000-4000-8000-000000000001",
				"dst_kind":"document",
				"dst_id":"f5000000-0000-4000-8000-000000000002",
				"rel":"references",
				"props":{"is_primary":false}
			}]
		}],
		"childContainment":[{
			"type":"containment",
			"child":{"kind":"plan","id":"d5000000-0000-4000-8000-000000000001"},
			"expectedEdges":[{
				"project_id":"b5000000-0000-4000-8000-000000000001",
				"src_kind":"milestone",
				"src_id":"e5000000-0000-4000-8000-000000000001",
				"dst_kind":"plan",
				"dst_id":"d5000000-0000-4000-8000-000000000001",
				"rel":"has_plan",
				"props":{"is_primary":true}
			}],
			"desiredEdges":[{
				"project_id":"b5000000-0000-4000-8000-000000000001",
				"src_kind":"milestone",
				"src_id":"e5000000-0000-4000-8000-000000000001",
				"dst_kind":"plan",
				"dst_id":"d5000000-0000-4000-8000-000000000001",
				"rel":"has_plan",
				"props":{"is_primary":true}
			}]
		}]
	}'::jsonb
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.onto_edges
		WHERE id = '15000000-0000-4000-8000-000000000001'
			AND props = '{"is_primary":true}'::jsonb
	),
	'unchanged containment edge was not preserved'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.onto_edges
		WHERE src_id = 'c5000000-0000-4000-8000-000000000001'
			AND rel = 'references'
			AND dst_id = 'f5000000-0000-4000-8000-000000000002'
	),
	'semantic replacement did not insert the desired edge'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM public.onto_edges
		WHERE src_id = 'c5000000-0000-4000-8000-000000000001'
			AND rel = 'references'
			AND dst_id = 'f5000000-0000-4000-8000-000000000001'
	),
	'semantic replacement retained the old edge'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_apply_relationship_plan_atomic(
			'b5000000-0000-4000-8000-000000000001',
			'{
				"references":[],
				"entityContainment":null,
				"projectEdges":[],
				"semantic":[{
					"type":"semantic",
					"entity":{"kind":"goal","id":"c5000000-0000-4000-8000-000000000001"},
					"rel":"references","direction":"outgoing","mode":"replace",
					"desiredEdges":[{
						"project_id":"b5000000-0000-4000-8000-000000000001",
						"src_kind":"goal","src_id":"c5000000-0000-4000-8000-000000000001",
						"dst_kind":"document","dst_id":"f5000000-0000-4000-8000-000000000001",
						"rel":"references","props":{"is_primary":false}
					}]
				}],
				"childContainment":[{
					"type":"containment",
					"child":{"kind":"plan","id":"d5000000-0000-4000-8000-000000000001"},
					"expectedEdges":[],
					"desiredEdges":[]
				}]
			}'::jsonb
		);
		RAISE EXCEPTION 'expected containment conflict';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		PERFORM pg_temp.assert_true(
			v_message = 'relationship_containment_conflict',
			'containment conflict returned the wrong error'
		);
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.onto_edges
		WHERE src_id = 'c5000000-0000-4000-8000-000000000001'
			AND rel = 'references'
			AND dst_id = 'f5000000-0000-4000-8000-000000000002'
	),
	'containment conflict did not roll back the earlier semantic replacement'
);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_apply_relationship_plan_atomic(
			'b5000000-0000-4000-8000-000000000001',
			'{
				"references":[{"kind":"document","id":"f5000000-0000-4000-8000-000000000099"}],
				"entityContainment":null,
				"projectEdges":[],
				"semantic":[],
				"childContainment":[]
			}'::jsonb
		);
		RAISE EXCEPTION 'expected missing reference';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		PERFORM pg_temp.assert_true(
			v_message = 'relationship_reference_not_found:document',
			'missing reference returned the wrong error'
		);
	END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail_relationship_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF coalesce(current_setting('test.fail_relationship_insert', true), 'false')::boolean
		AND NEW.rel = 'references' THEN
		RAISE EXCEPTION 'test_relationship_insert_failure';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_fail_relationship_insert
BEFORE INSERT ON public.onto_edges
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_relationship_insert();

SELECT set_config('test.fail_relationship_insert', 'true', true);

DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM public.onto_apply_relationship_plan_atomic(
			'b5000000-0000-4000-8000-000000000001',
			'{
				"references":[{"kind":"document","id":"f5000000-0000-4000-8000-000000000001"}],
				"entityContainment":null,
				"projectEdges":[],
				"semantic":[{
					"type":"semantic",
					"entity":{"kind":"goal","id":"c5000000-0000-4000-8000-000000000001"},
					"rel":"references","direction":"outgoing","mode":"replace",
					"desiredEdges":[{
						"project_id":"b5000000-0000-4000-8000-000000000001",
						"src_kind":"goal","src_id":"c5000000-0000-4000-8000-000000000001",
						"dst_kind":"document","dst_id":"f5000000-0000-4000-8000-000000000001",
						"rel":"references","props":{"is_primary":false}
					}]
				}],
				"childContainment":[]
			}'::jsonb
		);
		RAISE EXCEPTION 'expected relationship insert failure';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
		PERFORM pg_temp.assert_true(
			v_message = 'test_relationship_insert_failure',
			'insert failure returned the wrong error'
		);
	END;
END;
$$;

SELECT set_config('test.fail_relationship_insert', 'false', true);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.onto_edges
		WHERE src_id = 'c5000000-0000-4000-8000-000000000001'
			AND rel = 'references'
			AND dst_id = 'f5000000-0000-4000-8000-000000000002'
	),
	'failed semantic insertion did not roll back its preceding delete'
);

ROLLBACK;
