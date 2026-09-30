-- supabase/tests/20260930211000_project_hierarchy_attach_detach.check.sql
-- Rehearsal check for 20260930211000_project_hierarchy_attach_detach.sql.
-- Run (after the applied hierarchy/organize files the snapshot lacks):
--   pnpm db:rehearse supabase/migrations/20260930170110_organize_atomic_moves_and_journal.sql \
--     supabase/migrations/20260930210000_organize_guard_lock_order.sql \
--     supabase/migrations/20260930211000_project_hierarchy_attach_detach.sql \
--     --check supabase/tests/20260930211000_project_hierarchy_attach_detach.check.sql --role-probe
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

-- Family of p_project as p_user; returns the jsonb.
CREATE OR REPLACE FUNCTION pg_temp.family_as(p_user uuid, p_project uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM pg_temp.as_user(p_user);
	SET LOCAL ROLE authenticated;
	v := public.onto_project_family_v1(p_project);
	RESET ROLE;
	RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text), pg_temp.assert_raises(text, text),
	pg_temp.as_user(uuid) TO authenticated, service_role;

-- Users:
--   A  owns Hub, K1, K2, P1, Q1, C1, P2, C2
--   W  write collaborator on Hub; owns WX
--   O  admin collaborator on Hub; owns OX
--   S  stranger
--   R  read collaborator on Hub and K1
--   B  read collaborator on Hub, admin collaborator on K1
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
FROM (VALUES
	('a1000000-0000-4000-8000-000000000001'::uuid, 'attach-a@example.test'),
	('a1000000-0000-4000-8000-000000000002'::uuid, 'attach-w@example.test'),
	('a1000000-0000-4000-8000-000000000003'::uuid, 'attach-o@example.test'),
	('a1000000-0000-4000-8000-000000000004'::uuid, 'attach-s@example.test'),
	('a1000000-0000-4000-8000-000000000005'::uuid, 'attach-r@example.test'),
	('a1000000-0000-4000-8000-000000000006'::uuid, 'attach-b@example.test')
) AS v(id, email)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email)
SELECT id, email FROM auth.users WHERE email LIKE 'attach-%@example.test'
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, user_id, kind, name)
SELECT v.id, v.user_id, 'human', v.name
FROM (VALUES
	('b1000000-0000-4000-8000-000000000001'::uuid, 'a1000000-0000-4000-8000-000000000001'::uuid, 'A'),
	('b1000000-0000-4000-8000-000000000002'::uuid, 'a1000000-0000-4000-8000-000000000002'::uuid, 'W'),
	('b1000000-0000-4000-8000-000000000003'::uuid, 'a1000000-0000-4000-8000-000000000003'::uuid, 'O'),
	('b1000000-0000-4000-8000-000000000004'::uuid, 'a1000000-0000-4000-8000-000000000004'::uuid, 'S'),
	('b1000000-0000-4000-8000-000000000005'::uuid, 'a1000000-0000-4000-8000-000000000005'::uuid, 'R'),
	('b1000000-0000-4000-8000-000000000006'::uuid, 'a1000000-0000-4000-8000-000000000006'::uuid, 'B')
) AS v(id, user_id, name)
WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors AS a WHERE a.user_id = v.user_id);

INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
	('c1000000-0000-4000-8000-000000000011', 'Hub', 'project.base', 'b1000000-0000-4000-8000-000000000001'),
	('c1000000-0000-4000-8000-000000000012', 'K1', 'project.base', 'b1000000-0000-4000-8000-000000000001'),
	('c1000000-0000-4000-8000-000000000013', 'K2', 'project.base', 'b1000000-0000-4000-8000-000000000001'),
	('c1000000-0000-4000-8000-000000000014', 'WX', 'project.base', 'b1000000-0000-4000-8000-000000000002'),
	('c1000000-0000-4000-8000-000000000015', 'OX', 'project.base', 'b1000000-0000-4000-8000-000000000003'),
	('c1000000-0000-4000-8000-000000000016', 'C1', 'project.base', 'b1000000-0000-4000-8000-000000000001'),
	('c1000000-0000-4000-8000-000000000017', 'P1', 'project.base', 'b1000000-0000-4000-8000-000000000001'),
	('c1000000-0000-4000-8000-000000000018', 'Q1', 'project.base', 'b1000000-0000-4000-8000-000000000001'),
	('c1000000-0000-4000-8000-000000000019', 'C2', 'project.base', 'b1000000-0000-4000-8000-000000000001'),
	('c1000000-0000-4000-8000-00000000001a', 'P2', 'project.base', 'b1000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('c1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000002', 'editor', 'write'),
	('c1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000003', 'owner', 'admin'),
	('c1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000005', 'viewer', 'read'),
	('c1000000-0000-4000-8000-000000000012', 'b1000000-0000-4000-8000-000000000005', 'viewer', 'read'),
	('c1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000006', 'viewer', 'read'),
	('c1000000-0000-4000-8000-000000000012', 'b1000000-0000-4000-8000-000000000006', 'owner', 'admin');

-- 1. Attach needs admin on both sides.
-- W is admin on WX and can read Hub, but only writes there: told admin is required.
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000014', 'c1000000-0000-4000-8000-000000000011')$sql$,
	'project_parent_admin_required'
);
-- W cannot read K2 at all: learns nothing.
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000014', 'c1000000-0000-4000-8000-000000000013')$sql$,
	'project_parent_access_denied'
);
-- W is not admin on K1 (not even a member): denied, even though Hub is readable.
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000011')$sql$,
	'project_parent_access_denied'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT parent_project_id IS NULL FROM public.onto_projects WHERE id = 'c1000000-0000-4000-8000-000000000014'),
	'write-only collaborator could not attach'
);

-- 2. The hub owner (admin on both) attaches their own project.
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000011')
		->>'parent_project_id' = 'c1000000-0000-4000-8000-000000000011'),
	'parent admin attaches own child'
);
RESET ROLE;

-- 3. O (admin on Hub and on OX) attaches OX; A (hub owner, no access to OX)
--    detaches it.
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000015', 'c1000000-0000-4000-8000-000000000011');
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT parent_project_id = 'c1000000-0000-4000-8000-000000000011' FROM public.onto_projects WHERE id = 'c1000000-0000-4000-8000-000000000015'),
	'admin on both attaches'
);
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000015', NULL)
		->>'previous_parent_project_id' = 'c1000000-0000-4000-8000-000000000011'),
	'parent admin detaches a child they do not admin'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT parent_project_id IS NULL FROM public.onto_projects WHERE id = 'c1000000-0000-4000-8000-000000000015'),
	'OX is detached'
);

-- 4. O re-attaches, loses admin on Hub, and can still detach as the child's admin
--    (but can no longer attach).
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000015', 'c1000000-0000-4000-8000-000000000011');
RESET ROLE;
UPDATE public.onto_project_members SET access = 'read', role_key = 'viewer'
WHERE project_id = 'c1000000-0000-4000-8000-000000000011' AND actor_id = 'b1000000-0000-4000-8000-000000000003';
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000015', NULL)
		->>'previous_parent_project_id' = 'c1000000-0000-4000-8000-000000000011'),
	'child admin detaches'
);
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000015', 'c1000000-0000-4000-8000-000000000011')$sql$,
	'project_parent_admin_required'
);
RESET ROLE;

-- 5. Detach is refused to everyone else, without detail.
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000012', NULL)$sql$,
	'project_parent_access_denied'
);
RESET ROLE;
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000012', NULL)$sql$,
	'project_parent_access_denied'
);
RESET ROLE;
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000012', NULL)$sql$,
	'project_parent_access_denied'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT parent_project_id = 'c1000000-0000-4000-8000-000000000011' FROM public.onto_projects WHERE id = 'c1000000-0000-4000-8000-000000000012'),
	'K1 stays attached after refused detaches'
);

-- 6. can_detach in the family.
INSERT INTO results VALUES
	('a_hub', pg_temp.family_as('a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000011')),
	('b_hub', pg_temp.family_as('a1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000011')),
	('b_k1', pg_temp.family_as('a1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000012')),
	('r_hub', pg_temp.family_as('a1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000011')),
	('r_k1', pg_temp.family_as('a1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000012'));
UPDATE public.onto_project_members SET access = 'admin', role_key = 'owner'
WHERE project_id = 'c1000000-0000-4000-8000-000000000011' AND actor_id = 'b1000000-0000-4000-8000-000000000003';
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('c1000000-0000-4000-8000-000000000012', 'b1000000-0000-4000-8000-000000000003', 'viewer', 'read');
INSERT INTO results VALUES
	('o_k1', pg_temp.family_as('a1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000012'));

SELECT pg_temp.assert_true(
	(SELECT (value->'children'->0->>'can_detach')::boolean
		AND value->'children'->0->>'id' = 'c1000000-0000-4000-8000-000000000012'
		FROM results WHERE key = 'a_hub'),
	'hub admin can detach each child'
);
SELECT pg_temp.assert_true(
	(SELECT (value->'children'->0->>'can_detach')::boolean FROM results WHERE key = 'b_hub'),
	'child admin (hub reader) can detach that child from the hub view'
);
SELECT pg_temp.assert_true(
	(SELECT (value->'parent'->>'can_detach')::boolean FROM results WHERE key = 'b_k1'),
	'child admin can detach from the child view'
);
SELECT pg_temp.assert_true(
	(SELECT NOT (value->'children'->0->>'can_detach')::boolean
		AND jsonb_typeof(value->'children'->0->'can_detach') = 'boolean'
		FROM results WHERE key = 'r_hub'),
	'reader of both cannot detach (hub view)'
);
SELECT pg_temp.assert_true(
	(SELECT NOT (value->'parent'->>'can_detach')::boolean FROM results WHERE key = 'r_k1'),
	'reader of both cannot detach (child view)'
);
SELECT pg_temp.assert_true(
	(SELECT (value->'parent'->>'can_detach')::boolean FROM results WHERE key = 'o_k1'),
	'parent admin reading the child can detach from the child view'
);
-- Every other key is unchanged.
SELECT pg_temp.assert_true(
	(SELECT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(value->'parent') k)
		= ARRAY['can_detach','can_write','child_count','id','name','shared_folder_document_id','state_key']
		AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(value) k)
		= ARRAY['child_count','children','own_shared_folder_document_id','parent','project_id','shelf']
		FROM results WHERE key = 'b_k1'),
	'parent keys are the old ones plus can_detach'
);
SELECT pg_temp.assert_true(
	(SELECT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(value->'children'->0) k)
		= ARRAY['can_detach','id','name','next_step_short','state_key','updated_at']
		FROM results WHERE key = 'a_hub'),
	'child keys are the old ones plus can_detach'
);
-- The service role still names its actor.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(
	(SELECT (public.onto_project_family_v1('c1000000-0000-4000-8000-000000000012', 'b1000000-0000-4000-8000-000000000005')
		->'parent'->>'can_detach')::boolean = false),
	'service role reports can_detach for the named actor'
);
SELECT pg_temp.assert_raises(
	$sql$SELECT public.onto_project_family_v1('c1000000-0000-4000-8000-000000000012')$sql$,
	'project_family_access_denied'
);
RESET ROLE;

-- 7. Restore keeps one level. Soft-delete C1 (child of P1), nest P1 under Q1,
--    restore C1: C1 is detached instead of sitting two levels deep.
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000016', 'c1000000-0000-4000-8000-000000000017');
SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000019', 'c1000000-0000-4000-8000-00000000001a');
RESET ROLE;
UPDATE public.onto_projects SET deleted_at = now()
WHERE id IN ('c1000000-0000-4000-8000-000000000016', 'c1000000-0000-4000-8000-000000000019');
SELECT pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.onto_project_set_parent_atomic('c1000000-0000-4000-8000-000000000017', 'c1000000-0000-4000-8000-000000000018');
RESET ROLE;
UPDATE public.onto_projects SET deleted_at = NULL
WHERE id IN ('c1000000-0000-4000-8000-000000000016', 'c1000000-0000-4000-8000-000000000019');
SELECT pg_temp.assert_true(
	(SELECT parent_project_id IS NULL AND deleted_at IS NULL
		FROM public.onto_projects WHERE id = 'c1000000-0000-4000-8000-000000000016'),
	'restored child whose parent gained a parent is detached, and restored'
);
SELECT pg_temp.assert_true(
	(SELECT parent_project_id = 'c1000000-0000-4000-8000-000000000018'
		FROM public.onto_projects WHERE id = 'c1000000-0000-4000-8000-000000000017'),
	'the re-nested parent keeps its own parent'
);
SELECT pg_temp.assert_true(
	(SELECT parent_project_id = 'c1000000-0000-4000-8000-00000000001a'
		FROM public.onto_projects WHERE id = 'c1000000-0000-4000-8000-000000000019'),
	'an ordinary restore keeps its parent'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM public.onto_projects AS c
		JOIN public.onto_projects AS p ON p.id = c.parent_project_id
		WHERE c.deleted_at IS NULL AND p.parent_project_id IS NOT NULL
			AND c.id::text LIKE 'c1000000-%'
	),
	'no live project sits two levels deep'
);
-- The restore trigger clears pointers only; direct writes stay protected.
SELECT pg_temp.assert_raises(
	$sql$UPDATE public.onto_projects SET parent_project_id = 'c1000000-0000-4000-8000-000000000011' WHERE id = 'c1000000-0000-4000-8000-000000000013'$sql$,
	'project_hierarchy_columns_protected'
);

-- 8. Grants.
SELECT pg_temp.assert_true(
	NOT has_function_privilege('anon', 'public.onto_project_set_parent_atomic(uuid,uuid)', 'EXECUTE')
	AND has_function_privilege('authenticated', 'public.onto_project_set_parent_atomic(uuid,uuid)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.onto_projects_restore_keeps_one_level()', 'EXECUTE'),
	'grants: set_parent for signed-in users only; restore trigger function not callable'
);

ROLLBACK;
