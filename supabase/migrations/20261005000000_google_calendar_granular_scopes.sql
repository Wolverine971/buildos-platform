-- supabase/migrations/20261005000000_google_calendar_granular_scopes.sql
-- New Google Calendar connections request four narrow scopes instead of the full
-- https://www.googleapis.com/auth/calendar scope (friendlier consent screen; Google verification).
-- The credential RPCs accepted only the full scope. They now accept either the full scope
-- (existing grants) or every narrow scope. The list mirrors GOOGLE_CALENDAR_SCOPES in
-- packages/shared-agent-ops/src/calendar/google-calendar-scopes.ts. Bodies are otherwise
-- copied from production's current definitions.

CREATE OR REPLACE FUNCTION public.upsert_google_calendar_connection(p_user_id uuid, p_expected_connection_id uuid, p_new_connection_id uuid, p_provider_account_id text, p_email_address text, p_display_name text, p_default_account_label text, p_oauth_client_kind text, p_access_token_ciphertext text, p_refresh_token_ciphertext text, p_access_token_expires_at timestamp with time zone, p_refresh_token_expires_at timestamp with time zone, p_token_type text, p_granted_scopes text[], p_key_version integer)
 RETURNS SETOF public.user_calendar_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
	connection_row public.user_calendar_connections%ROWTYPE;
	calendar_scope constant text := 'https://www.googleapis.com/auth/calendar';
	granular_calendar_scopes constant text[] := ARRAY[
		'https://www.googleapis.com/auth/calendar.events',
		'https://www.googleapis.com/auth/calendar.events.freebusy',
		'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
		'https://www.googleapis.com/auth/calendar.app.created'
	];
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF p_oauth_client_kind NOT IN ('google_calendar', 'google_shared_login') THEN
		RAISE EXCEPTION 'calendar_oauth_client_kind_invalid' USING ERRCODE = 'check_violation';
	END IF;

	IF NOT (
		calendar_scope = ANY(COALESCE(p_granted_scopes, '{}'::text[]))
		OR COALESCE(p_granted_scopes, '{}'::text[]) @> granular_calendar_scopes
	) THEN
		RAISE EXCEPTION 'google_calendar_scope_required' USING ERRCODE = 'check_violation';
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));

	IF EXISTS (
		SELECT 1
		FROM public.user_calendar_connections AS existing
		WHERE existing.provider = 'google_calendar'
			AND existing.provider_account_id = p_provider_account_id
			AND existing.user_id <> p_user_id
			AND existing.deleted_at IS NULL
	) THEN
		RAISE EXCEPTION 'calendar_account_already_connected'
			USING ERRCODE = 'unique_violation';
	END IF;

	IF p_expected_connection_id IS NOT NULL THEN
		SELECT connection.*
		INTO connection_row
		FROM public.user_calendar_connections AS connection
		WHERE connection.id = p_expected_connection_id
			AND connection.user_id = p_user_id
			AND connection.provider = 'google_calendar'
			AND connection.deleted_at IS NULL
		FOR UPDATE;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'calendar_connection_not_found' USING ERRCODE = 'no_data_found';
		END IF;

		IF connection_row.provider_account_id <> p_provider_account_id THEN
			RAISE EXCEPTION 'calendar_reconnect_account_mismatch'
				USING ERRCODE = 'check_violation';
		END IF;
	ELSE
		SELECT connection.*
		INTO connection_row
		FROM public.user_calendar_connections AS connection
		WHERE connection.user_id = p_user_id
			AND connection.provider = 'google_calendar'
			AND connection.provider_account_id = p_provider_account_id
			AND connection.deleted_at IS NULL
		FOR UPDATE;
	END IF;

	IF connection_row.id IS NULL THEN
		INSERT INTO public.user_calendar_connections (
			id,
			user_id,
			provider,
			provider_account_id,
			email_address,
			display_name,
			account_label,
			status,
			last_verified_at
		)
		VALUES (
			COALESCE(p_new_connection_id, gen_random_uuid()),
			p_user_id,
			'google_calendar',
			trim(p_provider_account_id),
			lower(trim(p_email_address)),
			nullif(trim(p_display_name), ''),
			left(
				COALESCE(
					nullif(trim(p_default_account_label), ''),
					nullif(split_part(p_email_address, '@', 1), ''),
					'Google Calendar'
				),
				60
			),
			'active',
			now()
		)
		RETURNING * INTO connection_row;
	ELSE
		UPDATE public.user_calendar_connections
		SET email_address = lower(trim(p_email_address)),
			display_name = nullif(trim(p_display_name), ''),
			status = 'active',
			last_verified_at = now(),
			updated_at = now()
		WHERE id = connection_row.id
		RETURNING * INTO connection_row;
	END IF;

	INSERT INTO public.calendar_connection_credentials (
		connection_id,
		oauth_client_kind,
		access_token_ciphertext,
		refresh_token_ciphertext,
		access_token_expires_at,
		refresh_token_expires_at,
		token_type,
		granted_scopes,
		key_version,
		last_refreshed_at,
		revoked_at
	)
	VALUES (
		connection_row.id,
		p_oauth_client_kind,
		p_access_token_ciphertext,
		p_refresh_token_ciphertext,
		p_access_token_expires_at,
		p_refresh_token_expires_at,
		COALESCE(nullif(p_token_type, ''), 'Bearer'),
		COALESCE(p_granted_scopes, '{}'::text[]),
		p_key_version,
		now(),
		NULL
	)
	ON CONFLICT (connection_id) DO UPDATE
	SET oauth_client_kind = EXCLUDED.oauth_client_kind,
		access_token_ciphertext = EXCLUDED.access_token_ciphertext,
		refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
		access_token_expires_at = EXCLUDED.access_token_expires_at,
		refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
		token_type = EXCLUDED.token_type,
		granted_scopes = EXCLUDED.granted_scopes,
		key_version = EXCLUDED.key_version,
		last_refreshed_at = now(),
		revoked_at = NULL,
		updated_at = now();

	RETURN NEXT connection_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_google_calendar_connection(
	uuid, uuid, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz,
	text, text[], integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_calendar_connection(
	uuid, uuid, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz,
	text, text[], integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.rotate_google_calendar_credentials(p_user_id uuid, p_connection_id uuid, p_oauth_client_kind text, p_access_token_ciphertext text, p_refresh_token_ciphertext text, p_access_token_expires_at timestamp with time zone, p_refresh_token_expires_at timestamp with time zone, p_token_type text, p_granted_scopes text[], p_key_version integer)
 RETURNS SETOF public.user_calendar_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
	connection_row public.user_calendar_connections%ROWTYPE;
	credential_client_kind text;
	calendar_scope constant text := 'https://www.googleapis.com/auth/calendar';
	granular_calendar_scopes constant text[] := ARRAY[
		'https://www.googleapis.com/auth/calendar.events',
		'https://www.googleapis.com/auth/calendar.events.freebusy',
		'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
		'https://www.googleapis.com/auth/calendar.app.created'
	];
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT connection.*
	INTO connection_row
	FROM public.user_calendar_connections AS connection
	WHERE connection.id = p_connection_id
		AND connection.user_id = p_user_id
		AND connection.provider = 'google_calendar'
		AND connection.status = 'active'
		AND connection.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'calendar_connection_not_active' USING ERRCODE = 'no_data_found';
	END IF;

	SELECT credential.oauth_client_kind
	INTO credential_client_kind
	FROM public.calendar_connection_credentials AS credential
	WHERE credential.connection_id = p_connection_id
		AND credential.revoked_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'calendar_credentials_not_active' USING ERRCODE = 'no_data_found';
	END IF;

	IF credential_client_kind <> p_oauth_client_kind THEN
		RAISE EXCEPTION 'calendar_oauth_client_kind_mismatch'
			USING ERRCODE = 'check_violation';
	END IF;

	IF NOT (
		calendar_scope = ANY(COALESCE(p_granted_scopes, '{}'::text[]))
		OR COALESCE(p_granted_scopes, '{}'::text[]) @> granular_calendar_scopes
	) THEN
		RAISE EXCEPTION 'google_calendar_scope_required' USING ERRCODE = 'check_violation';
	END IF;

	UPDATE public.calendar_connection_credentials
	SET access_token_ciphertext = p_access_token_ciphertext,
		refresh_token_ciphertext = p_refresh_token_ciphertext,
		access_token_expires_at = p_access_token_expires_at,
		refresh_token_expires_at = p_refresh_token_expires_at,
		token_type = COALESCE(nullif(p_token_type, ''), 'Bearer'),
		granted_scopes = COALESCE(p_granted_scopes, '{}'::text[]),
		key_version = p_key_version,
		last_refreshed_at = now(),
		updated_at = now()
	WHERE connection_id = p_connection_id
		AND oauth_client_kind = p_oauth_client_kind
		AND revoked_at IS NULL;

	UPDATE public.user_calendar_connections
	SET last_used_at = now(),
		last_verified_at = now(),
		updated_at = now()
	WHERE id = p_connection_id
	RETURNING * INTO connection_row;

	RETURN NEXT connection_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.rotate_google_calendar_credentials(
	uuid, uuid, text, text, text, timestamptz, timestamptz, text, text[], integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_google_calendar_credentials(
	uuid, uuid, text, text, text, timestamptz, timestamptz, text, text[], integer
) TO service_role;
