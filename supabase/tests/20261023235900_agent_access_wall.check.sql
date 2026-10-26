-- supabase/tests/20261023235900_agent_access_wall.check.sql
-- Rehearsal assertions for upgrade requests, standing approval, and the shared-projects toggle:
--   pnpm db:rehearse supabase/migrations/20261023235900_agent_access_wall.sql \
--     --check supabase/tests/20261023235900_agent_access_wall.check.sql --role-probe
--
-- O = owner of P1, P2 (and Q, owned by someone else: Z). V = viewer in P1, editor in P2.
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
	('e4000000-0000-4000-8000-000000000001', 'wall.owner@example.com'),
	('e4000000-0000-4000-8000-000000000002', 'wall.member@example.com'),
	('e4000000-0000-4000-8000-000000000003', 'wall.other@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e4000000-0000-4000-8000-000000000001', 'wall.owner@example.com', 'Wall Owner', 'wallowner'),
	('e4000000-0000-4000-8000-000000000002', 'wall.member@example.com', 'Wall Member', 'wallmember'),
	('e4000000-0000-4000-8000-000000000003', 'wall.other@example.com', 'Wall Other', NULL)
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('e4000000-0000-4000-8000-000000000011', 'human', 'Wall Owner', 'wall.owner@example.com', 'e4000000-0000-4000-8000-000000000001'),
	('e4000000-0000-4000-8000-000000000012', 'human', 'Wall Member', 'wall.member@example.com', 'e4000000-0000-4000-8000-000000000002'),
	('e4000000-0000-4000-8000-000000000013', 'human', 'Wall Other', 'wall.other@example.com', 'e4000000-0000-4000-8000-000000000003')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e4000000-0000-4000-8000-000000000021', 'Wall P1', 'project.default', 'e4000000-0000-4000-8000-000000000011', 'active'),
	('e4000000-0000-4000-8000-000000000022', 'Wall P2', 'project.default', 'e4000000-0000-4000-8000-000000000011', 'active'),
	('e4000000-0000-4000-8000-000000000023', 'Wall Q', 'project.default', 'e4000000-0000-4000-8000-000000000013', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, agent_access) VALUES
	('e4000000-0000-4000-8000-000000000021', 'e4000000-0000-4000-8000-000000000011', 'owner', 'admin', 'write'),
	('e4000000-0000-4000-8000-000000000022', 'e4000000-0000-4000-8000-000000000011', 'owner', 'admin', 'write'),
	('e4000000-0000-4000-8000-000000000023', 'e4000000-0000-4000-8000-000000000013', 'owner', 'admin', 'write'),
	('e4000000-0000-4000-8000-000000000021', 'e4000000-0000-4000-8000-000000000012', 'viewer', 'read', 'off'),
	('e4000000-0000-4000-8000-000000000022', 'e4000000-0000-4000-8000-000000000012', 'editor', 'write', 'read'),
	('e4000000-0000-4000-8000-000000000023', 'e4000000-0000-4000-8000-000000000012', 'editor', 'write', 'read')
	ON CONFLICT DO NOTHING;
INSERT INTO public.external_agent_callers (id, user_id, provider, caller_key, token_prefix, token_hash, status)
	VALUES ('e4000000-0000-4000-8000-000000000031', 'e4000000-0000-4000-8000-000000000002',
		'claude', 'claude:wall-member', 'boca_wall', repeat('c', 64), 'trusted')
	ON CONFLICT DO NOTHING;

-- 0. Shape: helpers are server-only, the toggle defaults off, the kind check holds.
SELECT pg_temp.assert_true(
	NOT has_function_privilege('authenticated', 'public.people_layer_effective_agent_access(uuid, uuid)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.people_layer_display_name(uuid)', 'EXECUTE'),
	'helpers are server-only'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege('anon', 'public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid, uuid)', 'EXECUTE')
		AND NOT has_function_privilege('service_role', 'public.set_project_editor_agents_write(uuid, boolean)', 'EXECUTE'),
	'request RPC is not anon; standing approval is signed-in owners only'
);
SELECT pg_temp.assert_true(
	(SELECT include_shared_projects = false FROM public.external_agent_callers
		WHERE id = 'e4000000-0000-4000-8000-000000000031'),
	'shared projects stay out of a connection by default'
);
DO $$
BEGIN
	INSERT INTO public.people_requests (from_user_id, to_user_id, kind, project_id)
	VALUES ('e4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000001',
		'upgrade', 'e4000000-0000-4000-8000-000000000021');
	RAISE EXCEPTION 'assertion_failed: an upgrade without requested items was stored';
EXCEPTION WHEN check_violation THEN
	NULL;
END;
$$;

-- 1. Effective agent access: off stays off; standing approval lifts editors only.
SELECT pg_temp.assert_true(
	public.people_layer_effective_agent_access('e4000000-0000-4000-8000-000000000021', 'e4000000-0000-4000-8000-000000000012') = 'off'
		AND public.people_layer_effective_agent_access('e4000000-0000-4000-8000-000000000022', 'e4000000-0000-4000-8000-000000000012') = 'read'
		AND public.people_layer_effective_agent_access('e4000000-0000-4000-8000-000000000022', 'e4000000-0000-4000-8000-000000000013') IS NULL,
	'effective access before any setting'
);

-- 2. An editor can't flip the owner's setting, directly or through the RPC.
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	INSERT INTO public.project_agent_settings (project_id, editor_agents_write)
	VALUES ('e4000000-0000-4000-8000-000000000022', true);
	RAISE EXCEPTION 'assertion_failed: an editor wrote project_agent_settings directly';
EXCEPTION WHEN insufficient_privilege THEN
	NULL;
END;
$$;
DO $$
BEGIN
	PERFORM public.set_project_editor_agents_write('e4000000-0000-4000-8000-000000000022', true);
	RAISE EXCEPTION 'assertion_failed: an editor turned on standing approval';
EXCEPTION WHEN insufficient_privilege THEN
	NULL;
END;
$$;
RESET ROLE;

-- 3. The member (on the web) asks to edit P1 and for agents to write in P2: one request,
--    viewer becomes an "edit" ask, editor an "agents_write" ask.
CREATE TEMP TABLE wall_result (r jsonb) ON COMMIT DROP;
GRANT ALL ON wall_result TO authenticated;
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
INSERT INTO wall_result
SELECT public.create_project_upgrade_request(
	ARRAY['e4000000-0000-4000-8000-000000000021', 'e4000000-0000-4000-8000-000000000022']::uuid[],
	'agents_write', 'Need my agent to update tasks');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT r->>'status' = 'pending' AND r ? 'request_id' FROM wall_result), 'request sent');
SELECT pg_temp.assert_true(
	(SELECT kind = 'upgrade'
		AND project_id IS NOT NULL
		AND jsonb_array_length(requested_items) = 2
		AND requested_items @> '[{"project_id":"e4000000-0000-4000-8000-000000000021","need":"edit"}]'
		AND requested_items @> '[{"project_id":"e4000000-0000-4000-8000-000000000022","need":"agents_write"}]'
		AND role_requested = 'editor'
		AND agent_access_requested = 'write'
		AND via = 'web'
	FROM public.people_requests WHERE id = (SELECT (r->>'request_id')::uuid FROM wall_result)),
	'needs normalized per project'
);
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM public.user_notifications
		WHERE user_id = 'e4000000-0000-4000-8000-000000000001'
			AND event_type = 'people.request.received'
			AND data->>'kind' = 'upgrade'),
	'owner notified in app'
);

-- 4. Asking again (as the agent, via the gateway) merges into the waiting request.
SELECT pg_temp.act_as(NULL, 'service_role');
SELECT pg_temp.assert_true(
	(SELECT r->>'status' = 'pending' AND (r->>'already_pending')::boolean AND (r->>'merged')::boolean
	FROM (SELECT public.create_project_upgrade_request(
		ARRAY['e4000000-0000-4000-8000-000000000022']::uuid[], 'agents_write', NULL,
		'e4000000-0000-4000-8000-000000000031', NULL, 'Claude',
		'e4000000-0000-4000-8000-000000000002') AS r) AS x),
	'an agent ask adds its connection to the waiting web request'
);
SELECT pg_temp.assert_true(
 (SELECT requested_items @> '[{"project_id":"e4000000-0000-4000-8000-000000000022","caller_ids":["e4000000-0000-4000-8000-000000000031"]}]'::jsonb
  FROM public.people_requests WHERE id = (SELECT (r->>'request_id')::uuid FROM wall_result)),
 'the owner can see which connection needs access');
-- Projects of a different owner can't ride along; non-members get not_found.
SELECT pg_temp.assert_true(
	(SELECT public.create_project_upgrade_request(
		ARRAY['e4000000-0000-4000-8000-000000000022', 'e4000000-0000-4000-8000-000000000023']::uuid[],
		'agents_write', NULL, NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000002')->>'status') = 'mixed_owners',
	'one owner per request'
);
SELECT pg_temp.assert_true(
	(SELECT public.create_project_upgrade_request(
		ARRAY['e4000000-0000-4000-8000-000000000021']::uuid[],
		'agents_read', NULL, NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000003')->>'status') = 'not_found',
	'a non-member cannot ask'
);
-- Only the gateway may claim an agent sent it.
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.create_project_upgrade_request(
		ARRAY['e4000000-0000-4000-8000-000000000022']::uuid[], 'agents_write', NULL,
		'e4000000-0000-4000-8000-000000000031', NULL, 'Claude', NULL);
	RAISE EXCEPTION 'assertion_failed: a signed-in user posed as their agent';
EXCEPTION WHEN insufficient_privilege THEN
	NULL;
END;
$$;
-- The member sees the items in their outbox; the owner sees names and where they stand.
SELECT pg_temp.assert_true(
	(SELECT jsonb_array_length(public.list_people_requests()->'outgoing'->0->'items') = 2),
	'outbox lists the asked-for projects'
);
RESET ROLE;
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT item->>'project_name' = 'Wall P1' AND item->>'role' = 'viewer' AND item->>'agent_access' = 'off'
	FROM jsonb_array_elements(public.list_people_requests()->'incoming'->0->'items') AS item
	WHERE item->>'need' = 'edit'),
	'inbox shows each project and where the person stands'
);

-- 5. The owner allows only P2: the member's agents can write there; P1 is untouched.
SELECT pg_temp.assert_true(
	(SELECT public.decide_people_request(
		(SELECT (r->>'request_id')::uuid FROM wall_result), 'approve',
		'[{"project_id":"e4000000-0000-4000-8000-000000000021","need":"edit","allow":false},{"project_id":"e4000000-0000-4000-8000-000000000022","need":"agents_write","allow":true}]'::jsonb)->>'kind') = 'upgrade',
	'owner approves the upgrade'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT agent_access = 'write' AND role_key = 'editor' FROM public.onto_project_members
		WHERE project_id = 'e4000000-0000-4000-8000-000000000022' AND actor_id = 'e4000000-0000-4000-8000-000000000012')
	AND (SELECT agent_access = 'off' AND role_key = 'viewer' FROM public.onto_project_members
		WHERE project_id = 'e4000000-0000-4000-8000-000000000021' AND actor_id = 'e4000000-0000-4000-8000-000000000012'),
	'only the kept project changed'
);
SELECT pg_temp.assert_true(
	EXISTS (SELECT 1 FROM public.user_notifications
		WHERE user_id = 'e4000000-0000-4000-8000-000000000002'
			AND event_type = 'people.request.approved'
			AND title LIKE 'Wall Owner let your agents make changes in Wall P2'),
	'member hears the answer'
);

-- 6. A new ask now covers only P1 (P2 is allowed); "not now" holds for 7 days.
SELECT pg_temp.act_as(NULL, 'service_role');
CREATE TEMP TABLE wall_second ON COMMIT DROP AS
SELECT public.create_project_upgrade_request(
	ARRAY['e4000000-0000-4000-8000-000000000021', 'e4000000-0000-4000-8000-000000000022']::uuid[],
	'agents_read', NULL, NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000002') AS r;
GRANT ALL ON wall_second TO authenticated;
SELECT pg_temp.assert_true(
	(SELECT jsonb_array_length(requested_items) = 1
		AND requested_items->0->>'project_id' = 'e4000000-0000-4000-8000-000000000021'
		AND requested_items->0->>'need' = 'agents_read'
	FROM public.people_requests WHERE id = (SELECT (r->>'request_id')::uuid FROM wall_second)),
	'already-allowed projects drop out of a new ask'
);
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT public.decide_people_request((SELECT (r->>'request_id')::uuid FROM wall_second), 'decline', '[{"project_id":"e4000000-0000-4000-8000-000000000021","need":"agents_read","allow":false}]'::jsonb);
RESET ROLE;
SELECT pg_temp.act_as(NULL, 'service_role');
SELECT pg_temp.assert_true(
	(SELECT public.create_project_upgrade_request(
		ARRAY['e4000000-0000-4000-8000-000000000021']::uuid[],
		'agents_read', NULL, NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000002')->>'status') = 'declined_recently',
	'not now holds for a week'
);
SELECT pg_temp.assert_true(
	(SELECT public.create_project_upgrade_request(
		ARRAY['e4000000-0000-4000-8000-000000000022']::uuid[],
		'agents_write', NULL, NULL, NULL, NULL, 'e4000000-0000-4000-8000-000000000002')->>'status') = 'already_allowed',
	'nothing to ask once allowed'
);

-- 7. Standing approval: the owner turns it on; an editor set to Read now writes, Off stays off.
UPDATE public.onto_project_members SET agent_access = 'read'
WHERE project_id = 'e4000000-0000-4000-8000-000000000022' AND actor_id = 'e4000000-0000-4000-8000-000000000012';
SELECT pg_temp.act_as('e4000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT public.set_project_editor_agents_write('e4000000-0000-4000-8000-000000000022', true);
SELECT pg_temp.assert_true(
	(SELECT editor_agents_write FROM public.project_agent_settings
		WHERE project_id = 'e4000000-0000-4000-8000-000000000022'),
	'members can read the setting'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	public.people_layer_effective_agent_access('e4000000-0000-4000-8000-000000000022', 'e4000000-0000-4000-8000-000000000012') = 'write',
	'standing approval lifts an editor on Read'
);
UPDATE public.onto_project_members SET agent_access = 'off'
WHERE project_id = 'e4000000-0000-4000-8000-000000000022' AND actor_id = 'e4000000-0000-4000-8000-000000000012';
SELECT pg_temp.assert_true(
	public.people_layer_effective_agent_access('e4000000-0000-4000-8000-000000000022', 'e4000000-0000-4000-8000-000000000012') = 'off',
	'the owner turning someone off still wins'
);

ROLLBACK;
