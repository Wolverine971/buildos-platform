-- supabase/tests/20261023200000_people_rejoin_requests.check.sql
-- Rehearsal assertions for rejoin requests:
--   pnpm db:rehearse supabase/migrations/20261023200000_people_rejoin_requests.sql \
--     --check supabase/tests/20261023200000_people_rejoin_requests.check.sql --role-probe
--
-- O = owner, R = removed by the owner, L = left on their own, S = a stranger.
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

INSERT INTO auth.users (id, email) VALUES
	('e3000000-0000-4000-8000-000000000001', 'rejoin.owner@example.com'),
	('e3000000-0000-4000-8000-000000000004', 'rejoin.removed@example.com'),
	('e3000000-0000-4000-8000-000000000005', 'rejoin.leaver@example.com'),
	('e3000000-0000-4000-8000-000000000006', 'rejoin.stranger@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e3000000-0000-4000-8000-000000000001', 'rejoin.owner@example.com', 'Rejoin Owner', 'rejoinowner'),
	('e3000000-0000-4000-8000-000000000004', 'rejoin.removed@example.com', 'Rejoin Removed', NULL),
	('e3000000-0000-4000-8000-000000000005', 'rejoin.leaver@example.com', 'Rejoin Leaver', NULL),
	('e3000000-0000-4000-8000-000000000006', 'rejoin.stranger@example.com', 'Rejoin Stranger', NULL)
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('e3000000-0000-4000-8000-000000000011', 'human', 'Rejoin Owner', 'rejoin.owner@example.com', 'e3000000-0000-4000-8000-000000000001'),
	('e3000000-0000-4000-8000-000000000014', 'human', 'Rejoin Removed', 'rejoin.removed@example.com', 'e3000000-0000-4000-8000-000000000004'),
	('e3000000-0000-4000-8000-000000000015', 'human', 'Rejoin Leaver', 'rejoin.leaver@example.com', 'e3000000-0000-4000-8000-000000000005')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e3000000-0000-4000-8000-000000000021', 'Rejoin project', 'project.default', 'e3000000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, removed_at, removed_by_actor_id) VALUES
	('e3000000-0000-4000-8000-000000000021', 'e3000000-0000-4000-8000-000000000011', 'owner', 'admin', NULL, NULL),
	('e3000000-0000-4000-8000-000000000021', 'e3000000-0000-4000-8000-000000000014', 'viewer', 'read', now() - interval '1 day', 'e3000000-0000-4000-8000-000000000011'),
	('e3000000-0000-4000-8000-000000000021', 'e3000000-0000-4000-8000-000000000015', 'viewer', 'read', now() - interval '1 day', 'e3000000-0000-4000-8000-000000000015')
	ON CONFLICT DO NOTHING;

-- The owner makes a link (Viewer, agents Read).
SELECT pg_temp.act_as('e3000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT public.create_project_invite_link(
	'e3000000-0000-4000-8000-000000000021', 'e3000000-0000-4000-8000-0000000000a1', repeat('a', 64));
RESET ROLE;

-- 0. The helper is server-only; the table still rejects a rejoin without a project.
SELECT pg_temp.assert_true(
	NOT has_function_privilege('authenticated', 'public.people_rejoin_state(uuid, uuid)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.people_rejoin_state(uuid, uuid)', 'EXECUTE'),
	'people_rejoin_state is server-only'
);
DO $$
BEGIN
	INSERT INTO public.people_requests (from_user_id, to_user_id, kind)
	VALUES ('e3000000-0000-4000-8000-000000000006', 'e3000000-0000-4000-8000-000000000001', 'rejoin');
	RAISE EXCEPTION 'assertion_failed: a rejoin request without a project was stored';
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- 1. A former member sees they would be asking, before they click.
SELECT pg_temp.act_as('e3000000-0000-4000-8000-000000000004', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('a', 64))->>'rejoin' = 'ask',
	'the preview tells a removed member they would ask to rejoin'
);

-- 2. Removed by the owner: opening the link asks the owner, it does not add them.
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('a', 64))->>'status' = 'rejoin_requested',
	'a removed member who uses the link sends a rejoin request'
);
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('a', 64))->>'status' = 'rejoin_pending',
	'asking again while one is waiting says it is waiting'
);
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('a', 64))->>'rejoin' = 'pending',
	'the preview shows the request is waiting'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT removed_at IS NOT NULL FROM public.onto_project_members
	 WHERE actor_id = 'e3000000-0000-4000-8000-000000000014'
		AND project_id = 'e3000000-0000-4000-8000-000000000021'),
	'the removed member is still out until the owner decides'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.people_requests
	 WHERE kind = 'rejoin' AND status = 'pending'
		AND from_user_id = 'e3000000-0000-4000-8000-000000000004'
		AND to_user_id = 'e3000000-0000-4000-8000-000000000001'
		AND project_id = 'e3000000-0000-4000-8000-000000000021'
		AND role_requested = 'viewer' AND agent_access_requested = 'read') = 1,
	'exactly one rejoin request, carrying the link''s role and agents'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.user_notifications
	 WHERE user_id = 'e3000000-0000-4000-8000-000000000001'
		AND event_type = 'people.request.received'
		AND title = 'Rejoin Removed wants to rejoin Rejoin project') = 1,
	'the owner is pinged once'
);

-- 3. Left on their own: also asks.
SELECT pg_temp.act_as('e3000000-0000-4000-8000-000000000005', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('a', 64))->>'status' = 'rejoin_requested',
	'someone who left on their own also asks to rejoin'
);
RESET ROLE;

-- 4. The owner's inbox says which project each rejoin is about.
SELECT pg_temp.act_as('e3000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM jsonb_array_elements(public.list_people_requests()->'incoming') AS r
	 WHERE r->>'kind' = 'rejoin' AND r->'project'->>'name' = 'Rejoin project'
		AND r->>'agent_access_requested' = 'read') = 2,
	'both rejoin requests show the project in the owner''s inbox'
);

-- 5. Deny is final for that project. Approve lets them back in.
SELECT public.decide_people_request(
	(SELECT id FROM public.people_requests
	 WHERE kind = 'rejoin' AND from_user_id = 'e3000000-0000-4000-8000-000000000004' AND status = 'pending'),
	'decline'
);
SELECT public.decide_people_request(
	(SELECT id FROM public.people_requests
	 WHERE kind = 'rejoin' AND from_user_id = 'e3000000-0000-4000-8000-000000000005' AND status = 'pending'),
	'approve',
	jsonb_build_array(jsonb_build_object(
		'project_id', 'e3000000-0000-4000-8000-000000000021', 'role', 'viewer', 'agent_access', 'read'))
);
RESET ROLE;

SELECT pg_temp.act_as('e3000000-0000-4000-8000-000000000004', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('a', 64))->>'status' = 'rejoin_denied',
	'after a deny, the link says they can''t rejoin'
);
SELECT pg_temp.assert_true(
	public.get_project_invite_link_preview(repeat('a', 64))->>'rejoin' = 'denied',
	'the preview shows the deny'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.people_requests
	 WHERE from_user_id = 'e3000000-0000-4000-8000-000000000004' AND kind = 'rejoin') = 1,
	'a denied person can''t send another rejoin request'
);
SELECT pg_temp.assert_true(
	(SELECT removed_at IS NULL AND agent_access = 'read' FROM public.onto_project_members
	 WHERE actor_id = 'e3000000-0000-4000-8000-000000000015'
		AND project_id = 'e3000000-0000-4000-8000-000000000021'),
	'an approved rejoin puts them back with the chosen agents setting'
);

-- 6. Someone new still joins directly.
SELECT pg_temp.act_as('e3000000-0000-4000-8000-000000000006', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.accept_project_invite_link(repeat('a', 64))->>'status' = 'joined',
	'a first-time visitor joins with the link as before'
);
SELECT pg_temp.assert_true(
	NOT (public.get_project_invite_link_preview(repeat('a', 64)) ? 'rejoin'),
	'a current member gets no rejoin hint'
);
RESET ROLE;

ROLLBACK;
