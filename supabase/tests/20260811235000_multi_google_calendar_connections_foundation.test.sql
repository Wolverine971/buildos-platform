-- supabase/tests/20260811235000_multi_google_calendar_connections_foundation.test.sql
-- Disposable verification for the multi-Google-Calendar connection foundation.
-- Apply migrations through 20260811235000 before running.
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
VALUES
	('ca100000-0000-4000-8000-000000000001'),
	('ca100000-0000-4000-8000-000000000002');

SELECT *
FROM public.upsert_google_calendar_connection(
	p_user_id => 'ca100000-0000-4000-8000-000000000001',
	p_expected_connection_id => NULL::uuid,
	p_new_connection_id => 'ca200000-0000-4000-8000-000000000001',
	p_provider_account_id => 'google-calendar-sub-1',
	p_email_address => 'calendar-one@example.com',
	p_display_name => 'Calendar One',
	p_default_account_label => 'Primary account',
	p_oauth_client_kind => 'google_shared_login',
	p_access_token_ciphertext => 'enc:calendar:v1.access-one',
	p_refresh_token_ciphertext => 'enc:calendar:v1.refresh-one',
	p_access_token_expires_at => '2026-08-12T00:00:00Z',
	p_refresh_token_expires_at => NULL::timestamptz,
	p_token_type => 'Bearer',
	p_granted_scopes => ARRAY[
		'openid',
		'email',
		'https://www.googleapis.com/auth/calendar'
	]::text[],
	p_key_version => 1
);

SELECT *
FROM public.upsert_google_calendar_connection(
	p_user_id => 'ca100000-0000-4000-8000-000000000001',
	p_expected_connection_id => NULL::uuid,
	p_new_connection_id => 'ca200000-0000-4000-8000-000000000002',
	p_provider_account_id => 'google-calendar-sub-2',
	p_email_address => 'calendar-two@example.com',
	p_display_name => 'Calendar Two',
	p_default_account_label => 'Second account',
	p_oauth_client_kind => 'google_calendar',
	p_access_token_ciphertext => 'enc:calendar:v1.access-two',
	p_refresh_token_ciphertext => 'enc:calendar:v1.refresh-two',
	p_access_token_expires_at => '2026-08-12T00:00:00Z',
	p_refresh_token_expires_at => '2027-02-01T00:00:00Z',
	p_token_type => 'Bearer',
	p_granted_scopes => ARRAY[
		'openid',
		'email',
		'https://www.googleapis.com/auth/calendar'
	]::text[],
	p_key_version => 1
);

INSERT INTO public.user_calendar_connections (
	id,
	user_id,
	provider_account_id,
	email_address,
	account_label
)
VALUES
	(
		'ca200000-0000-4000-8000-000000000003',
		'ca100000-0000-4000-8000-000000000001',
		'google-calendar-sub-3',
		'calendar-three@example.com',
		'Third account'
	),
	(
		'ca200000-0000-4000-8000-000000000004',
		'ca100000-0000-4000-8000-000000000001',
		'google-calendar-sub-4',
		'calendar-four@example.com',
		'Fourth account'
	),
	(
		'ca200000-0000-4000-8000-000000000005',
		'ca100000-0000-4000-8000-000000000001',
		'google-calendar-sub-5',
		'calendar-five@example.com',
		'Fifth account'
	);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			INSERT INTO public.user_calendar_connections (
				user_id,
				provider_account_id,
				email_address,
				account_label
			)
			VALUES (
				'ca100000-0000-4000-8000-000000000001',
				'google-calendar-sub-6',
				'calendar-six@example.com',
				'Sixth account'
			)
		$statement$,
		'calendar_connection_limit_exceeded'
	),
	'a sixth non-deleted Calendar connection must be rejected'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			INSERT INTO public.user_calendar_connections (
				user_id,
				provider_account_id,
				email_address,
				account_label
			)
			VALUES (
				'ca100000-0000-4000-8000-000000000002',
				'google-calendar-sub-1',
				'other-user@example.com',
				'Other user account'
			)
		$statement$,
		'duplicate key value'
	),
	'the same Google sub must not attach to two BuildOS users'
);

SELECT pg_temp.assert_true(
	(
		SELECT oauth_client_kind = 'google_shared_login'
		FROM public.calendar_connection_credentials
		WHERE connection_id = (
			SELECT id
			FROM public.user_calendar_connections
			WHERE provider_account_id = 'google-calendar-sub-1'
		)
	),
	'legacy credentials must retain the shared-login OAuth client identity'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			$statement$
				SELECT *
				FROM public.rotate_google_calendar_credentials(
					%L::uuid,
					%L::uuid,
					'google_calendar',
					'enc:calendar:v1.rotated-access',
					'enc:calendar:v1.rotated-refresh',
					now() + interval '1 hour',
					NULL,
					'Bearer',
					ARRAY['https://www.googleapis.com/auth/calendar']::text[],
					1
				)
			$statement$,
			'ca100000-0000-4000-8000-000000000001',
			(
				SELECT id
				FROM public.user_calendar_connections
				WHERE provider_account_id = 'google-calendar-sub-1'
			)
		),
		'calendar_oauth_client_kind_mismatch'
	),
	'refresh must not silently move a migrated token to the dedicated Calendar client'
);

INSERT INTO public.calendar_oauth_states (
	state_hash,
	user_id,
	redirect_path,
	nonce,
	code_verifier
)
VALUES (
	repeat('a', 64),
	'ca100000-0000-4000-8000-000000000001',
	'/profile?tab=calendar',
	'nonce-one',
	'pkce-verifier-one'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.consume_calendar_oauth_state(
			repeat('a', 64),
			'ca100000-0000-4000-8000-000000000001',
			'google_calendar'
		)
	),
	'valid OAuth state must be consumed exactly once'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM public.consume_calendar_oauth_state(
			repeat('a', 64),
			'ca100000-0000-4000-8000-000000000001',
			'google_calendar'
		)
	),
	'consumed OAuth state must not be replayable'
);

SELECT *
FROM public.upsert_google_calendar_source(
	p_user_id => 'ca100000-0000-4000-8000-000000000001',
	p_connection_id => (
		SELECT id
		FROM public.user_calendar_connections
		WHERE provider_account_id = 'google-calendar-sub-1'
	),
	p_provider_calendar_id => 'calendar-one@example.com',
	p_summary => 'Calendar One',
	p_summary_override => NULL,
	p_description => NULL,
	p_timezone => 'America/New_York',
	p_color_id => '1',
	p_background_color => '#123456',
	p_foreground_color => '#ffffff',
	p_access_role => 'owner',
	p_is_primary => true,
	p_is_hidden => false,
	p_is_selected_in_google => true
);

SELECT *
FROM public.upsert_google_calendar_source(
	p_user_id => 'ca100000-0000-4000-8000-000000000001',
	p_connection_id => (
		SELECT id
		FROM public.user_calendar_connections
		WHERE provider_account_id = 'google-calendar-sub-2'
	),
	p_provider_calendar_id => 'calendar-two@example.com',
	p_summary => 'Calendar Two',
	p_summary_override => NULL,
	p_description => NULL,
	p_timezone => 'America/New_York',
	p_color_id => '2',
	p_background_color => '#654321',
	p_foreground_color => '#ffffff',
	p_access_role => 'writer',
	p_is_primary => true,
	p_is_hidden => false,
	p_is_selected_in_google => true
);

SELECT pg_temp.assert_true(
	(
		SELECT source.provider_calendar_id = 'calendar-one@example.com'
		FROM public.user_calendar_preferences AS preferences
		JOIN public.user_calendar_sources AS source
			ON source.id = preferences.default_write_calendar_source_id
		WHERE preferences.user_id = 'ca100000-0000-4000-8000-000000000001'
	),
	'an additional account must not replace the existing default write source'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			$statement$
				INSERT INTO public.user_calendar_sources (
					user_id,
					connection_id,
					provider_calendar_id,
					summary,
					access_role,
					is_primary
				)
				VALUES (%L::uuid, %L::uuid, 'another-primary', 'Another primary', 'owner', true)
			$statement$,
			'ca100000-0000-4000-8000-000000000001',
			(
				SELECT id
				FROM public.user_calendar_connections
				WHERE provider_account_id = 'google-calendar-sub-1'
			)
		),
		'duplicate key value'
	),
	'a connection must not have two active primary sources'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format(
			$statement$
				INSERT INTO public.user_calendar_sources (
					user_id,
					connection_id,
					provider_calendar_id,
					summary,
					access_role
				)
				VALUES (%L::uuid, %L::uuid, 'wrong-owner', 'Wrong owner', 'reader')
			$statement$,
			'ca100000-0000-4000-8000-000000000002',
			(
				SELECT id
				FROM public.user_calendar_connections
				WHERE provider_account_id = 'google-calendar-sub-1'
			)
		),
		'violates foreign key constraint'
	),
	'a Calendar source user must match its connection owner'
);

INSERT INTO public.user_calendar_sources (
	id,
	user_id,
	connection_id,
	provider_calendar_id,
	summary,
	access_role
)
VALUES (
	'ca300000-0000-4000-8000-000000000010',
	'ca100000-0000-4000-8000-000000000001',
	(
		SELECT id
		FROM public.user_calendar_connections
		WHERE provider_account_id = 'google-calendar-sub-1'
	),
	'read-only-calendar@example.com',
	'Read-only source',
	'reader'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.set_default_calendar_source(
				'ca100000-0000-4000-8000-000000000001',
				'ca300000-0000-4000-8000-000000000010'
			)
		$statement$,
		'calendar_default_source_not_eligible'
	),
	'a read-only source must not become the default write source'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT *
			FROM public.set_calendar_source_preferences(
				'ca100000-0000-4000-8000-000000000001',
				'ca300000-0000-4000-8000-000000000010',
				true,
				true,
				true,
				true
			)
		$statement$,
		'calendar_source_not_writable'
	),
	'a read-only source must not enable two-way sync'
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
		'ca300000-0000-4000-8000-000000000011',
		'ca100000-0000-4000-8000-000000000001',
		(
			SELECT id
			FROM public.user_calendar_connections
			WHERE provider_account_id = 'google-calendar-sub-1'
		),
		'shared-calendar@example.com',
		'Shared through account one',
		'reader'
	),
	(
		'ca300000-0000-4000-8000-000000000012',
		'ca100000-0000-4000-8000-000000000001',
		(
			SELECT id
			FROM public.user_calendar_connections
			WHERE provider_account_id = 'google-calendar-sub-2'
		),
		'shared-calendar@example.com',
		'Shared through account two',
		'reader'
	);

SELECT *
FROM public.set_calendar_source_preferences(
	'ca100000-0000-4000-8000-000000000001',
	'ca300000-0000-4000-8000-000000000011',
	true,
	true,
	true,
	false
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT *
			FROM public.set_calendar_source_preferences(
				'ca100000-0000-4000-8000-000000000001',
				'ca300000-0000-4000-8000-000000000012',
				true,
				true,
				true,
				false
			)
		$statement$,
		'calendar_source_duplicate_enabled'
	),
	'the same canonical shared calendar must not be enabled through two connections'
);

SELECT pg_temp.assert_true(
	NOT has_table_privilege(
		'authenticated',
		'public.calendar_connection_credentials',
		'SELECT,INSERT,UPDATE,DELETE'
	),
	'browser roles must not access Calendar credentials'
);

SELECT pg_temp.assert_true(
	NOT has_table_privilege(
		'authenticated',
		'public.calendar_oauth_states',
		'SELECT,INSERT,UPDATE,DELETE'
	),
	'browser roles must not access Calendar OAuth state'
);

SELECT pg_temp.assert_true(
	NOT has_table_privilege(
		'authenticated',
		'public.calendar_access_audit_events',
		'SELECT,INSERT,UPDATE,DELETE'
	),
	'browser roles must not access Calendar audit rows'
);

SELECT pg_temp.assert_true(
	NOT has_table_privilege(
		'authenticated',
		'public.calendar_event_orphan_receipts',
		'SELECT,INSERT,UPDATE,DELETE'
	),
	'browser roles must not access Calendar orphan repair identities'
);

SELECT pg_temp.assert_true(
	NOT has_table_privilege(
		'authenticated',
		'public.calendar_webhook_channels',
		'SELECT,INSERT,UPDATE,DELETE'
	),
	'browser roles must not access webhook or sync secrets'
);

SELECT pg_temp.assert_true(
	(
		SELECT is_nullable = 'YES'
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'onto_event_sync'
			AND column_name = 'project_calendar_id'
	),
	'user-scope onto_event_sync rows must not require a project calendar'
);

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'onto_event_sync'
			AND column_name = 'calendar_id'
	),
	'the misleading onto_event_sync.calendar_id column must be retired'
);

SELECT public.disable_calendar_connection(
	'ca100000-0000-4000-8000-000000000001',
	(
		SELECT id
		FROM public.user_calendar_connections
		WHERE provider_account_id = 'google-calendar-sub-1'
	)
);

SELECT pg_temp.assert_true(
	(
		SELECT source.provider_calendar_id = 'calendar-two@example.com'
		FROM public.user_calendar_preferences AS preferences
		JOIN public.user_calendar_sources AS source
			ON source.id = preferences.default_write_calendar_source_id
		WHERE preferences.user_id = 'ca100000-0000-4000-8000-000000000001'
	),
	'disconnecting the default account must promote the earliest remaining writable primary source'
);

ROLLBACK;
