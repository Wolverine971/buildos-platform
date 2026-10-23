-- supabase/tests/20261023140000_people_layer_foundation.check.sql
-- Rehearsal assertions for the people layer (pnpm db:rehearse <migration> --check <this file>).
-- O = owner (findable as @ownertest), S = requester, X = a third person.
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
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid, text) TO authenticated;

INSERT INTO auth.users (id, email) VALUES
	('e1000000-0000-4000-8000-000000000001', 'owner.test@example.com'),
	('e1000000-0000-4000-8000-000000000002', 'sam.test@example.com'),
	('e1000000-0000-4000-8000-000000000003', 'third.test@example.com');
INSERT INTO public.users (id, email, name, username) VALUES
	('e1000000-0000-4000-8000-000000000001', 'owner.test@example.com', 'Owner Test', 'ownertest'),
	('e1000000-0000-4000-8000-000000000002', 'sam.test@example.com', 'Sam Test', NULL),
	('e1000000-0000-4000-8000-000000000003', 'third.test@example.com', 'Third Test', 'thirdtest')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	('e1000000-0000-4000-8000-000000000011', 'human', 'Owner Test', 'owner.test@example.com', 'e1000000-0000-4000-8000-000000000001'),
	('e1000000-0000-4000-8000-000000000013', 'human', 'Third Test', 'third.test@example.com', 'e1000000-0000-4000-8000-000000000003')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('e1000000-0000-4000-8000-000000000021', 'Owner project A', 'project.default', 'e1000000-0000-4000-8000-000000000011', 'active'),
	('e1000000-0000-4000-8000-000000000022', 'Owner project B', 'project.default', 'e1000000-0000-4000-8000-000000000011', 'active'),
	('e1000000-0000-4000-8000-000000000023', 'Third project', 'project.default', 'e1000000-0000-4000-8000-000000000013', 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
	('e1000000-0000-4000-8000-000000000021', 'e1000000-0000-4000-8000-000000000011', 'owner', 'admin'),
	('e1000000-0000-4000-8000-000000000022', 'e1000000-0000-4000-8000-000000000011', 'owner', 'admin'),
	('e1000000-0000-4000-8000-000000000023', 'e1000000-0000-4000-8000-000000000013', 'owner', 'admin')
	ON CONFLICT DO NOTHING;

-- 1. Nobody is findable until they opt in.
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(public.find_person_by_handle('@OwnerTest')->>'found')::boolean = false,
	'owner is hidden before opting in'
);
SELECT pg_temp.assert_true(
	public.create_people_request('ownertest')->>'status' = 'not_found',
	'requests to a hidden person look like not found'
);
RESET ROLE;

UPDATE public.users SET discoverability = 'handle' WHERE id = 'e1000000-0000-4000-8000-000000000001';

-- 2. Find and request as Sam (signed in).
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	(public.find_person_by_handle(' @OwnerTest ')->>'found')::boolean,
	'owner is findable by handle once opted in'
);
SELECT pg_temp.assert_true(
	public.find_person_by_handle('ownertest') ? 'name' AND NOT public.find_person_by_handle('ownertest') ? 'email',
	'lookup never returns an email'
);
SELECT pg_temp.assert_true(
	public.create_people_request('ownertest', 'viewer', '9takes', 'Want to help with outreach')->>'status' = 'pending',
	'Sam can send a request'
);
SELECT pg_temp.assert_true(
	(public.create_people_request('ownertest')->>'already_pending')::boolean,
	'a second request returns the pending one'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.people_requests) = 1,
	'Sam sees only his own request rows'
);
DO $$
BEGIN
	PERFORM public.create_people_request('ownertest', 'viewer', NULL, NULL,
		'e1000000-0000-4000-8000-0000000000aa'::uuid);
	RAISE EXCEPTION 'assertion_failed: a browser session cannot claim an agent sent the request';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
	PERFORM public.decide_people_request(
		(SELECT id FROM public.people_requests LIMIT 1), 'approve',
		'[{"project_id":"e1000000-0000-4000-8000-000000000021"}]'::jsonb);
	RAISE EXCEPTION 'assertion_failed: the requester cannot approve their own request';
EXCEPTION WHEN no_data_found THEN NULL;
END $$;
RESET ROLE;

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1 FROM public.user_notifications
		WHERE user_id = 'e1000000-0000-4000-8000-000000000001' AND event_type = 'people.request.received'
	),
	'owner gets an in-app notification'
);

-- 3. The owner lists and approves, sharing only what they own.
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	jsonb_array_length(public.list_people_requests()->'incoming') = 1
		AND public.list_people_requests()->'incoming'->0->'from'->>'email' = 'sam.test@example.com',
	'owner sees the request, with the email because Sam has no handle'
);
DO $$
BEGIN
	PERFORM public.decide_people_request(
		(SELECT id FROM public.people_requests LIMIT 1), 'approve',
		'[{"project_id":"e1000000-0000-4000-8000-000000000023","role":"viewer"}]'::jsonb);
	RAISE EXCEPTION 'assertion_failed: owner cannot share a project they do not own';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
	PERFORM public.decide_people_request(
		(SELECT id FROM public.people_requests LIMIT 1), 'approve',
		'[{"project_id":"e1000000-0000-4000-8000-000000000021","role":"viewer","agent_access":"write"}]'::jsonb);
	RAISE EXCEPTION 'assertion_failed: a viewer''s agents cannot get write';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
SELECT pg_temp.assert_true(
	public.decide_people_request(
		(SELECT id FROM public.people_requests LIMIT 1), 'approve',
		'[{"project_id":"e1000000-0000-4000-8000-000000000021","role":"viewer","agent_access":"read"},
		  {"project_id":"e1000000-0000-4000-8000-000000000022","role":"editor","agent_access":"write"}]'::jsonb
	)->>'status' = 'approved',
	'owner approves two projects'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.onto_project_members m
	 JOIN public.onto_actors a ON a.id = m.actor_id
	 WHERE a.user_id = 'e1000000-0000-4000-8000-000000000002' AND m.removed_at IS NULL) = 2,
	'Sam is a member of both projects (actor created on approval)'
);
SELECT pg_temp.assert_true(
	(SELECT m.agent_access FROM public.onto_project_members m
	 JOIN public.onto_actors a ON a.id = m.actor_id
	 WHERE a.user_id = 'e1000000-0000-4000-8000-000000000002'
		AND m.project_id = 'e1000000-0000-4000-8000-000000000022') = 'write',
	'editor share keeps agent write'
);
SELECT pg_temp.assert_true(
	actor_has_project_member_access(
		(SELECT id FROM public.onto_actors WHERE user_id = 'e1000000-0000-4000-8000-000000000002'),
		'e1000000-0000-4000-8000-000000000021', 'read')
	AND NOT actor_has_project_member_access(
		(SELECT id FROM public.onto_actors WHERE user_id = 'e1000000-0000-4000-8000-000000000002'),
		'e1000000-0000-4000-8000-000000000021', 'write'),
	'viewer share grants read, not write'
);

-- 4. Pausing agents: only the owner, only off/read/write, write only for editors.
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000001', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.set_project_member_agent_access(
		'e1000000-0000-4000-8000-000000000022',
		(SELECT m.id FROM public.onto_project_members m JOIN public.onto_actors a ON a.id = m.actor_id
		 WHERE a.user_id = 'e1000000-0000-4000-8000-000000000002' AND m.project_id = 'e1000000-0000-4000-8000-000000000022'),
		'off'
	)->>'agent_access' = 'off',
	'owner can pause a member''s agents'
);
RESET ROLE;
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.set_project_member_agent_access(
		'e1000000-0000-4000-8000-000000000022',
		(SELECT m.id FROM public.onto_project_members m JOIN public.onto_actors a ON a.id = m.actor_id
		 WHERE a.user_id = 'e1000000-0000-4000-8000-000000000002' AND m.project_id = 'e1000000-0000-4000-8000-000000000022'),
		'write');
	RAISE EXCEPTION 'assertion_failed: a member cannot raise their own agents';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- 5. Decline, cooldown, and silent block.
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000002', 'authenticated');
UPDATE public.users SET discoverability = 'handle' WHERE id = 'e1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.create_people_request('thirdtest')->>'status' = 'pending',
	'Sam asks a third person'
);
RESET ROLE;
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000003', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.decide_people_request(
		(SELECT id FROM public.people_requests WHERE status = 'pending' LIMIT 1), 'decline'
	)->>'status' = 'declined',
	'third person declines'
);
RESET ROLE;
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
	public.create_people_request('thirdtest')->>'status' = 'declined_recently',
	'asking again right after a decline is refused'
);
RESET ROLE;

-- 6. Invites carry the agent setting onto the member row when accepted.
INSERT INTO public.onto_project_invites (
	id, project_id, invitee_email, token_hash, role_key, access, status, expires_at, invited_by_actor_id, agent_access
) VALUES (
	'e1000000-0000-4000-8000-000000000031', 'e1000000-0000-4000-8000-000000000023', 'owner.test@example.com',
	repeat('f', 64), 'viewer', 'read', 'pending', now() + interval '7 days', 'e1000000-0000-4000-8000-000000000013', 'off'
);
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id) VALUES
	('e1000000-0000-4000-8000-000000000023', 'e1000000-0000-4000-8000-000000000011', 'viewer', 'read', 'e1000000-0000-4000-8000-000000000013');
UPDATE public.onto_project_invites
SET status = 'accepted', accepted_by_actor_id = 'e1000000-0000-4000-8000-000000000011', accepted_at = now()
WHERE id = 'e1000000-0000-4000-8000-000000000031';
SELECT pg_temp.assert_true(
	(SELECT agent_access FROM public.onto_project_members
	 WHERE project_id = 'e1000000-0000-4000-8000-000000000023'
		AND actor_id = 'e1000000-0000-4000-8000-000000000011') = 'off',
	'accepted invite copies the agent setting'
);

-- 7. (20261023150000) Editors can't touch invites; a downgraded member's agents drop to read.
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000002', 'authenticated');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
	INSERT INTO public.onto_project_invites (
		project_id, invitee_email, token_hash, role_key, access, status, expires_at
	) VALUES (
		'e1000000-0000-4000-8000-000000000022', 'reshare@example.com', repeat('e', 64),
		'viewer', 'read', 'pending', now() + interval '7 days'
	);
	RAISE EXCEPTION 'assertion_failed: an editor could create an invite';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.onto_project_invites WHERE project_id = 'e1000000-0000-4000-8000-000000000022') = 0,
	'an editor cannot read the project''s invites'
);
RESET ROLE;
UPDATE public.onto_project_members AS m
SET agent_access = 'write'
FROM public.onto_actors AS a
WHERE a.id = m.actor_id AND a.user_id = 'e1000000-0000-4000-8000-000000000002'
	AND m.project_id = 'e1000000-0000-4000-8000-000000000022';
UPDATE public.onto_project_members AS m
SET role_key = 'viewer', access = 'read'
FROM public.onto_actors AS a
WHERE a.id = m.actor_id AND a.user_id = 'e1000000-0000-4000-8000-000000000002'
	AND m.project_id = 'e1000000-0000-4000-8000-000000000022';
SELECT pg_temp.assert_true(
	(SELECT m.agent_access FROM public.onto_project_members m
	 JOIN public.onto_actors a ON a.id = m.actor_id
	 WHERE a.user_id = 'e1000000-0000-4000-8000-000000000002'
		AND m.project_id = 'e1000000-0000-4000-8000-000000000022') = 'read',
	'moving an editor to viewer drops their agents to read'
);

ROLLBACK;
