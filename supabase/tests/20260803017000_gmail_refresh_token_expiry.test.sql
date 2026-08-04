-- supabase/tests/20260803017000_gmail_refresh_token_expiry.test.sql
-- Disposable verification for Gmail refresh-token expiry persistence.
-- Apply platform migrations through 20260803017000 before running.

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

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO public.users (id)
VALUES ('33000000-0000-4000-8000-000000000001');

SELECT *
FROM public.upsert_gmail_read_connection(
	p_user_id => '33000000-0000-4000-8000-000000000001',
	p_expected_connection_id => NULL::uuid,
	p_provider_account_id => 'google-sub-time-based',
	p_email_address => 'time-based@example.com',
	p_display_name => 'Time Based',
	p_default_account_label => 'Time based',
	p_access_token_ciphertext => 'enc:gmail:v1.access',
	p_refresh_token_ciphertext => 'enc:gmail:v1.refresh',
	p_access_token_expires_at => '2026-08-03T22:00:00.000Z',
	p_token_type => 'Bearer',
	p_granted_scopes => ARRAY['https://www.googleapis.com/auth/gmail.readonly']::text[],
	p_key_version => 1,
	p_consent_policy_version => 'gmail-read-v1-2026-07-22',
	p_refresh_token_expires_at => '2026-08-10T21:00:00.000Z'
);

SELECT pg_temp.assert_true(
	(
		SELECT refresh_token_expires_at = '2026-08-10T21:00:00.000Z'::timestamptz
		FROM public.email_connection_credentials
		WHERE connection_id = (
			SELECT id
			FROM public.user_email_connections
			WHERE provider_account_id = 'google-sub-time-based'
		)
			AND grant_kind = 'read'
	),
	'the OAuth upsert overload must store Google refresh-token expiry'
);

SELECT *
FROM public.rotate_gmail_read_credentials(
	p_user_id => '33000000-0000-4000-8000-000000000001',
	p_connection_id => (
		SELECT id
		FROM public.user_email_connections
		WHERE provider_account_id = 'google-sub-time-based'
	),
	p_access_token_ciphertext => 'enc:gmail:v1.rotated-access',
	p_refresh_token_ciphertext => 'enc:gmail:v1.rotated-refresh',
	p_access_token_expires_at => '2026-08-03T23:00:00.000Z',
	p_token_type => 'Bearer',
	p_granted_scopes => ARRAY['https://www.googleapis.com/auth/gmail.readonly']::text[],
	p_key_version => 1,
	p_refresh_token_expires_at => '2026-08-11T21:00:00.000Z'
);

SELECT pg_temp.assert_true(
	(
		SELECT refresh_token_expires_at = '2026-08-11T21:00:00.000Z'::timestamptz
		FROM public.email_connection_credentials
		WHERE connection_id = (
			SELECT id
			FROM public.user_email_connections
			WHERE provider_account_id = 'google-sub-time-based'
		)
			AND grant_kind = 'read'
	),
	'the credential rotation overload must update Google refresh-token expiry'
);

ROLLBACK;
