-- supabase/tests/20261115180000_collaborator_emails_private.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261115180000_collaborator_emails_private.sql \
--     --check supabase/tests/20261115180000_collaborator_emails_private.check.sql --role-probe
--
-- Owner A, members B and C, @handle invitee H. As signed-in B: reading C's email through the
-- table API is refused, while names still read; B's own email never comes from onto_actors
-- either (it lives on users). The project load and chat context RPCs give B no one's email
-- but B's own, and give owner A everyone's. As signed-in A: the invite row for H reads without
-- invitee_email, and selecting it is refused. Server callers still see every column.

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

-- Users e8…0N, actors e8…1N, project e8…21, members e8…3N, task e8…41, invite e8…51.
INSERT INTO auth.users (id, email) VALUES
	('e8150000-0000-4000-8000-000000000001', 'email-priv-a@example.com'),
	('e8150000-0000-4000-8000-000000000002', 'email-priv-b@example.com'),
	('e8150000-0000-4000-8000-000000000003', 'email-priv-c@example.com'),
	('e8150000-0000-4000-8000-000000000004', 'email-priv-h@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e8150000-0000-4000-8000-000000000001', 'email-priv-a@example.com', 'Owner', NULL),
	('e8150000-0000-4000-8000-000000000002', 'email-priv-b@example.com', 'Member B', NULL),
	('e8150000-0000-4000-8000-000000000003', 'email-priv-c@example.com', 'Member C', NULL),
	('e8150000-0000-4000-8000-000000000004', 'email-priv-h@example.com', 'Handle person', 'emailprivh')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, user_id, email) VALUES
	('e8150000-0000-4000-8000-000000000011', 'human', 'Owner', 'e8150000-0000-4000-8000-000000000001', 'email-priv-a@example.com'),
	('e8150000-0000-4000-8000-000000000012', 'human', 'Member B', 'e8150000-0000-4000-8000-000000000002', 'email-priv-b@example.com'),
	('e8150000-0000-4000-8000-000000000013', 'human', 'Member C', 'e8150000-0000-4000-8000-000000000003', 'email-priv-c@example.com'),
	('e8150000-0000-4000-8000-000000000014', 'human', 'Handle person', 'e8150000-0000-4000-8000-000000000004', 'email-priv-h@example.com')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e8150000-0000-4000-8000-000000000021', 'Shared plan', 'project.default', 'e8150000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (id, project_id, actor_id, role_key, access) VALUES
	('e8150000-0000-4000-8000-000000000031', 'e8150000-0000-4000-8000-000000000021', 'e8150000-0000-4000-8000-000000000011', 'owner', 'admin'),
	('e8150000-0000-4000-8000-000000000032', 'e8150000-0000-4000-8000-000000000021', 'e8150000-0000-4000-8000-000000000012', 'editor', 'write'),
	('e8150000-0000-4000-8000-000000000033', 'e8150000-0000-4000-8000-000000000021', 'e8150000-0000-4000-8000-000000000013', 'editor', 'write')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by) VALUES
	('e8150000-0000-4000-8000-000000000041', 'e8150000-0000-4000-8000-000000000021', 'Shared task', 'todo', 'e8150000-0000-4000-8000-000000000011');
INSERT INTO public.onto_task_assignees (task_id, project_id, assignee_actor_id, assigned_by_actor_id) VALUES
	('e8150000-0000-4000-8000-000000000041', 'e8150000-0000-4000-8000-000000000021', 'e8150000-0000-4000-8000-000000000013', 'e8150000-0000-4000-8000-000000000011'),
	('e8150000-0000-4000-8000-000000000041', 'e8150000-0000-4000-8000-000000000021', 'e8150000-0000-4000-8000-000000000012', 'e8150000-0000-4000-8000-000000000011');
INSERT INTO public.onto_project_invites (
	id, project_id, invitee_email, invitee_handle, invitee_user_id, token_hash, role_key, access,
	status, expires_at, invited_by_actor_id
) VALUES (
	'e8150000-0000-4000-8000-000000000051', 'e8150000-0000-4000-8000-000000000021',
	'email-priv-h@example.com', 'emailprivh', 'e8150000-0000-4000-8000-000000000004',
	'email-priv-token-hash', 'editor', 'write', 'pending', now() + interval '7 days',
	'e8150000-0000-4000-8000-000000000011'
);

-- 1. Grants.
SELECT pg_temp.assert_true(
	NOT has_column_privilege('authenticated', 'public.onto_actors', 'email', 'SELECT')
	AND has_column_privilege('authenticated', 'public.onto_actors', 'name', 'SELECT')
	AND NOT has_column_privilege('anon', 'public.onto_actors', 'email', 'SELECT')
	AND NOT has_column_privilege('authenticated', 'public.onto_project_invites', 'invitee_email', 'SELECT')
	AND has_column_privilege('authenticated', 'public.onto_project_invites', 'invitee_handle', 'SELECT')
	AND has_column_privilege('service_role', 'public.onto_actors', 'email', 'SELECT')
	AND has_column_privilege('service_role', 'public.onto_project_invites', 'invitee_email', 'SELECT')
	AND NOT has_function_privilege('authenticated', 'public.get_admin_dashboard_comprehensive_analytics(timestamptz, timestamptz, timestamptz)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.get_admin_dashboard_comprehensive_analytics(timestamptz, timestamptz, timestamptz)', 'EXECUTE'),
	'column and function grants'
);

-- 2. Member B through the table API.
SELECT pg_temp.as_user('e8150000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('b_reads_c_email',
	$q$SELECT email FROM public.onto_actors WHERE id = 'e8150000-0000-4000-8000-000000000013'$q$);
SELECT pg_temp.try('b_reads_star',
	$q$SELECT * FROM public.onto_actors WHERE id = 'e8150000-0000-4000-8000-000000000013'$q$);
SELECT pg_temp.try('b_reads_c_name',
	$q$SELECT id, name, user_id FROM public.onto_actors WHERE id = 'e8150000-0000-4000-8000-000000000013'$q$);
INSERT INTO results
SELECT 'b_sees_c_row', count(*)::text FROM public.onto_actors WHERE id = 'e8150000-0000-4000-8000-000000000013';
INSERT INTO results
SELECT 'b_project_assignee_emails',
	coalesce((
		SELECT string_agg(coalesce(x->>'email', '-'), ',' ORDER BY x->>'name')
		FROM jsonb_array_elements(
			public.get_project_full_v2_initial('e8150000-0000-4000-8000-000000000021', NULL)
				-> 'task_assignees' -> 'e8150000-0000-4000-8000-000000000041'
		) x
	), 'none');
INSERT INTO results
SELECT 'b_chat_member_emails',
	coalesce((
		SELECT string_agg(coalesce(x->>'actor_email', '-'), ',' ORDER BY x->>'actor_name')
		FROM jsonb_array_elements(
			public.load_fastchat_context('project', NULL, 'e8150000-0000-4000-8000-000000000021', NULL, NULL)
				-> 'members'
		) x
	), 'none');
INSERT INTO results
SELECT 'b_slug_for_c', public.resolve_onto_public_page_slug_prefix('e8150000-0000-4000-8000-000000000013');
RESET ROLE;

-- 3. Owner A.
SELECT pg_temp.as_user('e8150000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('a_reads_invite_email',
	$q$SELECT invitee_email FROM public.onto_project_invites WHERE id = 'e8150000-0000-4000-8000-000000000051'$q$);
SELECT pg_temp.try('a_reads_invite_row',
	$q$SELECT id, invitee_handle, status FROM public.onto_project_invites WHERE id = 'e8150000-0000-4000-8000-000000000051'$q$);
INSERT INTO results
SELECT 'a_sees_invite', count(*)::text FROM public.onto_project_invites WHERE id = 'e8150000-0000-4000-8000-000000000051';
SELECT pg_temp.try('a_expires_invite',
	$q$UPDATE public.onto_project_invites SET status = 'revoked' WHERE id = 'e8150000-0000-4000-8000-000000000051' RETURNING id, status$q$);
INSERT INTO results
SELECT 'a_project_assignee_emails',
	coalesce((
		SELECT string_agg(coalesce(x->>'email', '-'), ',' ORDER BY x->>'name')
		FROM jsonb_array_elements(
			public.get_project_full_v2_initial('e8150000-0000-4000-8000-000000000021', NULL)
				-> 'task_assignees' -> 'e8150000-0000-4000-8000-000000000041'
		) x
	), 'none');
INSERT INTO results
SELECT 'a_chat_member_emails',
	coalesce((
		SELECT string_agg(coalesce(x->>'actor_email', '-'), ',' ORDER BY x->>'actor_name')
		FROM jsonb_array_elements(
			public.load_fastchat_context('project', NULL, 'e8150000-0000-4000-8000-000000000021', NULL, NULL)
				-> 'members'
		) x
	), 'none');
RESET ROLE;

-- 4. Assertions.
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'b_reads_c_email') LIKE 'permission denied%',
	'member B cannot select member C''s email: ' || coalesce((SELECT value FROM results WHERE key = 'b_reads_c_email'), 'null')
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'b_reads_star') LIKE 'permission denied%',
	'select * on onto_actors is refused for signed-in clients'
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'b_reads_c_name') = 'ok'
	AND (SELECT value FROM results WHERE key = 'b_sees_c_row') = '1',
	'member B still reads member C''s name'
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'b_project_assignee_emails') = 'email-priv-b@example.com,-',
	'project load gives member B only their own email: ' || coalesce((SELECT value FROM results WHERE key = 'b_project_assignee_emails'), 'null')
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'b_chat_member_emails') = 'email-priv-b@example.com,-,-',
	'chat context gives member B only their own email: ' || coalesce((SELECT value FROM results WHERE key = 'b_chat_member_emails'), 'null')
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'b_slug_for_c') NOT LIKE '%email-priv%',
	'slug prefix never exposes another person''s email'
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'a_reads_invite_email') LIKE 'permission denied%',
	'owner cannot read an @handle invitee''s email through the table API'
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'a_reads_invite_row') = 'ok'
	AND (SELECT value FROM results WHERE key = 'a_sees_invite') = '1'
	AND (SELECT value FROM results WHERE key = 'a_expires_invite') = 'ok',
	'owner still lists and revokes invites'
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'a_project_assignee_emails') = 'email-priv-b@example.com,email-priv-c@example.com',
	'project load gives the owner assignee emails: ' || coalesce((SELECT value FROM results WHERE key = 'a_project_assignee_emails'), 'null')
);
SELECT pg_temp.assert_true(
	(SELECT value FROM results WHERE key = 'a_chat_member_emails') = 'email-priv-b@example.com,email-priv-c@example.com,email-priv-a@example.com',
	'chat context gives the owner member emails: ' || coalesce((SELECT value FROM results WHERE key = 'a_chat_member_emails'), 'null')
);

-- 5. Server callers keep every column: proven by the grants in section 1 (the rehearsal's
--    service_role does not bypass RLS the way production's does, so a row read can't show it).

ROLLBACK;
