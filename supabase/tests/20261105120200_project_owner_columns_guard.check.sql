-- supabase/tests/20261105120200_project_owner_columns_guard.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261105120200_project_owner_columns_guard.sql \
--     --check supabase/tests/20261105120200_project_owner_columns_guard.check.sql --role-probe
--
-- Owner A, editor B (write), admin member D, stranger V. As signed-in B: taking ownership,
-- soft-deleting (direct or through soft_delete_onto_project), publishing, featuring, setting
-- icon_svg and changing external_agent_access are refused, while normal edits still work. As
-- signed-in A: assigning stranger V to a task is refused (direct insert and
-- onto_task_create_atomic), assigning member B works, and the owner can still hand off,
-- soft-delete and restore. A server writer can still publish a project.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path = public, extensions;

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

-- Users c3…0N, actors c3…1N, project c3…21, members c3…3N, tasks c3…4N.
INSERT INTO auth.users (id, email) VALUES
	('c3050000-0000-4000-8000-000000000001', 'owner-guard-a@example.com'),
	('c3050000-0000-4000-8000-000000000002', 'owner-guard-b@example.com'),
	('c3050000-0000-4000-8000-000000000003', 'owner-guard-v@example.com'),
	('c3050000-0000-4000-8000-000000000004', 'owner-guard-d@example.com');
INSERT INTO public.users (id, email, name) VALUES
	('c3050000-0000-4000-8000-000000000001', 'owner-guard-a@example.com', 'Owner'),
	('c3050000-0000-4000-8000-000000000002', 'owner-guard-b@example.com', 'Editor'),
	('c3050000-0000-4000-8000-000000000003', 'owner-guard-v@example.com', 'Stranger'),
	('c3050000-0000-4000-8000-000000000004', 'owner-guard-d@example.com', 'Admin member')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, user_id, email) VALUES
	('c3050000-0000-4000-8000-000000000011', 'human', 'Owner', 'c3050000-0000-4000-8000-000000000001', 'owner-guard-a@example.com'),
	('c3050000-0000-4000-8000-000000000012', 'human', 'Editor', 'c3050000-0000-4000-8000-000000000002', 'owner-guard-b@example.com'),
	('c3050000-0000-4000-8000-000000000013', 'human', 'Stranger', 'c3050000-0000-4000-8000-000000000003', 'owner-guard-v@example.com'),
	('c3050000-0000-4000-8000-000000000014', 'human', 'Admin member', 'c3050000-0000-4000-8000-000000000004', 'owner-guard-d@example.com')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('c3050000-0000-4000-8000-000000000021', 'Shared plan', 'project.default', 'c3050000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (id, project_id, actor_id, role_key, access) VALUES
	('c3050000-0000-4000-8000-000000000032', 'c3050000-0000-4000-8000-000000000021', 'c3050000-0000-4000-8000-000000000012', 'editor', 'write'),
	('c3050000-0000-4000-8000-000000000034', 'c3050000-0000-4000-8000-000000000021', 'c3050000-0000-4000-8000-000000000014', 'editor', 'admin');
INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by) VALUES
	('c3050000-0000-4000-8000-000000000041', 'c3050000-0000-4000-8000-000000000021', 'Live', 'todo', 'c3050000-0000-4000-8000-000000000011');

-- Runs one statement as the current role and records the error message (or 'ok').
CREATE OR REPLACE FUNCTION pg_temp.try(p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
		INSERT INTO results VALUES (p_key, 'ok');
	EXCEPTION WHEN insufficient_privilege THEN
		INSERT INTO results VALUES (p_key, SQLERRM);
	END;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try(text, text) TO authenticated, anon;

-- 1. Grants: the guard functions are server-only and anon can't soft-delete.
SELECT pg_temp.assert_true(
	NOT has_function_privilege('anon', 'public.soft_delete_onto_project(uuid)', 'EXECUTE')
	AND has_function_privilege('authenticated', 'public.soft_delete_onto_project(uuid)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.onto_projects_guard_owner_columns()', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.onto_task_assignees_guard_membership()', 'EXECUTE'),
	'grants');

-- 2. Editor B: every owner-only column is refused, a normal edit works.
SELECT pg_temp.as_user('c3050000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('b_takeover', $q$UPDATE public.onto_projects SET created_by = 'c3050000-0000-4000-8000-000000000012' WHERE id = 'c3050000-0000-4000-8000-000000000021'$q$);
SELECT pg_temp.try('b_delete_direct', $q$UPDATE public.onto_projects SET deleted_at = now() WHERE id = 'c3050000-0000-4000-8000-000000000021'$q$);
SELECT pg_temp.try('b_delete_rpc', $q$SELECT public.soft_delete_onto_project('c3050000-0000-4000-8000-000000000021')$q$);
SELECT pg_temp.try('b_publish', $q$UPDATE public.onto_projects SET is_public = true WHERE id = 'c3050000-0000-4000-8000-000000000021'$q$);
SELECT pg_temp.try('b_icon', $q$UPDATE public.onto_projects SET icon_svg = '<svg><p><iframe srcdoc="x"></iframe></svg>' WHERE id = 'c3050000-0000-4000-8000-000000000021'$q$);
SELECT pg_temp.try('b_agent_access', $q$UPDATE public.onto_projects SET external_agent_access = 'restricted' WHERE id = 'c3050000-0000-4000-8000-000000000021'$q$);
SELECT pg_temp.try('b_feature', $q$UPDATE public.onto_projects SET props = props || '{"featured_public_example": true, "note": "kept"}'::jsonb WHERE id = 'c3050000-0000-4000-8000-000000000021'$q$);
SELECT pg_temp.try('b_rename', $q$UPDATE public.onto_projects SET name = 'Shared plan v2' WHERE id = 'c3050000-0000-4000-8000-000000000021'$q$);
-- B creates a project of their own: it can't start public, and a featured flag is dropped.
SELECT pg_temp.try('b_insert_public', $q$INSERT INTO public.onto_projects (id, name, type_key, created_by, is_public) VALUES ('c3050000-0000-4000-8000-000000000022', 'Mine', 'project.default', 'c3050000-0000-4000-8000-000000000012', true)$q$);
SELECT pg_temp.try('b_insert_featured', $q$INSERT INTO public.onto_projects (id, name, type_key, created_by, props) VALUES ('c3050000-0000-4000-8000-000000000023', 'Mine', 'project.default', 'c3050000-0000-4000-8000-000000000012', '{"featured_public_example": true}')$q$);
RESET ROLE;

SELECT pg_temp.assert_true((SELECT value = 'project_owner_change_requires_handoff' FROM results WHERE key = 'b_takeover'), 'editor cannot take ownership');
SELECT pg_temp.assert_true((SELECT value = 'project_owner_required' FROM results WHERE key = 'b_delete_direct'), 'editor cannot set deleted_at');
SELECT pg_temp.assert_true((SELECT value = 'project_owner_required' FROM results WHERE key = 'b_delete_rpc'), 'editor cannot call soft_delete_onto_project');
SELECT pg_temp.assert_true((SELECT value = 'project_publication_server_only' FROM results WHERE key = 'b_publish'), 'editor cannot publish');
SELECT pg_temp.assert_true((SELECT value = 'project_icon_svg_server_only' FROM results WHERE key = 'b_icon'), 'editor cannot set icon_svg');
SELECT pg_temp.assert_true((SELECT value = 'project_admin_required' FROM results WHERE key = 'b_agent_access'), 'editor cannot change agent access');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'b_feature'), 'props save still works');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'b_rename'), 'editor can still rename');
SELECT pg_temp.assert_true((SELECT value = 'project_publication_server_only' FROM results WHERE key = 'b_insert_public'), 'new project cannot start public');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'b_insert_featured'), 'own project insert works');
SELECT pg_temp.assert_true(
	(SELECT created_by = 'c3050000-0000-4000-8000-000000000011'
		AND deleted_at IS NULL
		AND NOT coalesce(is_public, false)
		AND icon_svg IS NULL
		AND external_agent_access = 'standard'
		AND NOT (props ? 'featured_public_example')
		AND props ->> 'note' = 'kept'
		AND name = 'Shared plan v2'
	FROM public.onto_projects WHERE id = 'c3050000-0000-4000-8000-000000000021'),
	'project row: owner-only columns untouched, featured flag dropped, other edits kept');
SELECT pg_temp.assert_true(
	(SELECT deleted_at IS NULL FROM public.onto_tasks WHERE id = 'c3050000-0000-4000-8000-000000000041'),
	'the refused RPC rolled back its child soft-deletes');
SELECT pg_temp.assert_true(
	(SELECT NOT (props ? 'featured_public_example') FROM public.onto_projects WHERE id = 'c3050000-0000-4000-8000-000000000023'),
	'featured flag dropped on insert');

-- 3. Admin member D may change connected AI access (the app route's rule).
SELECT pg_temp.as_user('c3050000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('d_agent_access', $q$UPDATE public.onto_projects SET external_agent_access = 'restricted' WHERE id = 'c3050000-0000-4000-8000-000000000021'$q$);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'd_agent_access'), 'admin member can change agent access');

-- 4. Owner A: assigning stranger V is refused; owner, editor B work.
SELECT pg_temp.as_user('c3050000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('a_assign_stranger', $q$INSERT INTO public.onto_task_assignees (project_id, task_id, assignee_actor_id, assigned_by_actor_id) VALUES ('c3050000-0000-4000-8000-000000000021', 'c3050000-0000-4000-8000-000000000041', 'c3050000-0000-4000-8000-000000000013', 'c3050000-0000-4000-8000-000000000011')$q$);
SELECT pg_temp.try('a_create_with_stranger', $q$SELECT public.onto_task_create_atomic(
	jsonb_build_object('id', 'c3050000-0000-4000-8000-000000000042', 'project_id', 'c3050000-0000-4000-8000-000000000021', 'title', 'Spy', 'created_by', 'c3050000-0000-4000-8000-000000000011'),
	true, ARRAY['c3050000-0000-4000-8000-000000000013']::uuid[], 'c3050000-0000-4000-8000-000000000011')$q$);
SELECT pg_temp.try('a_assign_editor', $q$INSERT INTO public.onto_task_assignees (project_id, task_id, assignee_actor_id, assigned_by_actor_id) VALUES ('c3050000-0000-4000-8000-000000000021', 'c3050000-0000-4000-8000-000000000041', 'c3050000-0000-4000-8000-000000000012', 'c3050000-0000-4000-8000-000000000011')$q$);
SELECT pg_temp.try('a_create_with_self', $q$SELECT public.onto_task_create_atomic(
	jsonb_build_object('id', 'c3050000-0000-4000-8000-000000000043', 'project_id', 'c3050000-0000-4000-8000-000000000021', 'title', 'Mine', 'created_by', 'c3050000-0000-4000-8000-000000000011'),
	true, ARRAY['c3050000-0000-4000-8000-000000000011']::uuid[], 'c3050000-0000-4000-8000-000000000011')$q$);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'task_assignee_not_project_member' FROM results WHERE key = 'a_assign_stranger'), 'stranger assignee refused (direct insert)');
SELECT pg_temp.assert_true((SELECT value = 'task_assignee_not_project_member' FROM results WHERE key = 'a_create_with_stranger'), 'stranger assignee refused (onto_task_create_atomic)');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.onto_tasks WHERE id = 'c3050000-0000-4000-8000-000000000042'), 'refused create left no task');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_assign_editor'), 'member assignee works');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_create_with_self'), 'owner assignee works through onto_task_create_atomic');
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_task_assignees WHERE assignee_actor_id = 'c3050000-0000-4000-8000-000000000013'),
	'no stranger assignee rows');

-- A removed member can no longer be assigned.
UPDATE public.onto_project_members SET removed_at = now() WHERE id = 'c3050000-0000-4000-8000-000000000032';
SELECT pg_temp.as_user('c3050000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('a_assign_removed', $q$INSERT INTO public.onto_task_assignees (project_id, task_id, assignee_actor_id, assigned_by_actor_id) VALUES ('c3050000-0000-4000-8000-000000000021', 'c3050000-0000-4000-8000-000000000043', 'c3050000-0000-4000-8000-000000000012', 'c3050000-0000-4000-8000-000000000011')$q$);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'task_assignee_not_project_member' FROM results WHERE key = 'a_assign_removed'), 'removed member assignee refused');
UPDATE public.onto_project_members SET removed_at = NULL WHERE id = 'c3050000-0000-4000-8000-000000000032';

-- 5. Owner A: soft-delete through the RPC and restore still work.
SELECT pg_temp.as_user('c3050000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.soft_delete_onto_project('c3050000-0000-4000-8000-000000000021');
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT deleted_at IS NOT NULL FROM public.onto_projects WHERE id = 'c3050000-0000-4000-8000-000000000021'),
	'owner soft-delete works');
SELECT pg_temp.as_user('c3050000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.restore_onto_project('c3050000-0000-4000-8000-000000000021');
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT deleted_at IS NULL FROM public.onto_projects WHERE id = 'c3050000-0000-4000-8000-000000000021'),
	'owner restore works');

-- 6. Owner A hands the project to editor B through the handoff RPC (SECURITY DEFINER).
SELECT pg_temp.as_user('c3050000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.transfer_onto_project_ownership('c3050000-0000-4000-8000-000000000021', 'c3050000-0000-4000-8000-000000000032', false);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT created_by = 'c3050000-0000-4000-8000-000000000012' FROM public.onto_projects WHERE id = 'c3050000-0000-4000-8000-000000000021'),
	'handoff still moves ownership');

-- 7. A server writer can still publish and feature a project (seed script path). The local
--    rehearsal's service_role has no BYPASSRLS, so this runs as the owner role; the guard
--    only acts when current_user is authenticated or anon.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.onto_projects
SET is_public = true, props = props || '{"featured_public_example": true}'::jsonb
WHERE id = 'c3050000-0000-4000-8000-000000000021';
SELECT pg_temp.assert_true(
	(SELECT is_public AND (props -> 'featured_public_example') = 'true'::jsonb FROM public.onto_projects WHERE id = 'c3050000-0000-4000-8000-000000000021'),
	'service role publishes and features');

-- 8. Once featured, a signed-in props save keeps the flag (pinned, not dropped).
SELECT pg_temp.as_user('c3050000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
UPDATE public.onto_projects SET props = '{"replaced": true}'::jsonb WHERE id = 'c3050000-0000-4000-8000-000000000021';
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT (props -> 'featured_public_example') = 'true'::jsonb AND props ? 'replaced' FROM public.onto_projects WHERE id = 'c3050000-0000-4000-8000-000000000021'),
	'featured flag pinned on a whole-props save');

ROLLBACK;

SELECT 'project owner columns guard: all checks passed' AS result;
