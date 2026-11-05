-- supabase/tests/20261105120500_onto_membership_attribution_guard.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261105120500_onto_membership_attribution_guard.sql \
--     --check supabase/tests/20261105120500_onto_membership_attribution_guard.check.sql --role-probe
--
-- Owner A, editor B (write), admin member D, stranger V.
--   Members: A and D can't insert a membership for V, D can't repoint B's row to V, change
--   access or touch the owner's row, nobody deletes rows; role-profile edits, the guarded
--   role RPC and the owner row from project creation still work.
--   Logs: B's insert naming A (changed_by, changed_by_actor_id) or an external caller is
--   attributed to B.
--   created_by: B can't create or rewrite tasks/goals/events as A (direct or inside a
--   definer RPC), the server still can; entity extraction queues as the writer, and server
--   writes queue as a creator who is still a member, else the owner.

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

-- Users c5…0N, actors c5…1N, project c5…21, members c5…3N, tasks c5…4N.
INSERT INTO auth.users (id, email) VALUES
	('c5050000-0000-4000-8000-000000000001', 'attr-guard-a@example.com'),
	('c5050000-0000-4000-8000-000000000002', 'attr-guard-b@example.com'),
	('c5050000-0000-4000-8000-000000000003', 'attr-guard-v@example.com'),
	('c5050000-0000-4000-8000-000000000004', 'attr-guard-d@example.com');
INSERT INTO public.users (id, email, name) VALUES
	('c5050000-0000-4000-8000-000000000001', 'attr-guard-a@example.com', 'Owner'),
	('c5050000-0000-4000-8000-000000000002', 'attr-guard-b@example.com', 'Editor'),
	('c5050000-0000-4000-8000-000000000003', 'attr-guard-v@example.com', 'Stranger'),
	('c5050000-0000-4000-8000-000000000004', 'attr-guard-d@example.com', 'Admin member')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, user_id, email) VALUES
	('c5050000-0000-4000-8000-000000000011', 'human', 'Owner', 'c5050000-0000-4000-8000-000000000001', 'attr-guard-a@example.com'),
	('c5050000-0000-4000-8000-000000000012', 'human', 'Editor', 'c5050000-0000-4000-8000-000000000002', 'attr-guard-b@example.com'),
	('c5050000-0000-4000-8000-000000000013', 'human', 'Stranger', 'c5050000-0000-4000-8000-000000000003', 'attr-guard-v@example.com'),
	('c5050000-0000-4000-8000-000000000014', 'human', 'Admin member', 'c5050000-0000-4000-8000-000000000004', 'attr-guard-d@example.com')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('c5050000-0000-4000-8000-000000000021', 'Shared plan', 'project.default', 'c5050000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (id, project_id, actor_id, role_key, access) VALUES
	('c5050000-0000-4000-8000-000000000032', 'c5050000-0000-4000-8000-000000000021', 'c5050000-0000-4000-8000-000000000012', 'editor', 'write'),
	('c5050000-0000-4000-8000-000000000034', 'c5050000-0000-4000-8000-000000000021', 'c5050000-0000-4000-8000-000000000014', 'editor', 'admin');
INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by) VALUES
	('c5050000-0000-4000-8000-000000000041', 'c5050000-0000-4000-8000-000000000021', 'Owner task', 'todo', 'c5050000-0000-4000-8000-000000000011');

CREATE OR REPLACE FUNCTION pg_temp.try(p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	v_rows integer;
BEGIN
	BEGIN
		EXECUTE p_sql;
		GET DIAGNOSTICS v_rows = ROW_COUNT;
		INSERT INTO results VALUES (p_key, 'ok:' || v_rows);
	EXCEPTION WHEN insufficient_privilege THEN
		INSERT INTO results VALUES (p_key, SQLERRM);
	END;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try(text, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.r(p_key text) RETURNS text LANGUAGE sql AS $$
	SELECT value FROM results WHERE key = p_key;
$$;

-- 0. Grants and policies.
SELECT pg_temp.assert_true(
	NOT has_table_privilege('authenticated', 'public.onto_project_members', 'INSERT')
	AND NOT has_table_privilege('authenticated', 'public.onto_project_members', 'DELETE')
	AND NOT has_table_privilege('anon', 'public.onto_project_members', 'INSERT')
	AND has_table_privilege('authenticated', 'public.onto_project_members', 'UPDATE')
	AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onto_project_members'
		AND policyname IN ('project_members_insert_admin', 'project_members_delete_admin'))
	AND NOT has_function_privilege('authenticated', 'private.onto_project_members_guard_client_writes()', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.onto_project_logs_pin_client_attribution()', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.onto_entity_pin_created_by()', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'public.enqueue_task_entity_extraction()', 'EXECUTE'),
	'grants and policies');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 10 FROM pg_trigger WHERE tgname = 'guard_entity_created_by' AND NOT tgisinternal),
	'created_by guard on all ten entity tables');

-- 1. Members: forced membership is refused.
SELECT pg_temp.as_user('c5050000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('a_add_stranger', $q$INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES ('c5050000-0000-4000-8000-000000000021', 'c5050000-0000-4000-8000-000000000013', 'editor', 'write')$q$);
SELECT pg_temp.try('a_role_profile_own', $q$UPDATE public.onto_project_members SET role_name = 'Founder' WHERE project_id = 'c5050000-0000-4000-8000-000000000021' AND actor_id = 'c5050000-0000-4000-8000-000000000011'$q$);
RESET ROLE;

SELECT pg_temp.as_user('c5050000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('d_add_stranger', $q$INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES ('c5050000-0000-4000-8000-000000000021', 'c5050000-0000-4000-8000-000000000013', 'viewer', 'read')$q$);
SELECT pg_temp.try('d_repoint_b', $q$UPDATE public.onto_project_members SET actor_id = 'c5050000-0000-4000-8000-000000000013' WHERE id = 'c5050000-0000-4000-8000-000000000032'$q$);
SELECT pg_temp.try('d_access_b', $q$UPDATE public.onto_project_members SET access = 'admin' WHERE id = 'c5050000-0000-4000-8000-000000000032'$q$);
SELECT pg_temp.try('d_unremove', $q$UPDATE public.onto_project_members SET removed_at = now() WHERE id = 'c5050000-0000-4000-8000-000000000032'$q$);
SELECT pg_temp.try('d_role_profile_b', $q$UPDATE public.onto_project_members SET role_name = 'Writer', role_description = 'Drafts the chapters' WHERE id = 'c5050000-0000-4000-8000-000000000032'$q$);
SELECT pg_temp.try('d_owner_row_profile', $q$UPDATE public.onto_project_members SET role_name = 'Intern' WHERE project_id = 'c5050000-0000-4000-8000-000000000021' AND actor_id = 'c5050000-0000-4000-8000-000000000011'$q$);
SELECT pg_temp.try('d_owner_row_access', $q$UPDATE public.onto_project_members SET access = 'read', role_key = 'viewer' WHERE project_id = 'c5050000-0000-4000-8000-000000000021' AND actor_id = 'c5050000-0000-4000-8000-000000000011'$q$);
SELECT pg_temp.try('d_delete_owner_row', $q$DELETE FROM public.onto_project_members WHERE project_id = 'c5050000-0000-4000-8000-000000000021' AND actor_id = 'c5050000-0000-4000-8000-000000000011'$q$);
-- The guarded role RPC (SECURITY DEFINER) still changes B's role.
SELECT pg_temp.try('d_role_rpc', $q$SELECT public.update_project_membership_guarded('c5050000-0000-4000-8000-000000000021', 'c5050000-0000-4000-8000-000000000032', 'role', 'viewer')$q$);
RESET ROLE;

SELECT pg_temp.assert_true(pg_temp.r('a_add_stranger') LIKE 'permission denied%', 'owner cannot add a stranger: ' || pg_temp.r('a_add_stranger'));
SELECT pg_temp.assert_true(pg_temp.r('d_add_stranger') LIKE 'permission denied%', 'admin cannot add a stranger');
SELECT pg_temp.assert_true(pg_temp.r('d_repoint_b') = 'project_member_change_server_only', 'admin cannot repoint a row');
SELECT pg_temp.assert_true(pg_temp.r('d_access_b') = 'project_member_change_server_only', 'admin cannot change access directly');
SELECT pg_temp.assert_true(pg_temp.r('d_unremove') = 'project_member_change_server_only', 'admin cannot set removed_at directly');
SELECT pg_temp.assert_true(pg_temp.r('d_role_profile_b') = 'ok:1', 'admin can edit a member role profile');
SELECT pg_temp.assert_true(pg_temp.r('d_owner_row_profile') = 'project_owner_membership_owner_only', 'admin cannot edit the owner row');
SELECT pg_temp.assert_true(pg_temp.r('d_owner_row_access') = 'project_member_change_server_only', 'admin cannot demote the owner');
SELECT pg_temp.assert_true(pg_temp.r('d_delete_owner_row') LIKE 'permission denied%', 'no client deletes');
SELECT pg_temp.assert_true(pg_temp.r('a_role_profile_own') = 'ok:1', 'owner can edit their own role profile');
SELECT pg_temp.assert_true(pg_temp.r('d_role_rpc') = 'ok:1', 'guarded role RPC still works');
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.onto_project_members WHERE actor_id = 'c5050000-0000-4000-8000-000000000013'),
	'no stranger membership rows');
SELECT pg_temp.assert_true(
	(SELECT role_key = 'viewer' AND access = 'read' AND role_name = 'Writer' AND removed_at IS NULL
	FROM public.onto_project_members WHERE id = 'c5050000-0000-4000-8000-000000000032'),
	'B row: only allowed changes landed');
SELECT pg_temp.assert_true(
	(SELECT role_key = 'owner' AND access = 'admin' AND role_name = 'Founder'
	FROM public.onto_project_members WHERE project_id = 'c5050000-0000-4000-8000-000000000021' AND actor_id = 'c5050000-0000-4000-8000-000000000011'),
	'owner row intact');
-- Put B back to editor for the write tests below.
UPDATE public.onto_project_members SET role_key = 'editor', access = 'write' WHERE id = 'c5050000-0000-4000-8000-000000000032';

-- 2. Creating a project still gives the creator their owner row (definer trigger).
SELECT pg_temp.as_user('c5050000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('b_new_project', $q$INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES ('c5050000-0000-4000-8000-000000000022', 'Mine', 'project.default', 'c5050000-0000-4000-8000-000000000012')$q$);
RESET ROLE;
SELECT pg_temp.assert_true(pg_temp.r('b_new_project') = 'ok:1', 'own project insert works');
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM public.onto_project_members WHERE project_id = 'c5050000-0000-4000-8000-000000000022'
		AND actor_id = 'c5050000-0000-4000-8000-000000000012' AND role_key = 'owner'),
	'owner membership created by trigger');

-- 3. Logs: B's rows are attributed to B whatever they claim.
SELECT pg_temp.as_user('c5050000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('b_log_forged_user', $q$INSERT INTO public.onto_project_logs (id, project_id, entity_type, entity_id, action, changed_by, changed_by_actor_id, change_source)
	VALUES ('c5050000-0000-4000-8000-000000000051', 'c5050000-0000-4000-8000-000000000021', 'task', 'c5050000-0000-4000-8000-000000000041', 'updated',
		'c5050000-0000-4000-8000-000000000001', 'c5050000-0000-4000-8000-000000000012', 'api')$q$);
SELECT pg_temp.try('b_log_forged_actor', $q$INSERT INTO public.onto_project_logs (id, project_id, entity_type, entity_id, action, changed_by, changed_by_actor_id, external_agent_caller_id, change_source)
	VALUES ('c5050000-0000-4000-8000-000000000052', 'c5050000-0000-4000-8000-000000000021', 'task', 'c5050000-0000-4000-8000-000000000041', 'updated',
		'c5050000-0000-4000-8000-000000000001', 'c5050000-0000-4000-8000-000000000011', 'c5050000-0000-4000-8000-0000000000ff', 'agent_call')$q$);
RESET ROLE;
SELECT pg_temp.assert_true(pg_temp.r('b_log_forged_user') = 'ok:1', 'B log insert works: ' || pg_temp.r('b_log_forged_user'));
SELECT pg_temp.assert_true(pg_temp.r('b_log_forged_actor') = 'ok:1', 'B log insert with forged actor is rewritten, not refused: ' || pg_temp.r('b_log_forged_actor'));
SELECT pg_temp.assert_true(
	(SELECT bool_and(changed_by = 'c5050000-0000-4000-8000-000000000002'
		AND changed_by_actor_id = 'c5050000-0000-4000-8000-000000000012'
		AND external_agent_caller_id IS NULL AND agent_call_session_id IS NULL) AND count(*) = 2
	FROM public.onto_project_logs WHERE id IN ('c5050000-0000-4000-8000-000000000051', 'c5050000-0000-4000-8000-000000000052')),
	'log rows attributed to B');

-- 4. created_by: B can't write as A.
DELETE FROM public.queue_jobs WHERE job_type = 'extract_task_entities'
	AND metadata ->> 'projectId' = 'c5050000-0000-4000-8000-000000000021';
SELECT pg_temp.as_user('c5050000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('b_task_as_a', $q$INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by) VALUES ('c5050000-0000-4000-8000-000000000042', 'c5050000-0000-4000-8000-000000000021', 'Call 555-0100', 'todo', 'c5050000-0000-4000-8000-000000000011')$q$);
SELECT pg_temp.try('b_rewrite_creator', $q$UPDATE public.onto_tasks SET created_by = 'c5050000-0000-4000-8000-000000000012', description = 'Edited by B' WHERE id = 'c5050000-0000-4000-8000-000000000041'$q$);
SELECT pg_temp.try('b_goal_as_a', $q$INSERT INTO public.onto_goals (id, project_id, name, created_by) VALUES ('c5050000-0000-4000-8000-000000000061', 'c5050000-0000-4000-8000-000000000021', 'Ship', 'c5050000-0000-4000-8000-000000000011')$q$);
SELECT pg_temp.try('b_event_as_a', $q$INSERT INTO public.onto_events (id, project_id, owner_entity_type, type_key, title, start_at, created_by) VALUES ('c5050000-0000-4000-8000-000000000062', 'c5050000-0000-4000-8000-000000000021', 'standalone', 'event.default', 'Sync', now(), 'c5050000-0000-4000-8000-000000000011')$q$);
RESET ROLE;
SELECT pg_temp.assert_true(pg_temp.r('b_task_as_a') = 'ok:1', 'B task insert works: ' || pg_temp.r('b_task_as_a'));
SELECT pg_temp.assert_true(pg_temp.r('b_rewrite_creator') = 'ok:1', 'B task edit works: ' || pg_temp.r('b_rewrite_creator'));
SELECT pg_temp.assert_true(pg_temp.r('b_goal_as_a') = 'ok:1', 'B goal insert works: ' || pg_temp.r('b_goal_as_a'));
SELECT pg_temp.assert_true(pg_temp.r('b_event_as_a') = 'ok:1', 'B event insert works: ' || pg_temp.r('b_event_as_a'));
SELECT pg_temp.assert_true(
	(SELECT created_by = 'c5050000-0000-4000-8000-000000000012' FROM public.onto_tasks WHERE id = 'c5050000-0000-4000-8000-000000000042'),
	'new task created_by pinned to B');
SELECT pg_temp.assert_true(
	(SELECT created_by = 'c5050000-0000-4000-8000-000000000011' AND description = 'Edited by B' FROM public.onto_tasks WHERE id = 'c5050000-0000-4000-8000-000000000041'),
	'existing task keeps creator A, edit kept');
SELECT pg_temp.assert_true(
	(SELECT created_by = 'c5050000-0000-4000-8000-000000000012' FROM public.onto_goals WHERE id = 'c5050000-0000-4000-8000-000000000061'),
	'goal created_by pinned to B');
SELECT pg_temp.assert_true(
	(SELECT created_by = 'c5050000-0000-4000-8000-000000000012' FROM public.onto_events WHERE id = 'c5050000-0000-4000-8000-000000000062'),
	'event created_by pinned to B');
-- Entity extraction for both of B's writes queued as B, never A.
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 AND bool_and(user_id = 'c5050000-0000-4000-8000-000000000002' AND metadata ->> 'userId' = 'c5050000-0000-4000-8000-000000000002')
	FROM public.queue_jobs WHERE job_type = 'extract_task_entities'
		AND metadata ->> 'taskId' IN ('c5050000-0000-4000-8000-000000000041', 'c5050000-0000-4000-8000-000000000042')),
	'extraction queued as the writer B');

-- Inside a SECURITY DEFINER RPC called by B (current_user is the owner, JWT role is
-- authenticated), created_by is still pinned. Simulated by writing as the owner role with B's claims.
SELECT pg_temp.as_user('c5050000-0000-4000-8000-000000000002');
INSERT INTO public.onto_plans (id, project_id, name, type_key, created_by)
VALUES ('c5050000-0000-4000-8000-000000000063', 'c5050000-0000-4000-8000-000000000021', 'Plan', 'plan.default', 'c5050000-0000-4000-8000-000000000011');
SELECT pg_temp.assert_true(
	(SELECT created_by = 'c5050000-0000-4000-8000-000000000012' FROM public.onto_plans WHERE id = 'c5050000-0000-4000-8000-000000000063'),
	'definer-path insert pinned to the signed-in caller');

-- 5. Server writes (service_role JWT) keep their created_by and queue as the creator while
--    they are a member, else as the owner.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by) VALUES
	('c5050000-0000-4000-8000-000000000043', 'c5050000-0000-4000-8000-000000000021', 'Server task for B', 'todo', 'c5050000-0000-4000-8000-000000000012'),
	('c5050000-0000-4000-8000-000000000044', 'c5050000-0000-4000-8000-000000000021', 'Server task for V', 'todo', 'c5050000-0000-4000-8000-000000000013');
UPDATE public.onto_tasks SET created_by = 'c5050000-0000-4000-8000-000000000014' WHERE id = 'c5050000-0000-4000-8000-000000000043';
SELECT pg_temp.assert_true(
	(SELECT created_by = 'c5050000-0000-4000-8000-000000000014' FROM public.onto_tasks WHERE id = 'c5050000-0000-4000-8000-000000000043'),
	'server can still set created_by');
SELECT pg_temp.assert_true(
	(SELECT user_id = 'c5050000-0000-4000-8000-000000000002' FROM public.queue_jobs WHERE job_type = 'extract_task_entities'
		AND metadata ->> 'taskId' = 'c5050000-0000-4000-8000-000000000043'),
	'server write queues as the member creator');
SELECT pg_temp.assert_true(
	(SELECT user_id = 'c5050000-0000-4000-8000-000000000001' FROM public.queue_jobs WHERE job_type = 'extract_task_entities'
		AND metadata ->> 'taskId' = 'c5050000-0000-4000-8000-000000000044'),
	'server write with a non-member creator queues as the owner');

ROLLBACK;

SELECT 'onto membership attribution guard: all checks passed' AS result;
