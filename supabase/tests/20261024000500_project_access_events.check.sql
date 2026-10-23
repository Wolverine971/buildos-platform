-- supabase/tests/20261024000500_project_access_events.check.sql
-- Rehearsal assertions for the access history log:
--   pnpm db:rehearse supabase/migrations/20261024000500_project_access_events.sql \
--     --check supabase/tests/20261024000500_project_access_events.check.sql --role-probe
--
-- O owns P and P2. V is invited to P, joins, gets changed, leaves. Z is an editor of
-- P2 and is handed P2. Nothing here touches real data.
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
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid, text) TO anon, authenticated;

CREATE FUNCTION pg_temp.events(p_project uuid, p_kind text) RETURNS bigint LANGUAGE sql AS $$
	SELECT count(*) FROM public.project_access_events WHERE project_id = p_project AND kind = p_kind
$$;

INSERT INTO auth.users (id, email) VALUES
	('e5000000-0000-4000-8000-000000000001', 'hist.owner@example.com'),
	('e5000000-0000-4000-8000-000000000002', 'hist.member@example.com'),
	('e5000000-0000-4000-8000-000000000003', 'hist.other@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e5000000-0000-4000-8000-000000000001', 'hist.owner@example.com', 'Hist Owner', 'histowner'),
	('e5000000-0000-4000-8000-000000000002', 'hist.member@example.com', 'Hist Member', NULL),
	('e5000000-0000-4000-8000-000000000003', 'hist.other@example.com', 'Hist Other', NULL)
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('e5000000-0000-4000-8000-000000000011', 'human', 'Hist Owner', 'hist.owner@example.com', 'e5000000-0000-4000-8000-000000000001'),
	('e5000000-0000-4000-8000-000000000012', 'human', 'Hist Member', 'hist.member@example.com', 'e5000000-0000-4000-8000-000000000002'),
	('e5000000-0000-4000-8000-000000000013', 'human', 'Hist Other', 'hist.other@example.com', 'e5000000-0000-4000-8000-000000000003')
	ON CONFLICT DO NOTHING;

-- 0. Shape: trigger functions and helpers are server-only; the reader is signed-in only.
SELECT pg_temp.assert_true(
	NOT has_function_privilege('authenticated', 'public.log_project_member_access_event()', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.log_project_invite_access_event()', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.project_access_events_actor_or_null(uuid)', 'EXECUTE'),
	'trigger functions and helpers are server-only'
);
SELECT pg_temp.assert_true(
	has_function_privilege('service_role', 'public.list_project_access_events(uuid, integer, timestamptz, uuid, uuid)', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.list_project_access_events(uuid, integer, timestamptz, uuid, uuid)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.list_project_access_events(uuid, integer, timestamptz, uuid, uuid)', 'EXECUTE'),
	'the reader is server-only'
);
SELECT pg_temp.assert_true(
	NOT has_table_privilege('authenticated', 'public.project_access_events', 'INSERT')
		AND NOT has_table_privilege('authenticated', 'public.project_access_events', 'UPDATE')
		AND NOT has_table_privilege('authenticated', 'public.project_access_events', 'DELETE')
		AND NOT has_table_privilege('anon', 'public.project_access_events', 'SELECT'),
	'clients can only read the log'
);

-- 1. Creating a project is not a join.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000001', 'authenticated');
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e5000000-0000-4000-8000-000000000021', 'Hist P', 'project.default', 'e5000000-0000-4000-8000-000000000011', 'active'),
	('e5000000-0000-4000-8000-000000000022', 'Hist P2', 'project.default', 'e5000000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, agent_access) VALUES
	('e5000000-0000-4000-8000-000000000021', 'e5000000-0000-4000-8000-000000000011', 'owner', 'admin', 'write'),
	('e5000000-0000-4000-8000-000000000022', 'e5000000-0000-4000-8000-000000000011', 'owner', 'admin', 'write')
	ON CONFLICT DO NOTHING;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.project_access_events
		WHERE project_id IN ('e5000000-0000-4000-8000-000000000021', 'e5000000-0000-4000-8000-000000000022')),
	'the owner row written with a new project logs nothing'
);

-- 2. O invites V; V accepts in one transaction: one join, from the invite.
INSERT INTO public.onto_project_invites (id, project_id, invitee_email, token_hash, role_key, access, expires_at, invited_by_actor_id) VALUES
	('e5000000-0000-4000-8000-000000000041', 'e5000000-0000-4000-8000-000000000021', 'hist.member@example.com', repeat('a', 64), 'editor', 'write', now() + interval '7 days', 'e5000000-0000-4000-8000-000000000011'),
	('e5000000-0000-4000-8000-000000000042', 'e5000000-0000-4000-8000-000000000021', 'withdrawn@example.com', repeat('b', 64), 'viewer', 'read', now() + interval '7 days', 'e5000000-0000-4000-8000-000000000011'),
	('e5000000-0000-4000-8000-000000000043', 'e5000000-0000-4000-8000-000000000021', 'lapsed@example.com', repeat('c', 64), 'viewer', 'read', now() - interval '1 day', 'e5000000-0000-4000-8000-000000000011');
SELECT pg_temp.assert_true(
	pg_temp.events('e5000000-0000-4000-8000-000000000021', 'invite_sent') = 3
		AND (SELECT bool_and(by_actor_id = 'e5000000-0000-4000-8000-000000000011') FROM public.project_access_events
			WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND kind = 'invite_sent'),
	'each invite sent is logged, by the owner'
);

SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000002', 'authenticated');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, agent_access, added_by_actor_id)
	VALUES ('e5000000-0000-4000-8000-000000000021', 'e5000000-0000-4000-8000-000000000012', 'editor', 'write', 'read', 'e5000000-0000-4000-8000-000000000011');
UPDATE public.onto_project_invites
	SET status = 'accepted', accepted_by_actor_id = 'e5000000-0000-4000-8000-000000000012', accepted_at = now()
	WHERE id = 'e5000000-0000-4000-8000-000000000041';
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.project_access_events
		WHERE project_id = 'e5000000-0000-4000-8000-000000000021'
			AND kind = 'member_joined'
			AND subject_actor_id = 'e5000000-0000-4000-8000-000000000012'
			AND by_actor_id = 'e5000000-0000-4000-8000-000000000012'
			AND via = 'invite'
			AND invite_id = 'e5000000-0000-4000-8000-000000000041'
			AND after->>'role_key' = 'editor')
		AND pg_temp.events('e5000000-0000-4000-8000-000000000021', 'invite_accepted') = 0,
	'accepting an invite is one join, marked as from that invite'
);

-- 3. O changes V's agents and role, withdraws an invite, turns on restricted and
--    the standing approval.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000001', 'authenticated');
UPDATE public.onto_project_members SET agent_access = 'write'
	WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND actor_id = 'e5000000-0000-4000-8000-000000000012';
UPDATE public.onto_project_members SET role_key = 'viewer', access = 'read', agent_access = 'read'
	WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND actor_id = 'e5000000-0000-4000-8000-000000000012';
UPDATE public.onto_project_invites SET status = 'revoked' WHERE id = 'e5000000-0000-4000-8000-000000000042';
UPDATE public.onto_projects SET external_agent_access = 'restricted' WHERE id = 'e5000000-0000-4000-8000-000000000021';
INSERT INTO public.project_agent_settings (project_id, editor_agents_write) VALUES ('e5000000-0000-4000-8000-000000000021', true);
UPDATE public.onto_projects SET name = 'Hist P renamed' WHERE id = 'e5000000-0000-4000-8000-000000000021';

SELECT pg_temp.assert_true(
	pg_temp.events('e5000000-0000-4000-8000-000000000021', 'agents_changed') = 2
		AND (SELECT count(*) = 1 FROM public.project_access_events
			WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND kind = 'agents_changed'
				AND before->>'agent_access' = 'read' AND after->>'agent_access' = 'write'
				AND by_actor_id = 'e5000000-0000-4000-8000-000000000011'),
	'agent dial changes are logged with before and after'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.project_access_events
		WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND kind = 'role_changed'
			AND before->>'role_key' = 'editor' AND after->>'role_key' = 'viewer'),
	'role change logged once'
);
SELECT pg_temp.assert_true(
	pg_temp.events('e5000000-0000-4000-8000-000000000021', 'invite_revoked') = 1
		AND (SELECT count(*) = 1 FROM public.project_access_events
			WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND kind = 'restricted_changed'
				AND (after->>'restricted')::boolean)
		AND (SELECT count(*) = 1 FROM public.project_access_events
			WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND kind = 'editors_agents_write_changed'
				AND (after->>'on')::boolean),
	'withdrawn invite, restricted and standing approval each logged once; a rename logs nothing'
);

-- 4. Logging can never break the write it describes.
ALTER TABLE public.project_access_events ADD CONSTRAINT pg_temp_block_all CHECK (false) NOT VALID;
UPDATE public.onto_project_members SET agent_access = 'off'
	WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND actor_id = 'e5000000-0000-4000-8000-000000000012';
SELECT pg_temp.assert_true(
	(SELECT agent_access = 'off' FROM public.onto_project_members
		WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND actor_id = 'e5000000-0000-4000-8000-000000000012'),
	'the member update went through while the log refused the row'
);
ALTER TABLE public.project_access_events DROP CONSTRAINT pg_temp_block_all;

-- 5. V leaves.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000002', 'authenticated');
UPDATE public.onto_project_members
	SET removed_at = now(), removed_by_actor_id = 'e5000000-0000-4000-8000-000000000012'
	WHERE project_id = 'e5000000-0000-4000-8000-000000000021' AND actor_id = 'e5000000-0000-4000-8000-000000000012';
SELECT pg_temp.assert_true(
	pg_temp.events('e5000000-0000-4000-8000-000000000021', 'member_left') = 1
		AND pg_temp.events('e5000000-0000-4000-8000-000000000021', 'member_removed') = 0,
	'leaving is member_left, not a removal'
);

-- 6. Handoff: O hands P2 to Z. One ownership event, no role noise.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000001', 'authenticated');
INSERT INTO public.onto_project_members (id, project_id, actor_id, role_key, access, agent_access, added_by_actor_id)
	VALUES ('e5000000-0000-4000-8000-000000000051', 'e5000000-0000-4000-8000-000000000022', 'e5000000-0000-4000-8000-000000000013', 'editor', 'write', 'read', 'e5000000-0000-4000-8000-000000000011');
SET LOCAL ROLE authenticated;
SELECT public.transfer_onto_project_ownership('e5000000-0000-4000-8000-000000000022', 'e5000000-0000-4000-8000-000000000051', false);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.project_access_events
		WHERE project_id = 'e5000000-0000-4000-8000-000000000022' AND kind = 'ownership_transferred'
			AND by_actor_id = 'e5000000-0000-4000-8000-000000000011'
			AND subject_actor_id = 'e5000000-0000-4000-8000-000000000013')
		AND pg_temp.events('e5000000-0000-4000-8000-000000000022', 'role_changed') = 0,
	'a handoff is one ownership event'
);

-- 7. Reading: only the owner, names resolved, lapsed invite shown as expired, paging.
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.project_access_events
		WHERE project_id = 'e5000000-0000-4000-8000-000000000021'),
	'a former member reads nothing directly'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(
	jsonb_array_length(public.list_project_access_events('e5000000-0000-4000-8000-000000000002', 50, NULL, NULL, 'e5000000-0000-4000-8000-000000000021')->'events') = 0,
	'a non-owner gets an empty history'
);
RESET ROLE;

CREATE TEMP TABLE hist_result (r jsonb) ON COMMIT DROP;
GRANT ALL ON hist_result TO authenticated, service_role;
SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) > 0 FROM public.project_access_events
		WHERE project_id = 'e5000000-0000-4000-8000-000000000021'),
	'the owner reads the log directly'
);
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO hist_result SELECT public.list_project_access_events('e5000000-0000-4000-8000-000000000001', 50, NULL, NULL, 'e5000000-0000-4000-8000-000000000021');
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM hist_result, jsonb_array_elements(r->'events') AS e
		WHERE e->>'kind' = 'invite_expired' AND e->>'subject_label' = 'lapsed@example.com'),
	'a pending invite past its expiry reads as expired'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM hist_result, jsonb_array_elements(r->'events') AS e
		WHERE e->>'kind' = 'member_joined' AND e->>'subject_name' = 'Hist Member'
			AND (e->>'by_is_you')::boolean = false AND e->>'project_name' = 'Hist P renamed')
		AND (SELECT bool_and((e->>'by_is_you')::boolean) FROM hist_result, jsonb_array_elements(r->'events') AS e
			WHERE e->>'kind' IN ('invite_sent', 'agents_changed', 'role_changed', 'restricted_changed')),
	'names, project names and "you" are resolved'
);
SELECT pg_temp.assert_true(
	(SELECT r->'next_before' = 'null'::jsonb FROM hist_result),
	'one page when everything fits'
);

TRUNCATE hist_result;
SET LOCAL ROLE service_role;
INSERT INTO hist_result SELECT public.list_project_access_events('e5000000-0000-4000-8000-000000000001', 3, NULL, NULL, 'e5000000-0000-4000-8000-000000000021');
INSERT INTO hist_result
	SELECT public.list_project_access_events(
		'e5000000-0000-4000-8000-000000000001',
		3,
		(SELECT (r->>'next_before')::timestamptz FROM hist_result LIMIT 1),
		(SELECT (r->>'next_before_id')::uuid FROM hist_result LIMIT 1),
		'e5000000-0000-4000-8000-000000000021');
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(DISTINCT e->>'id') = 6 FROM hist_result, jsonb_array_elements(r->'events') AS e)
		AND (SELECT bool_and(jsonb_array_length(r->'events') = 3) FROM hist_result),
	'keyset paging returns full pages without repeats'
);

SELECT pg_temp.act_as('e5000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.list_project_access_events('e5000000-0000-4000-8000-000000000001', 50, NULL, NULL, NULL);
	RAISE EXCEPTION 'assertion_failed: a browser session called the server-only reader';
EXCEPTION WHEN insufficient_privilege THEN
	NULL;
END;
$$;
RESET ROLE;

ROLLBACK;
