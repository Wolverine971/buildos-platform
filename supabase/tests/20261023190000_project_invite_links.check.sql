-- supabase/tests/20261023190000_project_invite_links.check.sql
-- Rehearsal assertions for quick invite links:
--   pnpm db:rehearse supabase/migrations/20261023140000_people_layer_foundation.sql \
--     supabase/migrations/20261023150000_people_layer_owner_only_invites.sql \
--     supabase/migrations/20261023190000_project_invite_links.sql \
--     --check supabase/tests/20261023190000_project_invite_links.check.sql --role-probe
--
-- O = owner, E = editor on the project, S = a stranger with no actor yet, T = another
-- stranger, R = removed by the owner, L = left on their own.
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
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid, text) TO anon, authenticated;

-- Token hashes stand in for sha256(token); the server computes the real ones.
-- h1 = first link, h2 = after reset, h3 = editor link, h4 = expiry test.
INSERT INTO auth.users (id, email) VALUES
	('e2000000-0000-4000-8000-000000000001', 'link.owner@example.com'),
	('e2000000-0000-4000-8000-000000000002', 'link.editor@example.com'),
	('e2000000-0000-4000-8000-000000000003', 'link.stranger@example.com'),
	('e2000000-0000-4000-8000-000000000004', 'link.removed@example.com'),
	('e2000000-0000-4000-8000-000000000005', 'link.leaver@example.com'),
	('e2000000-0000-4000-8000-000000000006', 'link.another@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e2000000-0000-4000-8000-000000000001', 'link.owner@example.com', 'Link Owner', 'linkowner'),
	('e2000000-0000-4000-8000-000000000002', 'link.editor@example.com', 'Link Editor', NULL),
	('e2000000-0000-4000-8000-000000000003', 'link.stranger@example.com', 'Link Stranger', NULL),
	('e2000000-0000-4000-8000-000000000004', 'link.removed@example.com', 'Link Removed', NULL),
	('e2000000-0000-4000-8000-000000000005', 'link.leaver@example.com', 'Link Leaver', NULL),
	('e2000000-0000-4000-8000-000000000006', 'link.another@example.com', 'Link Another', NULL)
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('e2000000-0000-4000-8000-000000000011', 'human', 'Link Owner', 'link.owner@example.com', 'e2000000-0000-4000-8000-000000000001'),
	('e2000000-0000-4000-8000-000000000012', 'human', 'Link Editor', 'link.editor@example.com', 'e2000000-0000-4000-8000-000000000002'),
	('e2000000-0000-4000-8000-000000000014', 'human', 'Link Removed', 'link.removed@example.com', 'e2000000-0000-4000-8000-000000000004'),
	('e2000000-0000-4000-8000-000000000015', 'human', 'Link Leaver', 'link.leaver@example.com', 'e2000000-0000-4000-8000-000000000005')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e2000000-0000-4000-8000-000000000021', 'Link project', 'project.default', 'e2000000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, removed_at, removed_by_actor_id) VALUES
	('e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-000000000011', 'owner', 'admin', NULL, NULL),
	('e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-000000000012', 'editor', 'write', NULL, NULL),
	('e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-000000000014', 'viewer', 'read', now() - interval '1 day', 'e2000000-0000-4000-8000-000000000011'),
	('e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-000000000015', 'viewer', 'read', now() - interval '1 day', 'e2000000-0000-4000-8000-000000000015')
	ON CONFLICT DO NOTHING;
-- A direct invite still waiting for S: joining by link settles it.
INSERT INTO public.onto_project_invites (
	project_id, invitee_email, token_hash, role_key, access, status, expires_at, invited_by_actor_id
) VALUES (
	'e2000000-0000-4000-8000-000000000021', 'link.stranger@example.com', repeat('9', 64),
	'viewer', 'read', 'pending', now() + interval '7 days', 'e2000000-0000-4000-8000-000000000011'
);

-- 0. Grants: no client touches the table; only the RPCs the browser needs are callable.
SELECT pg_temp.assert_true(
	NOT has_table_privilege('authenticated', 'public.onto_project_invite_links', 'SELECT')
		AND NOT has_table_privilege('anon', 'public.onto_project_invite_links', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'public.onto_project_invite_links', 'INSERT'),
	'clients have no direct access to invite links'
);
SELECT pg_temp.assert_true(
	has_function_privilege('anon', 'public.get_project_invite_link_preview(text)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.accept_project_invite_link(text)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.create_project_invite_link(uuid, uuid, text, text, text, integer)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.get_project_invite_link(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.project_invite_link_owner_actor(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.project_invite_link_settings(uuid)', 'EXECUTE')
		AND has_function_privilege('authenticated', 'public.accept_project_invite_link(text)', 'EXECUTE'),
	'only the preview is signed-out callable; helpers are server-only'
);

-- 1. Only the owner creates, reads, changes, resets, or turns off the link.
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.create_project_invite_link(
		'e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-0000000000a1', repeat('1', 64));
	RAISE EXCEPTION 'assertion_failed: an editor created an invite link';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
	PERFORM public.get_project_invite_link('e2000000-0000-4000-8000-000000000021');
	RAISE EXCEPTION 'assertion_failed: an editor read the invite link settings';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
	PERFORM * FROM public.onto_project_invite_links;
	RAISE EXCEPTION 'assertion_failed: a signed-in user read the invite link table';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

SELECT pg_temp.act_as(NULL, 'anon');
SET LOCAL ROLE anon;
DO $$
BEGIN
	PERFORM public.create_project_invite_link(
		'e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-0000000000a1', repeat('1', 64));
	RAISE EXCEPTION 'assertion_failed: a signed-out visitor created an invite link';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.get_project_invite_link('e2000000-0000-4000-8000-000000000021')->'link' = 'null'::jsonb,
	'no link until the owner makes one'
);
DO $$
BEGIN
	PERFORM public.create_project_invite_link(
		'e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-0000000000a9', repeat('8', 64),
		'viewer', 'write');
	RAISE EXCEPTION 'assertion_failed: a viewer link let agents write';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
DO $$
BEGIN
	PERFORM public.create_project_invite_link(
		'e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-0000000000a9', repeat('8', 64),
		'viewer', 'read', 90);
	RAISE EXCEPTION 'assertion_failed: a link lasted longer than 30 days';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
SELECT pg_temp.assert_true(
	(public.create_project_invite_link(
		'e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-0000000000a1', repeat('1', 64)
	)->>'replaced')::boolean = false,
	'the owner creates the first link (Viewer, agents Read, 7 days by default)'
);
SELECT pg_temp.assert_true(
	(SELECT l->>'role_key' = 'viewer'
		AND l->>'agent_access' = 'read'
		AND (l->>'expires_at')::timestamptz BETWEEN now() + interval '6 days 23 hours' AND now() + interval '7 days 1 minute'
		AND NOT l ? 'token_hash'
		AND position(repeat('1', 64) IN l::text) = 0
	 FROM (SELECT public.get_project_invite_link('e2000000-0000-4000-8000-000000000021')->'link' AS l) AS s),
	'the owner sees the settings, never the token hash'
);
RESET ROLE;

-- 2. The signed-out preview shows exactly: status, project, who invited, role, agents, expiry.
SELECT pg_temp.act_as(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(
	(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.get_project_invite_link_preview(repeat('1', 64))) AS k)
		= ARRAY['agent_access', 'expires_at', 'inviter_name', 'project_name', 'role_key', 'status'],
	'the preview has only the six link fields'
);
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('1', 64)) @> jsonb_build_object(
		'status', 'active', 'project_name', 'Link project', 'inviter_name', 'Link Owner', 'role_key', 'viewer'),
	'the preview names the project and the owner'
);
SELECT pg_temp.assert_true(
	position('@example.com' IN public.get_project_invite_link_preview(repeat('1', 64))::text) = 0
		AND position('e2000000-0000-4000-8000-000000000021' IN public.get_project_invite_link_preview(repeat('1', 64))::text) = 0,
	'the preview carries no email and no project id for a stranger'
);
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('7', 64)) = '{"status": "not_found"}'::jsonb
		AND public.get_project_invite_link_preview('not-a-hash') = '{"status": "not_found"}'::jsonb,
	'an unknown or malformed token reads as not found'
);
DO $$
BEGIN
	PERFORM public.accept_project_invite_link(repeat('1', 64));
	RAISE EXCEPTION 'assertion_failed: a signed-out visitor joined';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- A member previewing gets told they're already in.
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(public.get_project_invite_link_preview(repeat('1', 64))->>'already_member')::boolean
		AND public.get_project_invite_link_preview(repeat('1', 64))->>'project_id' = 'e2000000-0000-4000-8000-000000000021',
	'a member sees they are already in'
);
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('1', 64))->>'status' = 'already_member',
	'a member joining again changes nothing'
);
RESET ROLE;

-- 3. A stranger signs in and joins with the link's role and agent setting.
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000003', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('1', 64)) @> '{"status": "joined", "role_key": "viewer", "agent_access": "read"}'::jsonb,
	'a stranger joins'
);
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('1', 64))->>'status' = 'already_member',
	'joining twice is a no-op'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT m.role_key = 'viewer' AND m.access = 'read' AND m.agent_access = 'read'
		AND m.joined_via_invite_link_id = 'e2000000-0000-4000-8000-0000000000a1'
	 FROM public.onto_project_members AS m
	 JOIN public.onto_actors AS a ON a.id = m.actor_id
	 WHERE a.user_id = 'e2000000-0000-4000-8000-000000000003'
		AND m.project_id = 'e2000000-0000-4000-8000-000000000021' AND m.removed_at IS NULL),
	'the new member is a viewer whose agents can read, marked as joined by link'
);
SELECT pg_temp.assert_true(
	NOT actor_has_project_member_access(
		(SELECT id FROM public.onto_actors WHERE user_id = 'e2000000-0000-4000-8000-000000000003'),
		'e2000000-0000-4000-8000-000000000021', 'write'),
	'a viewer link never grants write'
);
SELECT pg_temp.assert_true(
	(SELECT status FROM public.onto_project_invites WHERE token_hash = repeat('9', 64)) = 'revoked',
	'their waiting direct invite is settled'
);
SELECT pg_temp.assert_true(
	(SELECT join_count FROM public.onto_project_invite_links WHERE id = 'e2000000-0000-4000-8000-0000000000a1') = 1,
	'the link counts the join once'
);

-- Removed by the owner: the link never adds them back. Left on their own: they can return.
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000004', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('1', 64))->>'status' = 'removed',
	'someone the owner removed cannot rejoin by link'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT removed_at IS NOT NULL FROM public.onto_project_members
	 WHERE actor_id = 'e2000000-0000-4000-8000-000000000014' AND project_id = 'e2000000-0000-4000-8000-000000000021'),
	'the removed member stays removed'
);
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000005', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('1', 64))->>'status' = 'joined',
	'someone who left can come back with the link'
);
RESET ROLE;

-- 4. Changing settings keeps the same link; a Viewer never gets agent Write.
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.update_project_invite_link('e2000000-0000-4000-8000-000000000021', 'viewer', 'write');
	RAISE EXCEPTION 'assertion_failed: a viewer link was changed to agent write';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
RESET ROLE;
DO $$
BEGIN
	INSERT INTO public.onto_project_invite_links (project_id, token_hash, role_key, access, agent_access, expires_at, revoked_at, revoked_reason)
	VALUES ('e2000000-0000-4000-8000-000000000021', repeat('6', 64), 'viewer', 'read', 'write', now() + interval '1 day', now(), 'turned_off');
	RAISE EXCEPTION 'assertion_failed: the table accepted a viewer link with agent write';
EXCEPTION WHEN check_violation THEN NULL;
END $$;
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.update_project_invite_link('e2000000-0000-4000-8000-000000000021', 'editor', 'write');
	RAISE EXCEPTION 'assertion_failed: an editor changed the invite link';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- 5. Reset: the old link stops working, the new one works, members stay.
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(public.create_project_invite_link(
		'e2000000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-0000000000a2', repeat('2', 64)
	)->>'replaced')::boolean,
	'resetting replaces the current link'
);
RESET ROLE;
SELECT pg_temp.act_as(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('1', 64)) = '{"status": "reset"}'::jsonb,
	'the old link says it was replaced, and nothing else'
);
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('2', 64))->>'status' = 'active',
	'the new link works'
);
RESET ROLE;
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000006', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('1', 64))->>'status' = 'reset',
	'the old link no longer adds anyone'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.onto_project_invite_links
	 WHERE project_id = 'e2000000-0000-4000-8000-000000000021' AND revoked_at IS NULL) = 1,
	'one live link per project'
);

-- 6. An Editor link with agent Write gives exactly that.
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.update_project_invite_link('e2000000-0000-4000-8000-000000000021', 'editor', 'write', 1)->'link'
		@> '{"role_key": "editor", "agent_access": "write"}'::jsonb,
	'the owner can make it an Editor link with agent write'
);
RESET ROLE;
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000006', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('2', 64)) @> '{"status": "joined", "role_key": "editor", "agent_access": "write"}'::jsonb,
	'a stranger joins as an editor through the same (unchanged) link'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT m.access = 'write' AND m.agent_access = 'write'
	 FROM public.onto_project_members AS m JOIN public.onto_actors AS a ON a.id = m.actor_id
	 WHERE a.user_id = 'e2000000-0000-4000-8000-000000000006'
		AND m.project_id = 'e2000000-0000-4000-8000-000000000021'),
	'the editor member and their agents can write'
);

-- 7. Expired links stop working until the owner extends or resets them.
UPDATE public.onto_project_invite_links SET expires_at = now() - interval '1 minute'
WHERE id = 'e2000000-0000-4000-8000-0000000000a2';
SELECT pg_temp.act_as(NULL, 'anon');
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('2', 64)) = '{"status": "expired"}'::jsonb,
	'an expired link says so, and nothing else'
);
RESET ROLE;
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000004', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('2', 64))->>'status' = 'expired',
	'an expired link adds no one'
);
RESET ROLE;
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(public.get_project_invite_link('e2000000-0000-4000-8000-000000000021')->'link'->>'expired')::boolean,
	'the owner sees the link expired'
);
SELECT pg_temp.assert_true(
	(public.update_project_invite_link('e2000000-0000-4000-8000-000000000021', 'viewer', 'read', 7)->'link'->>'expired')::boolean = false,
	'extending brings the same link back'
);

-- 8. Turning it off: the link stops, members stay, nothing is live.
SELECT pg_temp.assert_true(
	(public.turn_off_project_invite_link('e2000000-0000-4000-8000-000000000021')->>'turned_off')::boolean,
	'the owner turns the link off'
);
SELECT pg_temp.assert_true(
	public.get_project_invite_link('e2000000-0000-4000-8000-000000000021')->'link' = 'null'::jsonb,
	'no live link after turning it off'
);
RESET ROLE;
SELECT pg_temp.act_as('e2000000-0000-4000-8000-000000000004', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('2', 64)) = '{"status": "turned_off"}'::jsonb
		AND public.accept_project_invite_link(repeat('2', 64))->>'status' = 'turned_off',
	'a turned-off link says so and adds no one'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.onto_project_members AS m JOIN public.onto_actors AS a ON a.id = m.actor_id
	 WHERE m.project_id = 'e2000000-0000-4000-8000-000000000021' AND m.removed_at IS NULL
		AND a.user_id IN ('e2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000006')) = 3,
	'everyone who joined by link is still a member'
);

ROLLBACK;
