-- supabase/tests/20261105120300_notification_rows_guard.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261105120300_notification_rows_guard.sql \
--     --check supabase/tests/20261105120300_notification_rows_guard.check.sql
--
-- 1. A recipient can mark their delivery opened/clicked but cannot rewrite payload, status,
--    attempts or channel; an admin can still reset a delivery (admin retry).
-- 2. A non-admin cannot subscribe to admin events, and the fan-out skips non-admin
--    subscribers that already exist.
-- 3. SMS short links are server-only.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

-- A = ordinary user, B = admin, C = another ordinary user.
INSERT INTO auth.users (id, email) VALUES
	('c1053000-0000-4000-8000-00000000000a', 'notif-guard-a@example.com'),
	('c1053000-0000-4000-8000-00000000000b', 'notif-guard-b@example.com'),
	('c1053000-0000-4000-8000-00000000000c', 'notif-guard-c@example.com');
INSERT INTO public.users (id, email, is_admin) VALUES
	('c1053000-0000-4000-8000-00000000000a', 'notif-guard-a@example.com', false),
	('c1053000-0000-4000-8000-00000000000b', 'notif-guard-b@example.com', true),
	('c1053000-0000-4000-8000-00000000000c', 'notif-guard-c@example.com', false)
ON CONFLICT (id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

DELETE FROM public.user_notification_preferences
WHERE user_id IN ('c1053000-0000-4000-8000-00000000000a', 'c1053000-0000-4000-8000-00000000000b');
INSERT INTO public.user_notification_preferences (user_id, in_app_enabled) VALUES
	('c1053000-0000-4000-8000-00000000000a', true),
	('c1053000-0000-4000-8000-00000000000b', true);

INSERT INTO public.notification_deliveries (id, recipient_user_id, channel, status, payload, attempts)
VALUES (
	'c1053000-0000-4000-8000-0000000000d1',
	'c1053000-0000-4000-8000-00000000000a',
	'email',
	'sent',
	'{"title":"Your brief is ready","body":"3 things today","event_type":"brief.completed"}'::jsonb,
	1
);

-- Subscription A made before this fix (the leak), plus the admin's own.
INSERT INTO public.notification_subscriptions (id, user_id, event_type, is_active, created_by) VALUES
	('c1053000-0000-4000-8000-0000000000e1', 'c1053000-0000-4000-8000-00000000000a', 'user.signup', true, 'c1053000-0000-4000-8000-00000000000a'),
	('c1053000-0000-4000-8000-0000000000e2', 'c1053000-0000-4000-8000-00000000000b', 'user.signup', true, 'c1053000-0000-4000-8000-00000000000b');

INSERT INTO public.notification_tracking_links (id, short_code, delivery_id, destination_url)
VALUES (
	'c1053000-0000-4000-8000-0000000000f1',
	'ngrd01',
	'c1053000-0000-4000-8000-0000000000d1',
	'https://build-os.com/briefs'
);

-- Grants and policies.
DO $$
BEGIN
	ASSERT NOT has_table_privilege('anon', 'public.notification_tracking_links', 'SELECT'),
		'anon must not read tracking links';
	ASSERT NOT has_table_privilege('authenticated', 'public.notification_tracking_links', 'SELECT'),
		'authenticated must not read tracking links';
	ASSERT NOT has_table_privilege('authenticated', 'public.notification_tracking_links', 'UPDATE'),
		'authenticated must not update tracking links';
	ASSERT NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'notification_tracking_links'
	), 'leftover tracking link policies are gone';
	ASSERT NOT has_function_privilege('authenticated', 'public.create_tracking_link(uuid, text)', 'EXECUTE'),
		'authenticated must not mint tracking links';
	ASSERT NOT has_function_privilege('anon', 'public.get_link_click_stats(uuid, integer)', 'EXECUTE'),
		'anon must not read click stats';
	ASSERT has_function_privilege('service_role', 'public.create_tracking_link(uuid, text)', 'EXECUTE'),
		'worker keeps create_tracking_link';
	ASSERT NOT has_table_privilege('authenticated', 'public.notification_deliveries', 'INSERT'),
		'authenticated must not insert deliveries';
	ASSERT has_table_privilege('authenticated', 'public.notification_deliveries', 'UPDATE'),
		'authenticated keeps UPDATE for open/click marks';
	ASSERT NOT has_function_privilege('authenticated', 'public.emit_notification_event(text, text, uuid, uuid, jsonb, jsonb, timestamptz)', 'EXECUTE'),
		'emit_notification_event stays server-only';
END;
$$;

-- 1a. Recipient A: rewrites refused, open/click marks allowed.
BEGIN;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"c1053000-0000-4000-8000-00000000000a"}',
	true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_refused boolean;
	v_row public.notification_deliveries%ROWTYPE;
BEGIN
	v_refused := false;
	BEGIN
		UPDATE public.notification_deliveries
		SET payload = '{"title":"Reset your password","body":"<a href=\"https://evil.example\">here</a>","event_type":"task.assigned"}'::jsonb
		WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'recipient must not rewrite the delivery payload';

	v_refused := false;
	BEGIN
		UPDATE public.notification_deliveries
		SET status = 'pending', attempts = 0
		WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'recipient must not re-arm the delivery';

	v_refused := false;
	BEGIN
		UPDATE public.notification_deliveries SET status = 'pending'
		WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'recipient must not set status back to pending';

	v_refused := false;
	BEGIN
		UPDATE public.notification_deliveries
		SET channel = 'sms', channel_identifier = '+15555550100'
		WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'recipient must not change channel or identifier';

	-- /notifications page: mark opened.
	UPDATE public.notification_deliveries
	SET opened_at = now(), status = 'opened', updated_at = now()
	WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
	-- click tracking endpoint: mark clicked.
	UPDATE public.notification_deliveries
	SET clicked_at = now(), status = 'clicked', updated_at = now()
	WHERE id = 'c1053000-0000-4000-8000-0000000000d1';

	SELECT * INTO v_row FROM public.notification_deliveries
	WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
	ASSERT v_row.status = 'clicked' AND v_row.opened_at IS NOT NULL AND v_row.clicked_at IS NOT NULL,
		'recipient can still mark opened and clicked';
	ASSERT v_row.payload->>'title' = 'Your brief is ready' AND v_row.attempts = 1,
		'payload and attempts untouched';
END;
$$;
ROLLBACK;

-- 1b. Admin B: the admin retry reset still works with the admin's own session.
BEGIN;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"c1053000-0000-4000-8000-00000000000b"}',
	true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_status text;
BEGIN
	UPDATE public.notification_deliveries
	SET status = 'pending', last_error = NULL, sent_at = NULL, opened_at = NULL, clicked_at = NULL
	WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
	SELECT status INTO v_status FROM public.notification_deliveries
	WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
	ASSERT v_status = 'pending', 'admin retry can reset a delivery';
END;
$$;
ROLLBACK;

-- 1c. Service role (worker) is unrestricted.
BEGIN;
SET LOCAL ROLE service_role;
UPDATE public.notification_deliveries
SET status = 'failed', attempts = 3, payload = payload || '{"engagement_stage":"standard"}'::jsonb
WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
ROLLBACK;

-- 2a. Subscriptions: non-admin refused for admin events, allowed for their own events.
BEGIN;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"c1053000-0000-4000-8000-00000000000a"}',
	true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_refused boolean;
BEGIN
	v_refused := false;
	BEGIN
		INSERT INTO public.notification_subscriptions (user_id, event_type, is_active, created_by)
		VALUES ('c1053000-0000-4000-8000-00000000000a', 'payment.failed', true, 'c1053000-0000-4000-8000-00000000000a');
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'non-admin must not subscribe to an admin event';

	v_refused := false;
	BEGIN
		UPDATE public.notification_subscriptions SET event_type = 'user.signup', is_active = true
		WHERE user_id = 'c1053000-0000-4000-8000-00000000000a' AND event_type = 'user.signup';
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'non-admin must not keep an admin subscription active';

	-- Own events still work (notification-preferences.service upsert).
	INSERT INTO public.notification_subscriptions (user_id, event_type, is_active, admin_only, created_by)
	VALUES ('c1053000-0000-4000-8000-00000000000a', 'brief.completed', true, false, 'c1053000-0000-4000-8000-00000000000a');

	-- Turning the leaked subscription off is allowed.
	UPDATE public.notification_subscriptions SET is_active = false
	WHERE id = 'c1053000-0000-4000-8000-0000000000e1';
END;
$$;
ROLLBACK;

BEGIN;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"c1053000-0000-4000-8000-00000000000b"}',
	true
);
SET LOCAL ROLE authenticated;
INSERT INTO public.notification_subscriptions (user_id, event_type, is_active, created_by)
VALUES ('c1053000-0000-4000-8000-00000000000b', 'error.critical', true, 'c1053000-0000-4000-8000-00000000000b');
ROLLBACK;

-- 2b. Fan-out: the pre-existing non-admin subscription no longer receives user.signup.
BEGIN;
DO $$
DECLARE
	v_event_id uuid;
	v_to_a integer;
	v_to_b integer;
BEGIN
	v_event_id := public.emit_notification_event(
		p_event_type := 'user.signup',
		p_event_source := 'database_trigger',
		p_actor_user_id := 'c1053000-0000-4000-8000-00000000000c',
		p_payload := jsonb_build_object(
			'user_id', 'c1053000-0000-4000-8000-00000000000c',
			'user_email', 'notif-guard-c@example.com'
		)
	);
	SELECT count(*) INTO v_to_a FROM public.notification_deliveries
	WHERE event_id = v_event_id AND recipient_user_id = 'c1053000-0000-4000-8000-00000000000a';
	SELECT count(*) INTO v_to_b FROM public.notification_deliveries
	WHERE event_id = v_event_id AND recipient_user_id = 'c1053000-0000-4000-8000-00000000000b';
	ASSERT v_to_a = 0, 'non-admin subscriber must not receive user.signup';
	ASSERT v_to_b = 1, 'admin subscriber still receives user.signup';
END;
$$;
ROLLBACK;

-- 3. Tracking links: anon and signed-in callers cannot read or retarget; service role can mint.
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE
	v_refused boolean := false;
BEGIN
	BEGIN
		PERFORM 1 FROM public.notification_tracking_links;
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'anon must not list tracking links';
END;
$$;
ROLLBACK;

BEGIN;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"c1053000-0000-4000-8000-00000000000c"}',
	true
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
	v_refused boolean := false;
BEGIN
	BEGIN
		UPDATE public.notification_tracking_links SET destination_url = 'https://evil.example/'
		WHERE short_code = 'ngrd01';
	EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
	END;
	ASSERT v_refused, 'signed-in user must not retarget a short link';
END;
$$;
ROLLBACK;

-- Run as the owner: the local cluster's service_role lacks production's BYPASSRLS, and the
-- EXECUTE grant to service_role is asserted above.
BEGIN;
DO $$
DECLARE
	v_code text;
BEGIN
	v_code := public.create_tracking_link('c1053000-0000-4000-8000-0000000000d1', 'https://build-os.com/projects');
	ASSERT v_code IS NOT NULL, 'worker can still mint a short link';
	ASSERT (SELECT destination_url FROM public.notification_tracking_links WHERE short_code = 'ngrd01')
		= 'https://build-os.com/briefs', 'fixture link unchanged';
END;
$$;
ROLLBACK;

-- Remove the fixtures so later standing checks (account deletion) do not see an active
-- user.signup subscription.
DELETE FROM public.notification_tracking_links WHERE id = 'c1053000-0000-4000-8000-0000000000f1';
DELETE FROM public.notification_deliveries WHERE id = 'c1053000-0000-4000-8000-0000000000d1';
DELETE FROM public.notification_subscriptions
WHERE id IN ('c1053000-0000-4000-8000-0000000000e1', 'c1053000-0000-4000-8000-0000000000e2');
DELETE FROM public.user_notification_preferences
WHERE user_id IN ('c1053000-0000-4000-8000-00000000000a', 'c1053000-0000-4000-8000-00000000000b');

SELECT 'notification rows guard: all checks passed' AS result;
