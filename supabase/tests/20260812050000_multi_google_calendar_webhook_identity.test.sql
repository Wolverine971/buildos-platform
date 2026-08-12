-- supabase/tests/20260812050000_multi_google_calendar_webhook_identity.test.sql
-- Disposable verification for source-aware Google Calendar webhook identity.
-- Apply all migrations through 20260812050000, or the focused base fixture plus that migration,
-- before running.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN false;
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO public.users (id)
VALUES ('ca150000-0000-4000-8000-000000000001');

INSERT INTO public.user_calendar_connections (
	id,
	user_id,
	provider_account_id,
	email_address,
	account_label
)
VALUES
	(
		'ca250000-0000-4000-8000-000000000001',
		'ca150000-0000-4000-8000-000000000001',
		'webhook-identity-account-1',
		'webhook-one@example.com',
		'Webhook account one'
	),
	(
		'ca250000-0000-4000-8000-000000000002',
		'ca150000-0000-4000-8000-000000000001',
		'webhook-identity-account-2',
		'webhook-two@example.com',
		'Webhook account two'
	);

INSERT INTO public.user_calendar_sources (
	id,
	user_id,
	connection_id,
	provider_calendar_id,
	summary,
	access_role
)
VALUES
	(
		'ca350000-0000-4000-8000-000000000001',
		'ca150000-0000-4000-8000-000000000001',
		'ca250000-0000-4000-8000-000000000001',
		'shared-webhook@example.com',
		'Shared through account one',
		'owner'
	),
	(
		'ca350000-0000-4000-8000-000000000002',
		'ca150000-0000-4000-8000-000000000001',
		'ca250000-0000-4000-8000-000000000002',
		'shared-webhook@example.com',
		'Shared through account two',
		'owner'
	);

INSERT INTO public.calendar_webhook_channels (
	user_id,
	channel_id,
	resource_id,
	calendar_id,
	calendar_source_id,
	expiration,
	webhook_token
)
VALUES
	(
		'ca150000-0000-4000-8000-000000000001',
		'legacy-webhook-channel',
		'legacy-webhook-resource',
		'shared-webhook@example.com',
		NULL,
		1900000000000,
		'legacy-webhook-token'
	),
	(
		'ca150000-0000-4000-8000-000000000001',
		'source-one-webhook-channel',
		'source-one-webhook-resource',
		'shared-webhook@example.com',
		'ca350000-0000-4000-8000-000000000001',
		1900000000000,
		'source-one-webhook-token'
	),
	(
		'ca150000-0000-4000-8000-000000000001',
		'source-two-webhook-channel',
		'source-two-webhook-resource',
		'shared-webhook@example.com',
		'ca350000-0000-4000-8000-000000000002',
		1900000000000,
		'source-two-webhook-token'
	);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 3
		FROM public.calendar_webhook_channels
		WHERE user_id = 'ca150000-0000-4000-8000-000000000001'
			AND calendar_id = 'shared-webhook@example.com'
	),
	'legacy and source-backed channels must coexist for the same provider calendar ID'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			INSERT INTO public.calendar_webhook_channels (
				user_id, channel_id, calendar_id, expiration, webhook_token
			)
			VALUES (
				'ca150000-0000-4000-8000-000000000001',
				'duplicate-legacy-webhook-channel',
				'shared-webhook@example.com',
				1900000000000,
				'duplicate-legacy-webhook-token'
			)
		$statement$,
		'duplicate key value'
	),
	'legacy channels must remain unique by user and provider calendar ID'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			INSERT INTO public.calendar_webhook_channels (
				user_id,
				channel_id,
				calendar_id,
				calendar_source_id,
				expiration,
				webhook_token
			)
			VALUES (
				'ca150000-0000-4000-8000-000000000001',
				'duplicate-source-webhook-channel',
				'shared-webhook@example.com',
				'ca350000-0000-4000-8000-000000000001',
				1900000000000,
				'duplicate-source-webhook-token'
			)
		$statement$,
		'duplicate key value'
	),
	'source-backed channels must remain unique by calendar source'
);

DELETE FROM public.user_calendar_sources
WHERE id = 'ca350000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.calendar_webhook_channels
		WHERE channel_id = 'source-one-webhook-channel'
	),
	'hard-deleting a calendar source must cascade its webhook channel'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.calendar_webhook_channels
		WHERE calendar_source_id IS NULL
			AND user_id = 'ca150000-0000-4000-8000-000000000001'
	),
	'source deletion must not convert a channel into a legacy row'
);

ROLLBACK;
