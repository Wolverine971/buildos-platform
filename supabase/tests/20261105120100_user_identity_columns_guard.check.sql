-- supabase/tests/20261105120100_user_identity_columns_guard.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261105120100_user_identity_columns_guard.sql \
--     --check supabase/tests/20261105120100_user_identity_columns_guard.check.sql
--
-- A signed-in user can no longer take over someone's email invite by rewriting their own
-- public.users.email, claim a reserved handle, or mark their own phone verified / raise their
-- SMS cap. Normal profile edits, SMS preference toggles, opt-out and server-side verification
-- still work. Everything rolls back.

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;

CREATE FUNCTION pg_temp.idg_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
	SELECT ('c1051000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.idg_as(n integer, email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	PERFORM set_config('request.jwt.claims',
		jsonb_build_object('role', 'authenticated', 'sub', pg_temp.idg_id(n), 'email', email)::text, true);
	PERFORM set_config('request.jwt.claim.sub', pg_temp.idg_id(n)::text, true);
	PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.idg_id(integer), pg_temp.idg_as(integer, text) TO authenticated;

-- 1 = project owner, 2 = attacker, 3 = the real invitee, 4 = new account with no profile yet.
INSERT INTO auth.users (id, email) VALUES
	(pg_temp.idg_id(1), 'idguard.owner@example.com'),
	(pg_temp.idg_id(2), 'idguard.attacker@example.com'),
	(pg_temp.idg_id(3), 'idguard.victim@example.com'),
	(pg_temp.idg_id(4), 'idguard.new@example.com');
INSERT INTO public.users (id, email, name) VALUES
	(pg_temp.idg_id(1), 'idguard.owner@example.com', 'Owner'),
	(pg_temp.idg_id(2), 'idguard.attacker-old@example.com', 'Attacker'),
	(pg_temp.idg_id(3), 'idguard.victim@example.com', 'Victim')
ON CONFLICT DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, email, user_id) VALUES
	(pg_temp.idg_id(21), 'human', 'Owner', 'idguard.owner@example.com', pg_temp.idg_id(1)),
	(pg_temp.idg_id(22), 'human', 'Attacker', 'idguard.attacker@example.com', pg_temp.idg_id(2)),
	(pg_temp.idg_id(23), 'human', 'Victim', 'idguard.victim@example.com', pg_temp.idg_id(3))
ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key)
VALUES (pg_temp.idg_id(101), 'Guarded project', 'project.default', pg_temp.idg_id(21), 'active');
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, agent_access)
VALUES (pg_temp.idg_id(101), pg_temp.idg_id(21), 'owner', 'admin', 'write')
ON CONFLICT DO NOTHING;
-- A plain email invite: no invitee_user_id, so acceptance matches on email.
INSERT INTO public.onto_project_invites (id, project_id, invitee_email, invitee_user_id, role_key,
	access, agent_access, token_hash, invited_by_actor_id, status, expires_at)
VALUES (pg_temp.idg_id(201), pg_temp.idg_id(101), 'idguard.victim@example.com', NULL, 'editor',
	'write', 'read', lpad('201', 64, '0'), pg_temp.idg_id(21), 'pending', now() + interval '7 days');

INSERT INTO public.user_sms_preferences (user_id, phone_number, phone_verified, phone_verified_at)
VALUES (pg_temp.idg_id(3), '+15555550103', true, now());

-- 1. Attacker: email rewrite refused, invite stays out of reach.
SELECT pg_temp.idg_as(2, 'idguard.attacker@example.com');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_refused boolean := false;
	v_seen integer;
BEGIN
	BEGIN
		UPDATE public.users SET email = 'idguard.victim@example.com'
		WHERE id = pg_temp.idg_id(2);
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'rewriting own email to another address must be refused';

	SELECT count(*) INTO v_seen FROM public.list_pending_project_invites()
	WHERE invite_id = pg_temp.idg_id(201);
	ASSERT v_seen = 0, 'attacker must not see the victim invite';

	v_refused := false;
	BEGIN
		PERFORM public.accept_project_invite_by_id(pg_temp.idg_id(201));
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'attacker must not accept the victim invite';

	-- Ordinary edits still work, and a stale email can be synced to the session email.
	UPDATE public.users SET name = 'Attacker Renamed', bio = 'hi' WHERE id = pg_temp.idg_id(2);
	UPDATE public.users SET email = 'idguard.attacker@example.com' WHERE id = pg_temp.idg_id(2);

	-- Reserved handles refused, ordinary handles fine.
	v_refused := false;
	BEGIN
		UPDATE public.users SET username = 'support' WHERE id = pg_temp.idg_id(2);
	EXCEPTION WHEN check_violation THEN v_refused := true;
	END;
	ASSERT v_refused, 'reserved handle must be refused';
	v_refused := false;
	BEGIN
		UPDATE public.users SET username = 'buildos' WHERE id = pg_temp.idg_id(2);
	EXCEPTION WHEN check_violation THEN v_refused := true;
	END;
	ASSERT v_refused, 'reserved handle buildos must be refused';
	UPDATE public.users SET username = 'idguard-attacker' WHERE id = pg_temp.idg_id(2);

	-- The existing privileged-column guard still holds.
	v_refused := false;
	BEGIN
		UPDATE public.users SET is_admin = true WHERE id = pg_temp.idg_id(2);
	EXCEPTION WHEN OTHERS THEN v_refused := true;
	END;
	ASSERT v_refused, 'is_admin stays protected';
END;
$$;
RESET ROLE;

DO $$
DECLARE v_row public.users%ROWTYPE;
BEGIN
	SELECT * INTO v_row FROM public.users WHERE id = pg_temp.idg_id(2);
	ASSERT v_row.email = 'idguard.attacker@example.com', 'email synced to the session email only';
	ASSERT v_row.username = 'idguard-attacker' AND v_row.name = 'Attacker Renamed',
		'ordinary profile edits saved';
	ASSERT (SELECT status FROM public.onto_project_invites WHERE id = pg_temp.idg_id(201)) = 'pending',
		'victim invite untouched';
END;
$$;

-- 2. New profile row: email comes from the session, not the payload.
SELECT pg_temp.idg_as(4, 'idguard.new@example.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.users (id, email, name)
VALUES (pg_temp.idg_id(4), 'idguard.victim@example.com', 'Newcomer');
RESET ROLE;
DO $$
BEGIN
	ASSERT (SELECT email FROM public.users WHERE id = pg_temp.idg_id(4)) = 'idguard.new@example.com',
		'inserted profile email pinned to the session email';
END;
$$;

-- 3. The real invitee still accepts.
SELECT pg_temp.idg_as(3, 'idguard.victim@example.com');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_status text;
BEGIN
	ASSERT (SELECT count(*) FROM public.list_pending_project_invites()
		WHERE invite_id = pg_temp.idg_id(201)) = 1, 'invitee sees their invite';
	SELECT r.status INTO v_status FROM public.accept_project_invite_by_id(pg_temp.idg_id(201)) r;
	ASSERT v_status = 'joined', 'invitee joins';
END;
$$;
RESET ROLE;

-- 4. SMS: attacker cannot self-verify or raise limits; toggles and opt-out still work.
SELECT pg_temp.idg_as(2, 'idguard.attacker@example.com');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_refused boolean := false;
BEGIN
	BEGIN
		INSERT INTO public.user_sms_preferences (user_id, phone_number, phone_verified, phone_verified_at)
		VALUES (pg_temp.idg_id(2), '+15555550102', true, now());
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'inserting a verified phone must be refused';

	v_refused := false;
	BEGIN
		INSERT INTO public.user_sms_preferences (user_id, daily_sms_limit)
		VALUES (pg_temp.idg_id(2), 500);
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'inserting a raised limit must be refused';

	-- What /api/sms/verify and /api/sms/preferences do with the user session (upserts).
	INSERT INTO public.user_sms_preferences (user_id, phone_number, phone_verified)
	VALUES (pg_temp.idg_id(2), '+15555550102', false)
	ON CONFLICT (user_id) DO UPDATE SET phone_number = EXCLUDED.phone_number,
		phone_verified = EXCLUDED.phone_verified;
	INSERT INTO public.user_sms_preferences (user_id, event_reminders_enabled, quiet_hours_start)
	VALUES (pg_temp.idg_id(2), true, '22:00')
	ON CONFLICT (user_id) DO UPDATE SET event_reminders_enabled = EXCLUDED.event_reminders_enabled,
		quiet_hours_start = EXCLUDED.quiet_hours_start;

	v_refused := false;
	BEGIN
		UPDATE public.user_sms_preferences SET phone_verified = true, phone_verified_at = now()
		WHERE user_id = pg_temp.idg_id(2);
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'self-verifying must be refused';

	v_refused := false;
	BEGIN
		UPDATE public.user_sms_preferences SET daily_sms_limit = 500 WHERE user_id = pg_temp.idg_id(2);
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'raising the SMS cap must be refused';

	v_refused := false;
	BEGIN
		UPDATE public.user_sms_preferences SET daily_sms_count = 7 WHERE user_id = pg_temp.idg_id(2);
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'rewriting the SMS count must be refused';
END;
$$;
RESET ROLE;

-- Server verifies the attacker's number, as the confirm route now does with the service role.
-- Run as the rehearsal superuser: the local service_role has no BYPASSRLS, and the guard
-- treats every non-client role the same way.
INSERT INTO public.user_sms_preferences (user_id, phone_number, phone_verified, phone_verified_at)
VALUES (pg_temp.idg_id(2), '+15555550102', true, now())
ON CONFLICT (user_id) DO UPDATE SET phone_number = EXCLUDED.phone_number,
	phone_verified = EXCLUDED.phone_verified, phone_verified_at = EXCLUDED.phone_verified_at;

SELECT pg_temp.idg_as(2, 'idguard.attacker@example.com');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_refused boolean := false;
	v_row public.user_sms_preferences%ROWTYPE;
BEGIN
	-- Toggles on a verified row keep it verified.
	UPDATE public.user_sms_preferences SET morning_kickoff_enabled = true
	WHERE user_id = pg_temp.idg_id(2);
	SELECT * INTO v_row FROM public.user_sms_preferences WHERE user_id = pg_temp.idg_id(2);
	ASSERT v_row.phone_verified AND v_row.event_reminders_enabled AND v_row.morning_kickoff_enabled,
		'server verification sticks and toggles save';

	-- Swapping in a new number drops verification.
	UPDATE public.user_sms_preferences SET phone_number = '+15555550199'
	WHERE user_id = pg_temp.idg_id(2);
	SELECT * INTO v_row FROM public.user_sms_preferences WHERE user_id = pg_temp.idg_id(2);
	ASSERT v_row.phone_verified IS FALSE AND v_row.phone_verified_at IS NULL,
		'changing the number clears verification';

	-- Opting out works; clearing an opt-out does not.
	UPDATE public.user_sms_preferences SET opted_out = true, opted_out_at = now()
	WHERE user_id = pg_temp.idg_id(2);
	BEGIN
		UPDATE public.user_sms_preferences SET opted_out = false WHERE user_id = pg_temp.idg_id(2);
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'clearing an opt-out must be refused';

	-- Another user's verified row is untouched by anything above.
	ASSERT NOT EXISTS (SELECT 1 FROM public.user_sms_preferences WHERE user_id = pg_temp.idg_id(3)),
		'RLS still hides other users';
END;
$$;
RESET ROLE;

DO $$
BEGIN
	ASSERT (SELECT phone_verified FROM public.user_sms_preferences WHERE user_id = pg_temp.idg_id(3)),
		'victim row still verified';
	ASSERT (SELECT daily_sms_limit FROM public.user_sms_preferences WHERE user_id = pg_temp.idg_id(2)) = 10,
		'attacker limit unchanged';
END;
$$;

ROLLBACK;

SELECT 'user identity columns guard: all checks passed' AS result;
