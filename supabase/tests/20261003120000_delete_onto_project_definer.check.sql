-- supabase/tests/20261003120000_delete_onto_project_definer.check.sql
-- Rehearsal check for 20261003120000_delete_onto_project_definer.sql. Run with:
--   pnpm db:rehearse supabase/migrations/20261003120000_delete_onto_project_definer.sql \
--     --check supabase/tests/20261003120000_delete_onto_project_definer.check.sql --role-probe
-- A signed-in project admin can hard delete a project that has service-only
-- rows (onto_assignments); a non-member and anon cannot; the service role still can.
-- DISPOSABLE DATABASE ONLY. All fixtures are invented; everything rolls back.

\set ON_ERROR_STOP on

BEGIN;

GRANT USAGE ON SCHEMA auth TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

CREATE TEMP TABLE results (key text PRIMARY KEY, value text) ON COMMIT DROP;
GRANT ALL ON results TO authenticated, anon, service_role;

-- Owner (admin member) with two projects; an outsider with no membership.
INSERT INTO auth.users (id, email) VALUES
	('d0300000-0000-4000-8000-000000000001', 'delete-owner@example.com'),
	('d0300000-0000-4000-8000-000000000002', 'delete-outsider@example.com');
INSERT INTO public.users (id, email) VALUES
	('d0300000-0000-4000-8000-000000000001', 'delete-owner@example.com'),
	('d0300000-0000-4000-8000-000000000002', 'delete-outsider@example.com')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES
	('d0300000-0000-4000-8000-000000000011', 'human', 'Owner', 'd0300000-0000-4000-8000-000000000001'),
	('d0300000-0000-4000-8000-000000000012', 'human', 'Outsider', 'd0300000-0000-4000-8000-000000000002')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('d0300000-0000-4000-8000-000000000021', 'Delete me', 'project.default', 'd0300000-0000-4000-8000-000000000011', 'active'),
	('d0300000-0000-4000-8000-000000000022', 'Purge me', 'project.default', 'd0300000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('d0300000-0000-4000-8000-000000000021', 'd0300000-0000-4000-8000-000000000011', 'owner', 'admin'),
	('d0300000-0000-4000-8000-000000000022', 'd0300000-0000-4000-8000-000000000011', 'owner', 'admin')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by) VALUES
	('d0300000-0000-4000-8000-000000000031', 'd0300000-0000-4000-8000-000000000021', 'Task', 'todo', 'd0300000-0000-4000-8000-000000000011');
-- The table the bug report named: authenticated has no privileges on it.
INSERT INTO public.onto_assignments (actor_id, object_kind, object_id, role_key) VALUES
	('d0300000-0000-4000-8000-000000000011', 'project', 'd0300000-0000-4000-8000-000000000021', 'owner'),
	('d0300000-0000-4000-8000-000000000011', 'task', 'd0300000-0000-4000-8000-000000000031', 'owner');

-- 1. Anon cannot execute the function at all.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
	PERFORM public.delete_onto_project('d0300000-0000-4000-8000-000000000021');
	INSERT INTO results VALUES ('anon', 'succeeded');
EXCEPTION WHEN insufficient_privilege THEN
	INSERT INTO results VALUES ('anon', SQLERRM);
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value LIKE 'permission denied for function%' FROM results WHERE key = 'anon'),
	'anon cannot execute delete_onto_project');

-- 2. A signed-in non-member is refused before anything is touched.
SELECT pg_temp.as_user('d0300000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.delete_onto_project('d0300000-0000-4000-8000-000000000021');
	INSERT INTO results VALUES ('outsider', 'succeeded');
EXCEPTION WHEN insufficient_privilege THEN
	INSERT INTO results VALUES ('outsider', SQLERRM);
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'Project admin access required' FROM results WHERE key = 'outsider'),
	'a non-member cannot hard delete the project');
SELECT pg_temp.assert_true(
	(SELECT deleted_at IS NULL FROM public.onto_projects WHERE id = 'd0300000-0000-4000-8000-000000000021'),
	'a refused delete leaves the project untouched');

-- 3. The signed-in owner hard deletes the project, its task and its assignments.
SELECT pg_temp.as_user('d0300000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.delete_onto_project('d0300000-0000-4000-8000-000000000021');
RESET ROLE;
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'd0300000-0000-4000-8000-000000000021'),
	'owner hard delete removes the project');
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_tasks WHERE id = 'd0300000-0000-4000-8000-000000000031'),
	'owner hard delete removes the project tasks');
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_assignments WHERE actor_id = 'd0300000-0000-4000-8000-000000000011'),
	'owner hard delete removes the project and task assignments');

-- 4. Service-role callers (account deletion, privacy purge) carry no user and still delete.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT public.delete_onto_project('d0300000-0000-4000-8000-000000000022');
RESET ROLE;
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'd0300000-0000-4000-8000-000000000022'),
	'service role hard delete removes the project');

ROLLBACK;
