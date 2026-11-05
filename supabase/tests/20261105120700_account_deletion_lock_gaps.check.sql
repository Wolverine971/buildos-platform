-- supabase/tests/20261105120700_account_deletion_lock_gaps.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261105120700_account_deletion_lock_gaps.sql \
--     --check supabase/tests/20261105120700_account_deletion_lock_gaps.check.sql
--
-- Once a person requests account deletion: their builder page and chat shares go offline, and
-- nobody can join a project the purge will delete. Other people's pages and projects the
-- person co-owns with someone else keep working. All changes roll back.

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;

-- A = deleting owner, B = joiner, C = co-owner of P2, D = unrelated builder, E = existing member.
INSERT INTO auth.users (id, email) VALUES
	('c1070000-0000-4000-8000-00000000000a', 'lock-gap-a@example.com'),
	('c1070000-0000-4000-8000-00000000000b', 'lock-gap-b@example.com'),
	('c1070000-0000-4000-8000-00000000000c', 'lock-gap-c@example.com'),
	('c1070000-0000-4000-8000-00000000000d', 'lock-gap-d@example.com'),
	('c1070000-0000-4000-8000-00000000000e', 'lock-gap-e@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('c1070000-0000-4000-8000-00000000000a', 'lock-gap-a@example.com', 'Lock A', 'lockgapowner'),
	('c1070000-0000-4000-8000-00000000000b', 'lock-gap-b@example.com', 'Lock B', 'lockgapjoiner'),
	('c1070000-0000-4000-8000-00000000000c', 'lock-gap-c@example.com', 'Lock C', 'lockgapcoowner'),
	('c1070000-0000-4000-8000-00000000000d', 'lock-gap-d@example.com', 'Lock D', 'lockgapcontrol'),
	('c1070000-0000-4000-8000-00000000000e', 'lock-gap-e@example.com', 'Lock E', 'lockgapmember')
ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, name = EXCLUDED.name;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('c1070000-0000-4000-8000-0000000000aa', 'human', 'Lock A', 'lock-gap-a@example.com', 'c1070000-0000-4000-8000-00000000000a'),
	('c1070000-0000-4000-8000-0000000000bb', 'human', 'Lock B', 'lock-gap-b@example.com', 'c1070000-0000-4000-8000-00000000000b'),
	('c1070000-0000-4000-8000-0000000000cc', 'human', 'Lock C', 'lock-gap-c@example.com', 'c1070000-0000-4000-8000-00000000000c'),
	('c1070000-0000-4000-8000-0000000000ee', 'human', 'Lock E', 'lock-gap-e@example.com', 'c1070000-0000-4000-8000-00000000000e')
ON CONFLICT DO NOTHING;

-- P1: only A owns it (the purge deletes it). P2: A created it, C is also an owner (it survives).
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('c1070000-0000-4000-8000-000000000101', 'Lock P1', 'project.default', 'c1070000-0000-4000-8000-0000000000aa', 'active'),
	('c1070000-0000-4000-8000-000000000102', 'Lock P2', 'project.default', 'c1070000-0000-4000-8000-0000000000aa', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, agent_access) VALUES
	('c1070000-0000-4000-8000-000000000101', 'c1070000-0000-4000-8000-0000000000aa', 'owner', 'admin', 'write'),
	('c1070000-0000-4000-8000-000000000101', 'c1070000-0000-4000-8000-0000000000ee', 'viewer', 'read', 'read'),
	('c1070000-0000-4000-8000-000000000102', 'c1070000-0000-4000-8000-0000000000aa', 'owner', 'admin', 'write'),
	('c1070000-0000-4000-8000-000000000102', 'c1070000-0000-4000-8000-0000000000cc', 'owner', 'admin', 'write')
ON CONFLICT DO NOTHING;

INSERT INTO public.onto_project_invite_links (id, project_id, token_hash, role_key, access, agent_access, created_by_actor_id, expires_at) VALUES
	('c1070000-0000-4000-8000-000000000201', 'c1070000-0000-4000-8000-000000000101', repeat('a', 64), 'editor', 'write', 'read', 'c1070000-0000-4000-8000-0000000000aa', now() + interval '7 days'),
	('c1070000-0000-4000-8000-000000000202', 'c1070000-0000-4000-8000-000000000102', repeat('b', 64), 'editor', 'write', 'read', 'c1070000-0000-4000-8000-0000000000aa', now() + interval '7 days');
INSERT INTO public.onto_project_invites (id, project_id, invitee_email, invitee_user_id, role_key, access, agent_access, token_hash, invited_by_actor_id, status, expires_at) VALUES
	('c1070000-0000-4000-8000-000000000301', 'c1070000-0000-4000-8000-000000000101', 'lock-gap-b@example.com', 'c1070000-0000-4000-8000-00000000000b', 'editor', 'write', 'read', repeat('1', 64), 'c1070000-0000-4000-8000-0000000000aa', 'pending', now() + interval '7 days'),
	('c1070000-0000-4000-8000-000000000302', 'c1070000-0000-4000-8000-000000000102', 'lock-gap-b@example.com', 'c1070000-0000-4000-8000-00000000000b', 'editor', 'write', 'read', repeat('2', 64), 'c1070000-0000-4000-8000-0000000000aa', 'pending', now() + interval '7 days');

INSERT INTO public.builder_profiles (user_id, status) VALUES
	('c1070000-0000-4000-8000-00000000000a', 'published'),
	('c1070000-0000-4000-8000-00000000000d', 'published');
INSERT INTO public.chat_sessions (id, user_id, context_type, status) VALUES
	('c1070000-0000-4000-8000-000000000401', 'c1070000-0000-4000-8000-00000000000a', 'global', 'active');
INSERT INTO public.chat_session_shares (token, session_id, user_id, title, included_message_ids, snapshot, policy_version) VALUES
	('LockGapShareToken00001', 'c1070000-0000-4000-8000-000000000401', 'c1070000-0000-4000-8000-00000000000a', 'Fixture',
	 ARRAY['c1070000-0000-4000-8000-000000000402'::uuid], '{"version":1,"messages":[]}', 'chat_share_v1');

-- 0. The helpers are server-only.
DO $$
BEGIN
	ASSERT NOT has_function_privilege('authenticated', 'private.project_owner_is_deleting(uuid)', 'EXECUTE'),
		'authenticated must not call project_owner_is_deleting';
	ASSERT NOT has_function_privilege('anon', 'private.account_deletion_take_down_shared(uuid)', 'EXECUTE'),
		'anon must not call account_deletion_take_down_shared';
	ASSERT NOT has_function_privilege('authenticated', 'private.account_deletion_take_down_shared(uuid)', 'EXECUTE'),
		'authenticated must not call account_deletion_take_down_shared';
END;
$$;

-- 1. Before the request, A's page is public (the baseline the audit described).
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
	ASSERT (public.get_builder_profile('lockgapowner') ->> 'found')::boolean,
		'baseline: published page is visible before deletion';
END;
$$;
RESET ROLE;

-- 2. A requests deletion (the server calls this with the service role).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT * FROM public.request_account_deletion('c1070000-0000-4000-8000-00000000000a');

DO $$
BEGIN
	ASSERT (SELECT status = 'draft' FROM public.builder_profiles
		WHERE user_id = 'c1070000-0000-4000-8000-00000000000a'), 'A builder page unpublished at lock';
	ASSERT (SELECT status = 'published' FROM public.builder_profiles
		WHERE user_id = 'c1070000-0000-4000-8000-00000000000d'), 'D builder page untouched';
	ASSERT (SELECT revoked_at IS NOT NULL FROM public.chat_session_shares
		WHERE token = 'LockGapShareToken00001'), 'A chat share revoked at lock';
	ASSERT (SELECT revoked_at IS NOT NULL AND revoked_reason = 'turned_off' FROM public.onto_project_invite_links
		WHERE id = 'c1070000-0000-4000-8000-000000000201'), 'invite link on purged project revoked';
	ASSERT (SELECT revoked_at IS NULL FROM public.onto_project_invite_links
		WHERE id = 'c1070000-0000-4000-8000-000000000202'), 'invite link on co-owned project kept';
	ASSERT (SELECT status = 'revoked' FROM public.onto_project_invites
		WHERE id = 'c1070000-0000-4000-8000-000000000301'), 'pending invite on purged project revoked';
	ASSERT (SELECT status = 'pending' FROM public.onto_project_invites
		WHERE id = 'c1070000-0000-4000-8000-000000000302'), 'pending invite on co-owned project kept';
END;
$$;

-- Reader guard on its own: even if the profile were published again, it stays hidden.
UPDATE public.builder_profiles SET status = 'published' WHERE user_id = 'c1070000-0000-4000-8000-00000000000a';

-- 3. Anonymous and signed-in readers no longer see A's page; D's page still works.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
	ASSERT NOT (public.get_builder_profile('lockgapowner') ->> 'found')::boolean,
		'anon must not see a deleting account''s page';
	ASSERT (public.get_builder_profile('lockgapcontrol') ->> 'found')::boolean,
		'other builder pages still render';
	ASSERT NOT (COALESCE(public.get_builder_project('lockgapowner', 'lock-p1') ->> 'found', 'false'))::boolean,
		'project pages of a deleting account are not found';
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
BEGIN
	ASSERT NOT (public.get_builder_profile('lockgapowner', 'c1070000-0000-4000-8000-00000000000b') ->> 'found')::boolean,
		'server-side reads (json view, MCP tool) must not see the page';
	ASSERT NOT EXISTS (SELECT 1 FROM public.builder_profile_target('lockgapowner')),
		'builder_profile_target treats a deleting account as not found';
	ASSERT EXISTS (SELECT 1 FROM public.builder_profile_target('lockgapcontrol')),
		'builder_profile_target still finds other people';
END;
$$;

-- 4. B cannot join P1 by link or invite; B can still join P2 (it survives the purge).
SELECT set_config('request.jwt.claims',
	'{"role":"authenticated","sub":"c1070000-0000-4000-8000-00000000000b"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_refused boolean := false;
BEGIN
	ASSERT public.accept_project_invite_link(repeat('a', 64)) ->> 'status' = 'turned_off',
		'revoked link on purged project refuses the join';

	BEGIN
		PERFORM * FROM public.accept_project_invite_by_id('c1070000-0000-4000-8000-000000000301');
	EXCEPTION WHEN OTHERS THEN
		v_refused := true;
	END;
	ASSERT v_refused, 'revoked invite on purged project refuses the join';

	ASSERT public.accept_project_invite_link(repeat('b', 64)) ->> 'status' = 'joined',
		'link on a co-owned project still works';
END;
$$;
RESET ROLE;

-- 5. Backstop: an invite created during the lock (e.g. by a non-owner admin) still cannot add
-- anyone to P1, but an existing member can still open theirs.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.onto_project_invites (id, project_id, invitee_email, invitee_user_id, role_key, access, agent_access, token_hash, invited_by_actor_id, status, expires_at) VALUES
	('c1070000-0000-4000-8000-000000000303', 'c1070000-0000-4000-8000-000000000101', 'lock-gap-b@example.com', 'c1070000-0000-4000-8000-00000000000b', 'viewer', 'read', 'read', repeat('3', 64), 'c1070000-0000-4000-8000-0000000000ee', 'pending', now() + interval '7 days'),
	('c1070000-0000-4000-8000-000000000304', 'c1070000-0000-4000-8000-000000000101', 'lock-gap-e@example.com', 'c1070000-0000-4000-8000-00000000000e', 'viewer', 'read', 'read', repeat('4', 64), 'c1070000-0000-4000-8000-0000000000aa', 'pending', now() + interval '7 days');

SELECT set_config('request.jwt.claims',
	'{"role":"authenticated","sub":"c1070000-0000-4000-8000-00000000000b"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_message text;
BEGIN
	BEGIN
		PERFORM * FROM public.accept_project_invite_by_id('c1070000-0000-4000-8000-000000000303');
	EXCEPTION WHEN OTHERS THEN
		v_message := SQLERRM;
	END;
	ASSERT v_message = 'Project unavailable', format('join during lock refused (got %s)', v_message);
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
	'{"role":"authenticated","sub":"c1070000-0000-4000-8000-00000000000e"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	ASSERT (SELECT status = 'already_member'
		FROM public.accept_project_invite_by_id('c1070000-0000-4000-8000-000000000304')),
		'existing member can still open the project';
END;
$$;
RESET ROLE;

DO $$
BEGIN
	ASSERT NOT EXISTS (
		SELECT 1 FROM public.onto_project_members
		WHERE project_id = 'c1070000-0000-4000-8000-000000000101'
			AND actor_id = 'c1070000-0000-4000-8000-0000000000bb'
	), 'B never became a member of the purged project';
	ASSERT EXISTS (
		SELECT 1 FROM public.onto_project_members
		WHERE project_id = 'c1070000-0000-4000-8000-000000000102'
			AND actor_id = 'c1070000-0000-4000-8000-0000000000bb' AND removed_at IS NULL
	), 'B joined the co-owned project';
END;
$$;

ROLLBACK;
