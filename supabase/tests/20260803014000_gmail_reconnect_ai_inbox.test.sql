-- Disposable lifecycle verification for Gmail reconnect attention.
-- Apply platform migrations through 20260803014000 before running.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

INSERT INTO public.users (id)
VALUES ('31000000-0000-4000-8000-000000000001');

INSERT INTO public.user_email_connections (
	id,
	user_id,
	provider,
	provider_account_id,
	email_address,
	account_label,
	status,
	read_enabled
)
VALUES
	(
		'32000000-0000-4000-8000-000000000001',
		'31000000-0000-4000-8000-000000000001',
		'google_gmail',
		'google-sub-active',
		'work@example.com',
		'Work',
		'active',
		true
	),
	(
		'32000000-0000-4000-8000-000000000002',
		'31000000-0000-4000-8000-000000000001',
		'google_gmail',
		'google-sub-disabled',
		'archive@example.com',
		'Archive',
		'disabled',
		false
	);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.inbox_items WHERE source_type = 'integration_attention'),
	'active and intentionally disabled accounts must not create reconnect attention'
);

UPDATE public.user_email_connections
SET status = 'reconnect_required', read_enabled = false
WHERE id = '32000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.inbox_items
		WHERE source_type = 'integration_attention'
			AND source_ref_id = '32000000-0000-4000-8000-000000000001'
			AND status = 'pending'
			AND source_status = 'reconnect_required'
			AND expires_at IS NULL
			AND action_kinds = ARRAY['reconnect', 'snooze', 'manage']::text[]
	),
	'reconnect_required must create one durable actionable item'
);

UPDATE public.inbox_items
SET status = 'snoozed', snoozed_until = now() + interval '1 day'
WHERE source_type = 'integration_attention'
	AND source_ref_id = '32000000-0000-4000-8000-000000000001';

UPDATE public.user_email_connections
SET account_label = 'Primary work'
WHERE id = '32000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT status = 'snoozed' AND title = 'Reconnect Primary work'
		FROM public.inbox_items
		WHERE source_type = 'integration_attention'
			AND source_ref_id = '32000000-0000-4000-8000-000000000001'
	),
	'connection metadata updates must preserve an active snooze while refreshing copy'
);

UPDATE public.user_email_connections
SET status = 'active', read_enabled = true
WHERE id = '32000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT status = 'decided' AND source_status = 'active' AND decided_at IS NOT NULL
		FROM public.inbox_items
		WHERE source_type = 'integration_attention'
			AND source_ref_id = '32000000-0000-4000-8000-000000000001'
	),
	'successful reconnect must resolve attention automatically'
);

UPDATE public.user_email_connections
SET status = 'reconnect_required', read_enabled = false
WHERE id = '32000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1 AND bool_and(status = 'pending')
		FROM public.inbox_items
		WHERE source_type = 'integration_attention'
			AND source_ref_id = '32000000-0000-4000-8000-000000000001'
	),
	'a recurring revocation must reopen the deduplicated item'
);

UPDATE public.user_email_connections
SET deleted_at = now()
WHERE id = '32000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(
		SELECT status = 'expired' AND source_status = 'disconnected'
		FROM public.inbox_items
		WHERE source_type = 'integration_attention'
			AND source_ref_id = '32000000-0000-4000-8000-000000000001'
	),
	'disconnecting an account must retire reconnect attention'
);

ROLLBACK;
