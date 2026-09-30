-- supabase/tests/20260930130000_project_hierarchy_shared_shelf.check.sql
-- Rehearsal check for 20260930130000_project_hierarchy_shared_shelf.sql.
-- Run: pnpm db:rehearse supabase/migrations/20260930130000_project_hierarchy_shared_shelf.sql \
--        --check supabase/tests/20260930130000_project_hierarchy_shared_shelf.check.sql --role-probe
-- DISPOSABLE DATABASE ONLY. All fixtures are invented; everything rolls back.

\set ON_ERROR_STOP on

BEGIN;

GRANT USAGE ON SCHEMA auth TO authenticated;

CREATE TEMP TABLE results (key text PRIMARY KEY, value jsonb) ON COMMIT DROP;
GRANT ALL ON results TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

-- Runs p_sql and asserts it fails with p_expected in the message.
CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
	EXCEPTION WHEN OTHERS THEN
		IF position(p_expected IN SQLERRM) > 0 THEN
			RETURN;
		END IF;
		RAISE EXCEPTION 'assertion_failed: expected "%" from [%], got "%"', p_expected, p_sql, SQLERRM;
	END;
	RAISE EXCEPTION 'assertion_failed: expected "%" from [%], but it succeeded', p_expected, p_sql;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void LANGUAGE sql AS $$
	SELECT set_config(
		'request.jwt.claims',
		jsonb_build_object('sub', p_user, 'role', 'authenticated')::text,
		true
	);
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text), pg_temp.assert_raises(text, text),
	pg_temp.as_user(uuid) TO authenticated, service_role;

CREATE TEMP VIEW set_one_v AS SELECT value AS result FROM results WHERE key = 'set_one';
CREATE TEMP VIEW fam_child_v AS SELECT value AS f FROM results WHERE key = 'fam_child';
CREATE TEMP VIEW fam_hub_v AS SELECT value AS f FROM results WHERE key = 'fam_hub';
GRANT SELECT ON set_one_v, fam_child_v, fam_hub_v TO authenticated, service_role;

-- Users: A owns everything; B is a read-only collaborator on Client One only.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
	('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hierarchy-a@example.test', '', now(), now(), now()),
	('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hierarchy-b@example.test', '', now(), now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email) VALUES
	('a0000000-0000-4000-8000-000000000001', 'hierarchy-a@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'hierarchy-b@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, user_id, kind, name)
SELECT v.id, v.user_id, 'human', v.name
FROM (VALUES
	('b0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, 'A'),
	('b0000000-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid, 'B')
) AS v(id, user_id, name)
WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors AS a WHERE a.user_id = v.user_id);
INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
	('c0000000-0000-4000-8000-000000000001', 'Hub', 'project.business.consulting', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000002', 'Client One', 'project.web.client', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000003', 'Client Two', 'project.web.client', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000004', 'Other', 'project.base', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000005', 'Doomed hub', 'project.base', 'b0000000-0000-4000-8000-000000000001'),
	('c0000000-0000-4000-8000-000000000006', 'Orphan', 'project.base', 'b0000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'viewer', 'read');

-- Inserting with a protected column set is refused outside the functions.
SELECT pg_temp.assert_raises(
	$sql$INSERT INTO public.onto_projects (name, type_key, created_by, parent_project_id)
	VALUES ('Sneaky', 'project.base', 'b0000000-0000-4000-8000-000000000001',
		'c0000000-0000-4000-8000-000000000001')$sql$,
	'project_hierarchy_columns_protected'
);

-- 1. A nests Client One under Hub; the shared folder is created and pinned first.
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO results VALUES ('set_one', public.onto_project_set_parent_atomic(
	'c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001'
));
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT (result->>'shared_folder_document_id') IS NOT NULL FROM set_one_v),
	'first child creates the shared folder'
);
SELECT pg_temp.assert_true(
	(SELECT parent_project_id = 'c0000000-0000-4000-8000-000000000001'
		FROM public.onto_projects WHERE id = 'c0000000-0000-4000-8000-000000000002'),
	'child points at the parent'
);
SELECT pg_temp.assert_true(
	(SELECT p.shared_folder_document_id::text = (s.result->>'shared_folder_document_id')
		AND p.doc_structure->'root'->0->>'id' = (s.result->>'shared_folder_document_id')
		AND (p.doc_structure->>'version')::integer = 2
		FROM public.onto_projects AS p, set_one_v AS s
		WHERE p.id = 'c0000000-0000-4000-8000-000000000001'),
	'parent records the folder and pins it first in its tree'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.onto_project_structure_history
		WHERE project_id = 'c0000000-0000-4000-8000-000000000001' AND version = 2),
	'tree change is recorded in history'
);

-- 2. A second child reuses the same folder.
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT public.onto_project_set_parent_atomic(
		'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001'
	)->>'shared_folder_document_id' = (SELECT result->>'shared_folder_document_id' FROM set_one_v)),
	'second child reuses the folder'
);
RESET ROLE;

-- 3. Put one doc in the folder and one private doc at the hub's root.
INSERT INTO public.onto_documents (id, project_id, title, type_key, created_by) VALUES
	('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Brand Direction', 'document.default', 'b0000000-0000-4000-8000-000000000001'),
	('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Private notes', 'document.default', 'b0000000-0000-4000-8000-000000000001'),
	('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'Old offer', 'document.default', 'b0000000-0000-4000-8000-000000000001');
UPDATE public.onto_documents SET state_key = 'archived' WHERE id = 'd0000000-0000-4000-8000-000000000003';
UPDATE public.onto_projects AS p
SET doc_structure = jsonb_build_object(
	'version', 3,
	'root', jsonb_build_array(
		(p.doc_structure->'root'->0) || jsonb_build_object('children', jsonb_build_array(
			jsonb_build_object('id', 'd0000000-0000-4000-8000-000000000001', 'order', 0),
			jsonb_build_object('id', 'd0000000-0000-4000-8000-000000000003', 'order', 1)
		)),
		jsonb_build_object('id', 'd0000000-0000-4000-8000-000000000002', 'order', 1)
	)
)
WHERE p.id = 'c0000000-0000-4000-8000-000000000001';

-- 4. A sees the family from both sides.
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO results VALUES
	('fam_child', public.onto_project_family_v1('c0000000-0000-4000-8000-000000000002')),
	('fam_hub', public.onto_project_family_v1('c0000000-0000-4000-8000-000000000001'));
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT f->'parent'->>'name' = 'Hub'
		AND (f->'parent'->>'child_count')::integer = 2
		AND (f->'parent'->>'can_write')::boolean
		FROM fam_child_v),
	'child sees its parent'
);
SELECT pg_temp.assert_true(
	(SELECT jsonb_array_length(f->'shelf') = 1
		AND f->'shelf'->0->>'title' = 'Brand Direction'
		AND (f->'shelf'->0->>'depth')::integer = 0
		FROM fam_child_v),
	'shelf holds only live docs under the shared folder'
);
SELECT pg_temp.assert_true(
	(SELECT jsonb_array_length(f->'children') = 2
		AND f->'parent' = 'null'::jsonb
		AND (f->>'own_shared_folder_document_id') = (SELECT result->>'shared_folder_document_id' FROM set_one_v)
		FROM fam_hub_v),
	'hub sees its children and its own folder'
);

-- 5. B (collaborator on Client One only) sees nothing new.
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT f->'parent' = 'null'::jsonb AND jsonb_array_length(f->'shelf') = 0
		FROM (SELECT public.onto_project_family_v1('c0000000-0000-4000-8000-000000000002') AS f) AS x),
	'collaborator without parent access sees no parent and no shelf'
);
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_family_v1('c0000000-0000-4000-8000-000000000001')$sql$,
	'project_family_access_denied'
);
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c0000000-0000-4000-8000-000000000002', NULL)$sql$,
	'project_parent_access_denied'
);
RESET ROLE;

-- 6. One level only, no self-parenting, no direct column writes.
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004')$sql$,
	'project_has_children'
);
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002')$sql$,
	'project_parent_is_a_child'
);
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004')$sql$,
	'project_parent_self'
);
SELECT pg_temp.assert_raises(
	$sql$UPDATE public.onto_projects SET parent_project_id = NULL WHERE id = 'c0000000-0000-4000-8000-000000000003'$sql$,
	'project_hierarchy_columns_protected'
);

-- 7. Clearing a parent works through the function.
SELECT pg_temp.assert_true(
	(SELECT public.onto_project_set_parent_atomic('c0000000-0000-4000-8000-000000000003', NULL)->>'previous_parent_project_id'
		= 'c0000000-0000-4000-8000-000000000001'),
	'clearing reports the previous parent'
);
SELECT public.onto_project_set_parent_atomic(
	'c0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000005'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT parent_project_id IS NULL FROM public.onto_projects WHERE id = 'c0000000-0000-4000-8000-000000000003'),
	'Client Two has no parent after clearing'
);

-- 8. The service role reads a family for a named actor, and must name one.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(
	(SELECT jsonb_array_length(public.onto_project_family_v1(
		'c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001'
	)->'shelf') = 1),
	'service role reads the shelf for the named actor'
);
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_family_v1('c0000000-0000-4000-8000-000000000002')$sql$,
	'project_family_access_denied'
);
RESET ROLE;

-- 9. Hard-deleting a parent clears the child's pointer (ON DELETE SET NULL passes the guard).
DELETE FROM public.onto_projects WHERE id = 'c0000000-0000-4000-8000-000000000005';
SELECT pg_temp.assert_true(
	(SELECT parent_project_id IS NULL FROM public.onto_projects WHERE id = 'c0000000-0000-4000-8000-000000000006'),
	'deleting the parent clears the pointer'
);

ROLLBACK;
