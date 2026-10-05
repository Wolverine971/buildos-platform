-- supabase/tests/project_handoff_and_trash.check.sql
-- Rehearsal check for 20261004220000_project_handoff_and_trash.sql. Run with:
--   pnpm db:rehearse supabase/migrations/20261004220000_project_handoff_and_trash.sql \
--     --check supabase/tests/project_handoff_and_trash.check.sql --role-probe
-- As signed-in people on production's schema: only the owner hands a project
-- off; the new owner gets full control and the old one becomes an editor or
-- leaves; a removed member or one whose account is being deleted cannot take
-- it; Trash lists the owner's deleted projects; restore brings back exactly
-- what the delete took down; members cannot restore; anon can call nothing.
-- DISPOSABLE DATABASE ONLY. All fixtures are invented; everything rolls back.

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

-- Owner A, editor B, viewer C, and D whose account is being deleted.
-- Users e1…0N, actors e1…1N, project e1…21, members e1…3N, tasks e1…4N.
INSERT INTO auth.users (id, email) VALUES
	('e1000000-0000-4000-8000-000000000001', 'handoff-owner@example.com'),
	('e1000000-0000-4000-8000-000000000002', 'handoff-editor@example.com'),
	('e1000000-0000-4000-8000-000000000003', 'handoff-viewer@example.com'),
	('e1000000-0000-4000-8000-000000000004', 'handoff-leaving@example.com');
INSERT INTO public.users (id, email, name) VALUES
	('e1000000-0000-4000-8000-000000000001', 'handoff-owner@example.com', 'Owner'),
	('e1000000-0000-4000-8000-000000000002', 'handoff-editor@example.com', 'Editor'),
	('e1000000-0000-4000-8000-000000000003', 'handoff-viewer@example.com', 'Viewer'),
	('e1000000-0000-4000-8000-000000000004', 'handoff-leaving@example.com', 'Leaving')
	ON CONFLICT (id) DO NOTHING;
UPDATE public.users SET deletion_status = 'pending' WHERE id = 'e1000000-0000-4000-8000-000000000004';
INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES
	('e1000000-0000-4000-8000-000000000011', 'human', 'Owner', 'e1000000-0000-4000-8000-000000000001'),
	('e1000000-0000-4000-8000-000000000012', 'human', 'Editor', 'e1000000-0000-4000-8000-000000000002'),
	('e1000000-0000-4000-8000-000000000013', 'human', 'Viewer', 'e1000000-0000-4000-8000-000000000003'),
	('e1000000-0000-4000-8000-000000000014', 'human', 'Leaving', 'e1000000-0000-4000-8000-000000000004')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e1000000-0000-4000-8000-000000000021', 'Shared plan', 'project.default', 'e1000000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (id, project_id, actor_id, role_key, access) VALUES
	('e1000000-0000-4000-8000-000000000032', 'e1000000-0000-4000-8000-000000000021', 'e1000000-0000-4000-8000-000000000012', 'editor', 'write'),
	('e1000000-0000-4000-8000-000000000033', 'e1000000-0000-4000-8000-000000000021', 'e1000000-0000-4000-8000-000000000013', 'viewer', 'read'),
	('e1000000-0000-4000-8000-000000000034', 'e1000000-0000-4000-8000-000000000021', 'e1000000-0000-4000-8000-000000000014', 'editor', 'write');
-- The creator's owner membership comes from trg_onto_projects_owner_member.
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM public.onto_project_members
		WHERE project_id = 'e1000000-0000-4000-8000-000000000021'
			AND actor_id = 'e1000000-0000-4000-8000-000000000011' AND role_key = 'owner'),
	'the creator is an owner member');

-- Tasks: one live, one deleted before the project (stays deleted on restore),
-- one archived before the project (stays archived on restore).
INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by, deleted_at, archived_at) VALUES
	('e1000000-0000-4000-8000-000000000041', 'e1000000-0000-4000-8000-000000000021', 'Live', 'todo', 'e1000000-0000-4000-8000-000000000011', NULL, NULL),
	('e1000000-0000-4000-8000-000000000042', 'e1000000-0000-4000-8000-000000000021', 'Deleted earlier', 'todo', 'e1000000-0000-4000-8000-000000000011', now() - interval '2 days', now() - interval '2 days'),
	('e1000000-0000-4000-8000-000000000043', 'e1000000-0000-4000-8000-000000000021', 'Archived earlier', 'done', 'e1000000-0000-4000-8000-000000000011', NULL, now() - interval '3 days');

-- 1. Anon can call none of it.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.assert_true(
	NOT has_function_privilege('anon', 'public.transfer_onto_project_ownership(uuid, uuid, boolean)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.restore_onto_project(uuid)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.list_my_deleted_onto_projects()', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.list_my_shared_owned_onto_projects()', 'EXECUTE')
	AND has_function_privilege('authenticated', 'public.transfer_onto_project_ownership(uuid, uuid, boolean)', 'EXECUTE')
	AND has_function_privilege('authenticated', 'public.restore_onto_project(uuid)', 'EXECUTE'),
	'signed-in only');

-- 2. The account-deletion preview lists the shared project with the members
--    who can take it over: editor first, then viewer; never the leaving member.
SELECT pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO results
SELECT 'preview', jsonb_build_object('project', project_id, 'members', members)::text
FROM public.list_my_shared_owned_onto_projects();
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT (value::jsonb->>'project') = 'e1000000-0000-4000-8000-000000000021'
		AND jsonb_path_query_array(value::jsonb->'members', '$[*].member_id')
			= '["e1000000-0000-4000-8000-000000000032", "e1000000-0000-4000-8000-000000000033"]'::jsonb
	FROM results WHERE key = 'preview'),
	'preview lists the editor then the viewer, not the member being deleted');

-- 3. A non-owner cannot hand the project off.
SELECT pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.transfer_onto_project_ownership('e1000000-0000-4000-8000-000000000021', 'e1000000-0000-4000-8000-000000000032', false);
	INSERT INTO results VALUES ('editor_handoff', 'succeeded');
EXCEPTION WHEN insufficient_privilege THEN
	INSERT INTO results VALUES ('editor_handoff', SQLERRM);
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'project_owner_required' FROM results WHERE key = 'editor_handoff'),
	'an editor cannot hand the project off');

-- 4. The owner cannot hand it to a member whose account is being deleted.
SELECT pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.transfer_onto_project_ownership('e1000000-0000-4000-8000-000000000021', 'e1000000-0000-4000-8000-000000000034', false);
	INSERT INTO results VALUES ('to_leaving', 'succeeded');
EXCEPTION WHEN no_data_found THEN
	INSERT INTO results VALUES ('to_leaving', SQLERRM);
END;
$$;

-- 5. The owner hands it to the viewer and stays as an editor.
SELECT public.transfer_onto_project_ownership('e1000000-0000-4000-8000-000000000021', 'e1000000-0000-4000-8000-000000000033', false);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'project_handoff_member_not_found' FROM results WHERE key = 'to_leaving'),
	'a member whose account is being deleted cannot take the project');
SELECT pg_temp.assert_true(
	(SELECT created_by = 'e1000000-0000-4000-8000-000000000013' FROM public.onto_projects WHERE id = 'e1000000-0000-4000-8000-000000000021')
	AND (SELECT role_key = 'owner' AND access = 'admin' FROM public.onto_project_members WHERE id = 'e1000000-0000-4000-8000-000000000033')
	AND (SELECT role_key = 'editor' AND access = 'write' AND removed_at IS NULL FROM public.onto_project_members
		WHERE project_id = 'e1000000-0000-4000-8000-000000000021' AND actor_id = 'e1000000-0000-4000-8000-000000000011'),
	'the viewer owns it; the old owner is an editor');
SELECT pg_temp.assert_true(
	public.actor_has_project_member_access('e1000000-0000-4000-8000-000000000013', 'e1000000-0000-4000-8000-000000000021', 'admin')
	AND public.actor_has_project_member_access('e1000000-0000-4000-8000-000000000011', 'e1000000-0000-4000-8000-000000000021', 'write')
	AND NOT public.actor_has_project_member_access('e1000000-0000-4000-8000-000000000011', 'e1000000-0000-4000-8000-000000000021', 'admin'),
	'access follows the new owner; the old owner keeps write, not admin');
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM public.onto_project_logs
		WHERE project_id = 'e1000000-0000-4000-8000-000000000021'
			AND after_data->>'event' = 'ownership_transferred'
			AND after_data->>'owner_actor_id' = 'e1000000-0000-4000-8000-000000000013'),
	'the handoff is in the project log');

-- 6. The new owner hands it back and leaves.
SELECT pg_temp.as_user('e1000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT public.transfer_onto_project_ownership(
	'e1000000-0000-4000-8000-000000000021',
	(SELECT id FROM public.onto_project_members
		WHERE project_id = 'e1000000-0000-4000-8000-000000000021' AND actor_id = 'e1000000-0000-4000-8000-000000000011'),
	true);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT created_by = 'e1000000-0000-4000-8000-000000000011' FROM public.onto_projects WHERE id = 'e1000000-0000-4000-8000-000000000021')
	AND (SELECT removed_at IS NOT NULL FROM public.onto_project_members WHERE id = 'e1000000-0000-4000-8000-000000000033')
	AND NOT public.actor_has_project_member_access('e1000000-0000-4000-8000-000000000013', 'e1000000-0000-4000-8000-000000000021', 'read'),
	'hand off and leave: the leaver loses access');

-- 7. A removed member cannot take it over.
SELECT pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.transfer_onto_project_ownership('e1000000-0000-4000-8000-000000000021', 'e1000000-0000-4000-8000-000000000033', false);
	INSERT INTO results VALUES ('to_removed', 'succeeded');
EXCEPTION WHEN no_data_found THEN
	INSERT INTO results VALUES ('to_removed', SQLERRM);
END;
$$;

-- 8. Delete into Trash; members lose it; Trash lists it with its members.
SELECT public.soft_delete_onto_project('e1000000-0000-4000-8000-000000000021');
INSERT INTO results
SELECT 'trash', jsonb_build_object('id', id, 'members', member_count, 'on_purge_schedule', erase_after = deleted_at + interval '30 days')::text
FROM public.list_my_deleted_onto_projects();
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'project_handoff_member_not_found' FROM results WHERE key = 'to_removed'),
	'a removed member cannot take the project');
SELECT pg_temp.assert_true(
	(SELECT value::jsonb->>'id' = 'e1000000-0000-4000-8000-000000000021'
		AND (value::jsonb->>'members')::integer = 2
		AND (value::jsonb->>'on_purge_schedule')::boolean
	FROM results WHERE key = 'trash'),
	'Trash shows the project, its two remaining members and the 30-day window: '
		|| coalesce((SELECT string_agg(value, ' | ') FROM results WHERE key = 'trash'), 'no row'));
SELECT pg_temp.assert_true(
	NOT public.actor_has_project_member_access('e1000000-0000-4000-8000-000000000012', 'e1000000-0000-4000-8000-000000000021', 'read'),
	'members lose a deleted project');

-- 9. A member cannot restore it.
SELECT pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.restore_onto_project('e1000000-0000-4000-8000-000000000021');
	INSERT INTO results VALUES ('editor_restore', 'succeeded');
EXCEPTION WHEN insufficient_privilege THEN
	INSERT INTO results VALUES ('editor_restore', SQLERRM);
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'project_owner_required' FROM results WHERE key = 'editor_restore'),
	'a member cannot restore');

-- 10. The owner restores exactly what the delete took down.
SELECT pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO results SELECT 'restore', public.restore_onto_project('e1000000-0000-4000-8000-000000000021')::text;
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT deleted_at IS NULL AND archived_at IS NULL FROM public.onto_projects WHERE id = 'e1000000-0000-4000-8000-000000000021')
	AND (SELECT deleted_at IS NULL AND archived_at IS NULL FROM public.onto_tasks WHERE id = 'e1000000-0000-4000-8000-000000000041')
	AND (SELECT deleted_at IS NOT NULL FROM public.onto_tasks WHERE id = 'e1000000-0000-4000-8000-000000000042')
	AND (SELECT deleted_at IS NULL AND archived_at IS NOT NULL FROM public.onto_tasks WHERE id = 'e1000000-0000-4000-8000-000000000043'),
	'restore brings back the project and its live task; earlier deletes and archives stay');
SELECT pg_temp.assert_true(
	public.actor_has_project_member_access('e1000000-0000-4000-8000-000000000012', 'e1000000-0000-4000-8000-000000000021', 'write'),
	'members have the project back');
SELECT pg_temp.assert_true(
	(SELECT (value::jsonb->>'restored')::boolean AND (value::jsonb->>'items_restored')::integer = 2 FROM results WHERE key = 'restore'),
	'restore reports the two rows the delete took down');

ROLLBACK;
