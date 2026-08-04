-- supabase/migrations/20260803017000_gmail_refresh_token_expiry.sql
-- Preserve Google-provided refresh-token deadlines for time-based Gmail grants.
--
-- The existing RPC signatures remain available during the web rollout. New
-- overloads add `p_refresh_token_expires_at`, delegate the credential mutation
-- to the original security-definer RPC, and persist the deadline atomically in
-- the same transaction.

BEGIN;

ALTER TABLE public.email_connection_credentials
	ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS email_connection_credentials_refresh_expiry_idx
	ON public.email_connection_credentials (refresh_token_expires_at)
	WHERE revoked_at IS NULL AND refresh_token_expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_gmail_read_connection(
	p_user_id uuid,
	p_expected_connection_id uuid,
	p_provider_account_id text,
	p_email_address text,
	p_display_name text,
	p_default_account_label text,
	p_access_token_ciphertext text,
	p_refresh_token_ciphertext text,
	p_access_token_expires_at timestamptz,
	p_token_type text,
	p_granted_scopes text[],
	p_key_version integer,
	p_consent_policy_version text,
	p_refresh_token_expires_at timestamptz
)
RETURNS SETOF public.user_email_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	connection_row public.user_email_connections%ROWTYPE;
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT delegated.*
	INTO connection_row
	FROM public.upsert_gmail_read_connection(
		p_user_id,
		p_expected_connection_id,
		p_provider_account_id,
		p_email_address,
		p_display_name,
		p_default_account_label,
		p_access_token_ciphertext,
		p_refresh_token_ciphertext,
		p_access_token_expires_at,
		p_token_type,
		p_granted_scopes,
		p_key_version,
		p_consent_policy_version
	) AS delegated
	LIMIT 1;

	IF connection_row.id IS NULL THEN
		RETURN;
	END IF;

	UPDATE public.email_connection_credentials
	SET refresh_token_expires_at = p_refresh_token_expires_at,
		updated_at = now()
	WHERE connection_id = connection_row.id
		AND grant_kind = 'read'
		AND oauth_client_kind = 'gmail_read'
		AND revoked_at IS NULL;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'gmail_read_credentials_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	RETURN NEXT connection_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_gmail_read_connection(
	uuid, uuid, text, text, text, text, text, text, timestamptz, text, text[], integer, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_gmail_read_connection(
	uuid, uuid, text, text, text, text, text, text, timestamptz, text, text[], integer, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.rotate_gmail_read_credentials(
	p_user_id uuid,
	p_connection_id uuid,
	p_access_token_ciphertext text,
	p_refresh_token_ciphertext text,
	p_access_token_expires_at timestamptz,
	p_token_type text,
	p_granted_scopes text[],
	p_key_version integer,
	p_refresh_token_expires_at timestamptz
)
RETURNS SETOF public.user_email_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	connection_row public.user_email_connections%ROWTYPE;
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT delegated.*
	INTO connection_row
	FROM public.rotate_gmail_read_credentials(
		p_user_id,
		p_connection_id,
		p_access_token_ciphertext,
		p_refresh_token_ciphertext,
		p_access_token_expires_at,
		p_token_type,
		p_granted_scopes,
		p_key_version
	) AS delegated
	LIMIT 1;

	IF connection_row.id IS NULL THEN
		RETURN;
	END IF;

	UPDATE public.email_connection_credentials
	SET refresh_token_expires_at = p_refresh_token_expires_at,
		updated_at = now()
	WHERE connection_id = connection_row.id
		AND grant_kind = 'read'
		AND oauth_client_kind = 'gmail_read'
		AND revoked_at IS NULL;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'gmail_read_credentials_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	RETURN NEXT connection_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_gmail_read_credentials(
	uuid, uuid, text, text, timestamptz, text, text[], integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_gmail_read_credentials(
	uuid, uuid, text, text, timestamptz, text, text[], integer, timestamptz
) TO service_role;

COMMIT;
