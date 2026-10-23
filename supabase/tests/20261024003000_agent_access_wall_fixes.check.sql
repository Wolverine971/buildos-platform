-- supabase/tests/20261024003000_agent_access_wall_fixes.check.sql
-- Rehearsal assertions for the upgrade-request review fixes:
--   pnpm db:rehearse supabase/migrations/20261024003000_agent_access_wall_fixes.sql \
--     --check supabase/tests/20261024003000_agent_access_wall_fixes.check.sql --role-probe
--
-- O owns P1, P2, P3. M is an editor in P1 and P2 (agents Read) and a viewer in P3
-- (agents Off). A and B are M's connections; X is O's.
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
	('e5000000-0000-4000-8000-000000000001', 'fix.owner@example.com'),
	('e5000000-0000-4000-8000-000000000002', 'fix.member@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e5000000-0000-4000-8000-000000000001', 'fix.owner@example.com', 'Fix Owner', 'fixowner'),
	('e5000000-0000-4000-8000-000000000002', 'fix.member@example.com', 'Fix Member', 'fixmember')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('e5000000-0000-4000-8000-000000000011', 'human', 'Fix Owner', 'fix.owner@example.com', 'e5000000-0000-4000-8000-000000000001'),
	('e5000000-0000-4000-8000-000000000012', 'human', 'Fix Member', 'fix.member@example.com', 'e5000000-0000-4000-8000-000000000002')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e5000000-0000-4000-8000-000000000021', 'Fix P1', 'project.default', 'e5000000-0000-4000-8000-000000000011', 'active'),
	('e5000000-0000-4000-8000-000000000022', 'Fix P2', 'project.default', 'e5000000-0000-4000-8000-000000000011', 'active'),
	('e5000000-0000-4000-8000-000000000023', 'Fix P3', 'project.default', 'e5000000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, agent_access) VALUES
	('e5000000-0000-4000-8000-000000000021', 'e5000000-0000-4000-8000-000000000011', 'owner', 'admin', 'write'),
	('e5000000-0000-4000-8000-000000000022', 'e5000000-0000-4000-8000-000000000011', 'owner', 'admin', 'write'),
	('e5000000-0000-4000-8000-000000000023', 'e5000000-0000-4000-8000-000000000011', 'owner', 'admin', 'write'),
	('e5000000-0000-4000-8000-000000000021', 'e5000000-0000-4000-8000-000000000012', 'editor', 'write', 'read'),
	('e5000000-0000-4000-8000-000000000022', 'e5000000-0000-4000-8000-000000000012', 'editor', 'write', 'read'),
	('e5000000-0000-4000-8000-000000000023', 'e5000000-0000-4000-8000-000000000012', 'viewer', 'read', 'off')
	ON CONFLICT DO NOTHING;
INSERT INTO public.external_agent_callers (id, user_id, provider, caller_key, token_prefix, token_hash, status) VALUES
	('e5000000-0000-4000-8000-000000000031', 'e5000000-0000-4000-8000-000000000002',
		'claude', 'claude:fix-a', 'boca_fixa', repeat('a', 64), 'trusted'),
	('e5000000-0000-4000-8000-000000000032', 'e5000000-0000-4000-8000-000000000002',
		'chatgpt', 'chatgpt:fix-b', 'boca_fixb', repeat('b', 64), 'trusted'),
	('e5000000-0000-4000-8000-000000000033', 'e5000000-0000-4000-8000-000000000001',
		'claude', 'claude:fix-x', 'boca_fixx', repeat('d', 64), 'trusted')
	ON CONFLICT DO NOTHING;

CREATE TEMP TABLE fix_state (key text PRIMARY KEY, value jsonb) ON COMMIT DROP;
GRANT ALL ON fix_state TO authenticated;

-- 0. Shape: one request function (the old signature is gone), not anon.
SELECT pg_temp.assert_true(
	to_regprocedure('public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid)') IS NULL
		AND to_regprocedure('public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid, uuid)') IS NOT NULL,
	'old request signature dropped'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege('anon', 'public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid, uuid)', 'EXECUTE')
		AND has_function_privilege('authenticated', 'public.create_project_upgrade_request(uuid[], text, text, uuid, uuid, text, uuid, uuid)', 'EXECUTE')
		AND NOT has_function_privilege('service_role', 'public.decide_people_request(uuid, text, jsonb)', 'EXECUTE'),
	'grants kept'
);

-- 1. Connection A asks for its agents to see P3. The item remembers A.
SELECT pg_temp.act_as(NULL, 'service_role');
INSERT INTO fix_state
SELECT 'first', public.create_project_upgrade_request(
	p_project_ids => ARRAY['e5000000-0000-4000-8000-000000000023']::uuid[],
	p_need => 'agents_read',
	p_caller_id => 'e5000000-0000-4000-8000-000000000031',
	p_agent_label => 'Claude',
	p_user_id => 'e5000000-0000-4000-8000-000000000002');
INSERT INTO fix_state
SELECT 'request_id', to_jsonb((SELECT value->>'request_id' FROM fix_state WHERE key = 'first'));
SELECT pg_temp.assert_true(
	(SELECT requested_items = jsonb_build_array(jsonb_build_object(
		'project_id', 'e5000000-0000-4000-8000-000000000023',
		'need', 'agents_read',
		'caller_ids', jsonb_build_array('e5000000-0000-4000-8000-000000000031')))
	FROM public.people_requests WHERE id = (SELECT (value#>>'{}')::uuid FROM fix_state WHERE key = 'request_id')),
	'the item names the connection that asked'
);

-- The owner opens the card now and sees "agents can read P3".
INSERT INTO fix_state
SELECT 'seen', jsonb_agg(jsonb_build_object('project_id', i->>'project_id', 'need', i->>'need', 'allow', true))
FROM public.people_requests AS r, jsonb_array_elements(r.requested_items) AS i
WHERE r.id = (SELECT (value#>>'{}')::uuid FROM fix_state WHERE key = 'request_id');

-- 2. Connection B then asks to edit P3 and for agents to write in P1. Both merge in.
SELECT pg_temp.assert_true(
	(SELECT (public.create_project_upgrade_request(
		p_project_ids => ARRAY['e5000000-0000-4000-8000-000000000023', 'e5000000-0000-4000-8000-000000000021']::uuid[],
		p_need => 'agents_write',
		p_caller_id => 'e5000000-0000-4000-8000-000000000032',
		p_agent_label => 'ChatGPT',
		p_user_id => 'e5000000-0000-4000-8000-000000000002')->>'merged')::boolean),
	'second ask merged'
);
SELECT pg_temp.assert_true(
	(SELECT
		jsonb_array_length(requested_items) = 2
		AND requested_items->0->>'need' = 'edit'
		AND (requested_items->0->'caller_ids') @> '["e5000000-0000-4000-8000-000000000031", "e5000000-0000-4000-8000-000000000032"]'::jsonb
		AND jsonb_array_length(requested_items->0->'caller_ids') = 2
		AND requested_items->1->>'project_id' = 'e5000000-0000-4000-8000-000000000021'
		AND requested_items->1->>'need' = 'agents_write'
		AND requested_items->1->'caller_ids' = '["e5000000-0000-4000-8000-000000000032"]'::jsonb
		AND via_caller_id = 'e5000000-0000-4000-8000-000000000031'
	FROM public.people_requests WHERE id = (SELECT (value#>>'{}')::uuid FROM fix_state WHERE key = 'request_id')),
	'merge keeps each project''s own connections and the stronger need'
);

-- 3. Finding 1: approving what the owner saw earlier ("read") is refused, nothing changes.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.decide_people_request(
		(SELECT (value#>>'{}')::uuid FROM fix_state WHERE key = 'request_id'),
		'approve',
		(SELECT value FROM fix_state WHERE key = 'seen'));
	RAISE EXCEPTION 'assertion_failed: a stale approval went through';
EXCEPTION WHEN SQLSTATE 'PT409' THEN
	NULL;
END;
$$;
DO $$
BEGIN
	PERFORM public.decide_people_request(
		(SELECT (value#>>'{}')::uuid FROM fix_state WHERE key = 'request_id'), 'approve', '[]'::jsonb);
	RAISE EXCEPTION 'assertion_failed: an upgrade approval without the items seen went through';
EXCEPTION WHEN SQLSTATE 'PT409' THEN
	NULL;
END;
$$;
DO $$
BEGIN
	PERFORM public.decide_people_request(
		(SELECT (value#>>'{}')::uuid FROM fix_state WHERE key = 'request_id'), 'approve',
		jsonb_build_array(
			jsonb_build_object('project_id', 'e5000000-0000-4000-8000-000000000023', 'need', 'edit', 'allow', false),
			jsonb_build_object('project_id', 'e5000000-0000-4000-8000-000000000021', 'need', 'agents_write', 'allow', false)));
	RAISE EXCEPTION 'assertion_failed: an approval with nothing allowed went through';
EXCEPTION WHEN SQLSTATE '22023' THEN
	NULL;
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT role_key = 'viewer' AND access = 'read' AND agent_access = 'off'
	FROM public.onto_project_members
	WHERE project_id = 'e5000000-0000-4000-8000-000000000023' AND actor_id = 'e5000000-0000-4000-8000-000000000012'),
	'a refused approval changes nothing'
);

-- 4. Finding 2: the owner approves the current card, P1 only. Only B, which asked for
--    P1, is named for it; P3 stays as it was.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
INSERT INTO fix_state
SELECT 'approved', public.decide_people_request(
	(SELECT (value#>>'{}')::uuid FROM fix_state WHERE key = 'request_id'), 'approve',
	jsonb_build_array(
		jsonb_build_object('project_id', 'e5000000-0000-4000-8000-000000000023', 'need', 'edit', 'allow', false),
		jsonb_build_object('project_id', 'E5000000-0000-4000-8000-000000000021', 'need', 'agents_write')));
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT value->>'status' = 'approved'
		AND NOT (value ? 'via_caller_id')
		AND jsonb_array_length(value->'projects') = 1
		AND value->'projects'->0->>'project_id' = 'e5000000-0000-4000-8000-000000000021'
		AND value->'projects'->0->'caller_ids' = '["e5000000-0000-4000-8000-000000000032"]'::jsonb
	FROM fix_state WHERE key = 'approved'),
	'approval names only the connection that asked for each project'
);
SELECT pg_temp.assert_true(
	(SELECT agent_access = 'write' FROM public.onto_project_members
		WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND actor_id = 'e5000000-0000-4000-8000-000000000012')
	AND (SELECT role_key = 'viewer' AND agent_access = 'off' FROM public.onto_project_members
		WHERE project_id = 'e5000000-0000-4000-8000-000000000023' AND actor_id = 'e5000000-0000-4000-8000-000000000012'),
	'only the allowed project changed'
);

-- 5. Finding 5: on the web the person names their own connection; it rides on the item.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
INSERT INTO fix_state
SELECT 'web', public.create_project_upgrade_request(
	p_project_ids => ARRAY['e5000000-0000-4000-8000-000000000022']::uuid[],
	p_need => 'agents_write',
	p_for_caller_id => 'e5000000-0000-4000-8000-000000000031');
DO $$
BEGIN
	PERFORM public.create_project_upgrade_request(
		p_project_ids => ARRAY['e5000000-0000-4000-8000-000000000022']::uuid[],
		p_need => 'agents_write',
		p_for_caller_id => 'e5000000-0000-4000-8000-000000000033');
	RAISE EXCEPTION 'assertion_failed: someone else''s connection was named';
EXCEPTION WHEN insufficient_privilege THEN
	NULL;
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT r.via = 'web' AND r.via_caller_id IS NULL
		AND r.requested_items->0->'caller_ids' = '["e5000000-0000-4000-8000-000000000031"]'::jsonb
	FROM public.people_requests AS r
	WHERE r.id = (SELECT (value->>'request_id')::uuid FROM fix_state WHERE key = 'web')),
	'a web ask carries the connection that needs the project'
);

-- An agent can only ask for itself.
SELECT pg_temp.act_as(NULL, 'service_role');
DO $$
BEGIN
	PERFORM public.create_project_upgrade_request(
		p_project_ids => ARRAY['e5000000-0000-4000-8000-000000000022']::uuid[],
		p_need => 'agents_write',
		p_caller_id => 'e5000000-0000-4000-8000-000000000031',
		p_user_id => 'e5000000-0000-4000-8000-000000000002',
		p_for_caller_id => 'e5000000-0000-4000-8000-000000000032');
	RAISE EXCEPTION 'assertion_failed: an agent asked on behalf of another connection';
EXCEPTION WHEN insufficient_privilege THEN
	NULL;
END;
$$;

ROLLBACK;
