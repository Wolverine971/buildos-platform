-- supabase/tests/20261023230000_workspace_foundation.check.sql
-- Rehearsal assertions for the Workspace foundation:
--   pnpm db:rehearse supabase/migrations/20261023230000_workspace_foundation.sql \
--     --check supabase/tests/20261023230000_workspace_foundation.check.sql --role-probe
--
-- A = a person with one real project, B = a second person (a stranger to A's workspace).
-- DISPOSABLE DATABASE ONLY. Every fixture is invented; everything rolls back.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL client_min_messages = warning;
SET LOCAL search_path = public, extensions;

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE FUNCTION pg_temp.act_as(p_user uuid, p_role text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	PERFORM set_config(
		'request.jwt.claims',
		jsonb_build_object('role', p_role, 'sub', p_user)::text,
		true
	);
	PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
	PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- Expects the statement to fail with the given message.
CREATE FUNCTION pg_temp.expect_error(p_sql text, p_message text, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM <> p_message THEN
			RAISE EXCEPTION 'assertion_failed: % raised "%" instead of "%"', p_label, SQLERRM, p_message;
		END IF;
		RETURN;
	END;
	RAISE EXCEPTION 'assertion_failed: % was allowed', p_label;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text, text) TO anon, authenticated;

INSERT INTO auth.users (id, email) VALUES
	('e4000000-0000-4000-8000-000000000001', 'ws.a@example.com'),
	('e4000000-0000-4000-8000-000000000002', 'ws.b@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e4000000-0000-4000-8000-000000000001', 'ws.a@example.com', 'Workspace A', NULL),
	('e4000000-0000-4000-8000-000000000002', 'ws.b@example.com', 'Workspace B', NULL)
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('e4000000-0000-4000-8000-000000000011', 'human', 'Workspace A', 'ws.a@example.com', 'e4000000-0000-4000-8000-000000000001'),
	('e4000000-0000-4000-8000-000000000012', 'human', 'Workspace B', 'ws.b@example.com', 'e4000000-0000-4000-8000-000000000002')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e4000000-0000-4000-8000-000000000021', 'A real project', 'project.default', 'e4000000-0000-4000-8000-000000000011', 'active');

-- 0. Grants: the signed-in creator is callable by users; the per-user one is server-only.
SELECT pg_temp.assert_true(
	has_function_privilege('authenticated', 'public.ensure_workspace_project()', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.ensure_workspace_project()', 'EXECUTE'),
	'ensure_workspace_project is for signed-in users only'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege('authenticated', 'public.ensure_workspace_project_for_user(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.ensure_workspace_project_for_user(uuid)', 'EXECUTE'),
	'ensure_workspace_project_for_user is server-only'
);
SELECT pg_temp.assert_true(
	has_function_privilege('authenticated', 'public.get_onto_project_summaries_v1(uuid, integer)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.get_onto_project_summaries_v1(uuid, integer)', 'EXECUTE'),
	'project summaries keep their grants after the re-create'
);

-- 1. A signed-in person gets one workspace, the same one every time.
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE ws_ids AS SELECT public.ensure_workspace_project() AS first_id, public.ensure_workspace_project() AS second_id;
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT first_id IS NOT NULL AND first_id = second_id FROM ws_ids),
	'ensure_workspace_project returns one stable id'
);
SELECT pg_temp.assert_true(
	(SELECT p.kind = 'workspace' AND p.name = 'Workspace' AND p.state_key::text = 'active'
		AND p.created_by = 'e4000000-0000-4000-8000-000000000011'
		AND p.icon_emoji IS NOT NULL
		FROM public.onto_projects p JOIN ws_ids ON p.id = ws_ids.first_id),
	'the workspace row has its fixed shape and an emoji (no paid emoji job)'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.onto_project_members m JOIN ws_ids ON m.project_id = ws_ids.first_id
		WHERE m.actor_id = 'e4000000-0000-4000-8000-000000000011' AND m.role_key = 'owner' AND m.removed_at IS NULL),
	'the owner is the workspace''s only member'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.queue_jobs j JOIN ws_ids ON j.dedup_key = 'pick_project_emoji:' || ws_ids.first_id),
	'no emoji job is queued for the workspace'
);

-- 2. Someone else can't resolve A's workspace through the server-only function.
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
	'SELECT public.ensure_workspace_project_for_user(''e4000000-0000-4000-8000-000000000001'')',
	'permission denied for function ensure_workspace_project_for_user',
	'a signed-in user calling the server-only creator'
);
RESET ROLE;

-- B's workspace is a different row.
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE ws_b AS SELECT public.ensure_workspace_project() AS id;
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT ws_b.id <> ws_ids.first_id FROM ws_b, ws_ids),
	'each person has their own workspace'
);

-- 3. A second live workspace for the same actor is impossible.
SELECT pg_temp.expect_error(
	format(
		'INSERT INTO public.onto_projects (name, type_key, created_by, state_key, kind) VALUES (%L, %L, %L, %L, %L)',
		'Workspace', 'project.workspace', 'e4000000-0000-4000-8000-000000000011', 'active', 'workspace'
	),
	'duplicate key value violates unique constraint "onto_projects_one_workspace_per_actor"',
	'a second workspace'
);

-- 4. Shape guards, as the signed-in owner.
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000001', 'authenticated');
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET name = %L WHERE id = %L', 'Renamed', first_id) FROM ws_ids),
	'workspace_identity_fixed', 'renaming the workspace'
);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET state_key = %L WHERE id = %L', 'completed', first_id) FROM ws_ids),
	'workspace_identity_fixed', 'completing the workspace'
);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET deleted_at = now() WHERE id = %L', first_id) FROM ws_ids),
	'workspace_cannot_be_deleted', 'a signed-in user deleting the workspace'
);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET archived_at = now() WHERE id = %L', first_id) FROM ws_ids),
	'workspace_cannot_be_deleted', 'a signed-in user archiving the workspace'
);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET kind = %L WHERE id = %L', 'project', first_id) FROM ws_ids),
	'project_kind_immutable', 'turning the workspace into a project'
);
SELECT pg_temp.expect_error(
	format('UPDATE public.onto_projects SET kind = %L WHERE id = %L', 'workspace', 'e4000000-0000-4000-8000-000000000021'),
	'project_kind_immutable', 'turning a project into a workspace'
);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET created_by = %L WHERE id = %L', 'e4000000-0000-4000-8000-000000000012', first_id) FROM ws_ids),
	'workspace_owner_fixed', 'handing the workspace to someone else'
);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET is_public = true WHERE id = %L', first_id) FROM ws_ids),
	'workspace_shape_protected', 'making the workspace public'
);

-- A project can't go inside, or be combined into, the workspace (with the hierarchy
-- write flag on, so this guard is the one that answers).
SELECT set_config('buildos.project_hierarchy_write', 'on', true);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET parent_project_id = %L WHERE id = %L', first_id, 'e4000000-0000-4000-8000-000000000021') FROM ws_ids),
	'workspace_cannot_hold_projects', 'nesting a project in the workspace'
);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET merged_into_project_id = %L WHERE id = %L', first_id, 'e4000000-0000-4000-8000-000000000021') FROM ws_ids),
	'workspace_cannot_hold_projects', 'combining a project into the workspace'
);
SELECT pg_temp.expect_error(
	(SELECT format('UPDATE public.onto_projects SET parent_project_id = %L WHERE id = %L', 'e4000000-0000-4000-8000-000000000021', first_id) FROM ws_ids),
	'workspace_shape_protected', 'nesting the workspace in a project'
);
SELECT set_config('buildos.project_hierarchy_write', '', true);

-- Description and next-step fields stay writable (nothing guards them).
UPDATE public.onto_projects SET description = 'Still mine' WHERE id = (SELECT first_id FROM ws_ids);

-- The server may retire a workspace (account deletion runs as service_role).
SELECT pg_temp.act_as(NULL, 'service_role');
UPDATE public.onto_projects SET deleted_at = now() WHERE id = (SELECT id FROM ws_b);
UPDATE public.onto_projects SET deleted_at = NULL WHERE id = (SELECT id FROM ws_b);

-- 5. Sharing guards.
SELECT pg_temp.expect_error(
	(SELECT format(
		'INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES (%L, %L, %L, %L)',
		first_id, 'e4000000-0000-4000-8000-000000000012', 'editor', 'write') FROM ws_ids),
	'workspace_not_shareable', 'adding a member to the workspace'
);
SELECT pg_temp.expect_error(
	(SELECT format(
		'INSERT INTO public.onto_project_invites (project_id, invitee_email, token_hash, role_key, access, expires_at) VALUES (%L, %L, %L, %L, %L, now() + interval ''7 days'')',
		first_id, 'ws.b@example.com', repeat('b', 64), 'editor', 'write') FROM ws_ids),
	'workspace_not_shareable', 'inviting someone to the workspace'
);
-- Real projects still take members.
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access)
VALUES ('e4000000-0000-4000-8000-000000000021', 'e4000000-0000-4000-8000-000000000012', 'editor', 'write');

-- 6. Summaries return kind, and still return the workspace (Today and chat read it).
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE ws_summaries AS
	SELECT s.id, s.kind FROM public.get_onto_project_summaries_v1('e4000000-0000-4000-8000-000000000011') s;
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(*) FILTER (WHERE kind = 'workspace') = 1 AND count(*) FILTER (WHERE kind = 'project') = 1 FROM ws_summaries),
	'summaries return one workspace and one project, each with its kind'
);

-- 7. The billing gate filters on kind. It can't be called here: in production it
-- raises "column reference user_id is ambiguous" on every call (checked 2026-10-23 in a
-- read-only transaction), and the app treats that error as "not frozen". This migration
-- keeps that behavior and only adds the kind filter, so a later fix never counts the
-- workspace. Assert the filter is in the body.
SELECT pg_temp.act_as(NULL, 'service_role');
SELECT pg_temp.assert_true(
	position('p.kind = ''project''' IN pg_get_functiondef('public.evaluate_user_consumption_gate(uuid,integer,integer)'::regprocedure)) > 0,
	'the billing gate counts kind = project only'
);

-- 8. Brief eligibility: a workspace alone qualifies only while it holds an open task.
UPDATE public.onto_project_members SET removed_at = now()
	WHERE project_id = 'e4000000-0000-4000-8000-000000000021' AND actor_id = 'e4000000-0000-4000-8000-000000000012';
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.get_daily_brief_eligible_user_ids(ARRAY['e4000000-0000-4000-8000-000000000002'::uuid])),
	'an empty workspace does not make someone brief-eligible'
);
INSERT INTO public.onto_tasks (project_id, title, created_by, state_key)
SELECT id, 'Renew passport', 'e4000000-0000-4000-8000-000000000012', 'todo' FROM ws_b;
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM public.get_daily_brief_eligible_user_ids(ARRAY['e4000000-0000-4000-8000-000000000002'::uuid])),
	'an open loose task makes someone brief-eligible'
);

ROLLBACK;
