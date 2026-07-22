-- supabase/migrations/20260722000000_gmail_read_connections.sql
-- Gmail read-only multi-account connection foundation.
--
-- Security invariants:
--   - one BuildOS user may connect at most five active Gmail accounts;
--   - Google `sub` is the provider identity (email is display metadata only);
--   - browser roles may read connection/capability metadata, never credentials or OAuth state;
--   - credential and OAuth-state mutations are service-role-only;
--   - the read grant must contain gmail.readonly and must not contain any other Gmail scope.

CREATE TABLE public.user_email_connections (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	provider text NOT NULL DEFAULT 'google_gmail'
		CHECK (provider = 'google_gmail'),
	provider_account_id text NOT NULL
		CHECK (char_length(provider_account_id) BETWEEN 1 AND 255),
	email_address text NOT NULL
		CHECK (char_length(email_address) BETWEEN 3 AND 320),
	display_name text,
	account_label text NOT NULL
		CHECK (char_length(account_label) BETWEEN 1 AND 60),
	status text NOT NULL DEFAULT 'active'
		CHECK (status IN ('active', 'reconnect_required', 'disabled', 'error')),
	read_enabled boolean NOT NULL DEFAULT true,
	connected_at timestamptz NOT NULL DEFAULT now(),
	last_verified_at timestamptz,
	last_used_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz
);

CREATE UNIQUE INDEX user_email_connections_user_provider_account_active_idx
	ON public.user_email_connections (user_id, provider, provider_account_id)
	WHERE deleted_at IS NULL;

-- Deliberately prevent one Google mailbox from being attached to multiple BuildOS users until
-- shared-mailbox semantics have a separate product/security design.
CREATE UNIQUE INDEX user_email_connections_provider_account_active_idx
	ON public.user_email_connections (provider, provider_account_id)
	WHERE deleted_at IS NULL;

CREATE INDEX user_email_connections_user_status_idx
	ON public.user_email_connections (user_id, status, connected_at DESC)
	WHERE deleted_at IS NULL;

CREATE TABLE public.email_connection_credentials (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	connection_id uuid NOT NULL REFERENCES public.user_email_connections(id) ON DELETE CASCADE,
	grant_kind text NOT NULL
		CHECK (grant_kind IN ('read', 'send', 'compose', 'modify')),
	oauth_client_kind text NOT NULL
		CHECK (oauth_client_kind IN ('gmail_read', 'gmail_actions')),
	access_token_ciphertext text NOT NULL
		CHECK (access_token_ciphertext ~ '^enc:gmail:v[0-9]+\.'),
	refresh_token_ciphertext text NOT NULL
		CHECK (refresh_token_ciphertext ~ '^enc:gmail:v[0-9]+\.'),
	access_token_expires_at timestamptz,
	token_type text NOT NULL DEFAULT 'Bearer',
	granted_scopes text[] NOT NULL DEFAULT '{}'::text[],
	key_version integer NOT NULL DEFAULT 1 CHECK (key_version > 0),
	last_refreshed_at timestamptz,
	revoked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (connection_id, grant_kind),
	CHECK (
		(grant_kind = 'read' AND oauth_client_kind = 'gmail_read')
		OR (grant_kind <> 'read' AND oauth_client_kind = 'gmail_actions')
	)
);

CREATE INDEX email_connection_credentials_expiry_idx
	ON public.email_connection_credentials (access_token_expires_at)
	WHERE revoked_at IS NULL;

CREATE TABLE public.email_capability_grants (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	connection_id uuid NOT NULL REFERENCES public.user_email_connections(id) ON DELETE CASCADE,
	capability text NOT NULL
		CHECK (capability IN ('read', 'send', 'save_gmail_draft', 'modify_message')),
	status text NOT NULL DEFAULT 'disabled'
		CHECK (status IN ('enabled', 'disabled', 'reconnect_required')),
	granted_scopes text[] NOT NULL DEFAULT '{}'::text[],
	consent_policy_version text NOT NULL,
	enabled_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
	enabled_at timestamptz,
	disabled_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (connection_id, capability)
);

CREATE TABLE public.email_oauth_states (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	state_hash text NOT NULL UNIQUE
		CHECK (state_hash ~ '^[a-f0-9]{64}$'),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	oauth_client_kind text NOT NULL CHECK (oauth_client_kind = 'gmail_read'),
	connection_id uuid REFERENCES public.user_email_connections(id) ON DELETE CASCADE,
	redirect_path text NOT NULL DEFAULT '/profile?tab=email'
		CHECK (redirect_path LIKE '/%' AND redirect_path NOT LIKE '//%'),
	nonce text NOT NULL,
	code_verifier text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
	consumed_at timestamptz,
	CHECK (expires_at > created_at)
);

CREATE INDEX email_oauth_states_unconsumed_expiry_idx
	ON public.email_oauth_states (expires_at)
	WHERE consumed_at IS NULL;

CREATE TABLE public.email_access_audit_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	connection_id uuid,
	operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 100),
	outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked')),
	reason_code text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_access_audit_events_user_created_idx
	ON public.email_access_audit_events (user_id, created_at DESC);

CREATE INDEX email_access_audit_events_connection_created_idx
	ON public.email_access_audit_events (connection_id, created_at DESC)
	WHERE connection_id IS NOT NULL;

ALTER TABLE public.user_email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_connection_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_access_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_email_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_connection_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_capability_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_oauth_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_access_audit_events FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.user_email_connections TO authenticated;
GRANT SELECT ON TABLE public.email_capability_grants TO authenticated;

GRANT ALL ON TABLE public.user_email_connections TO service_role;
GRANT ALL ON TABLE public.email_connection_credentials TO service_role;
GRANT ALL ON TABLE public.email_capability_grants TO service_role;
GRANT ALL ON TABLE public.email_oauth_states TO service_role;
GRANT ALL ON TABLE public.email_access_audit_events TO service_role;

CREATE POLICY user_email_connections_owner_select
	ON public.user_email_connections FOR SELECT
	TO authenticated
	USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY email_capability_grants_owner_select
	ON public.email_capability_grants FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM public.user_email_connections AS connection
			WHERE connection.id = email_capability_grants.connection_id
				AND connection.user_id = auth.uid()
				AND connection.deleted_at IS NULL
		)
	);

CREATE POLICY user_email_connections_service_role_all
	ON public.user_email_connections FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY email_connection_credentials_service_role_all
	ON public.email_connection_credentials FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY email_capability_grants_service_role_all
	ON public.email_capability_grants FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY email_oauth_states_service_role_all
	ON public.email_oauth_states FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY email_access_audit_events_service_role_all
	ON public.email_access_audit_events FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enforce_email_connection_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	active_connection_count integer;
BEGIN
	IF NEW.provider <> 'google_gmail' OR NEW.deleted_at IS NOT NULL THEN
		RETURN NEW;
	END IF;

	-- Serialize account additions for this BuildOS user so concurrent OAuth callbacks cannot both
	-- pass the five-account check.
	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

	SELECT count(*)
	INTO active_connection_count
	FROM public.user_email_connections AS connection
	WHERE connection.user_id = NEW.user_id
		AND connection.provider = 'google_gmail'
		AND connection.deleted_at IS NULL
		AND connection.id <> NEW.id;

	IF active_connection_count >= 5 THEN
		RAISE EXCEPTION 'gmail_connection_limit_exceeded'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_email_connection_limit_trigger
	BEFORE INSERT OR UPDATE OF user_id, provider, deleted_at
	ON public.user_email_connections
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_email_connection_limit();

CREATE OR REPLACE FUNCTION public.consume_email_oauth_state(
	p_state_hash text,
	p_user_id uuid,
	p_oauth_client_kind text
)
RETURNS TABLE (
	state_id uuid,
	redirect_path text,
	nonce text,
	code_verifier text,
	connection_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	state_row public.email_oauth_states%ROWTYPE;
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT state.*
	INTO state_row
	FROM public.email_oauth_states AS state
	WHERE state.state_hash = p_state_hash
		AND state.user_id = p_user_id
		AND state.oauth_client_kind = p_oauth_client_kind
		AND state.consumed_at IS NULL
		AND state.expires_at > now()
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN;
	END IF;

	UPDATE public.email_oauth_states
	SET consumed_at = now()
	WHERE id = state_row.id;

	RETURN QUERY
	SELECT
		state_row.id,
		state_row.redirect_path,
		state_row.nonce,
		state_row.code_verifier,
		state_row.connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_email_oauth_state(text, uuid, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_email_oauth_state(text, uuid, text)
	TO service_role;

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
	p_consent_policy_version text
)
RETURNS SETOF public.user_email_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	connection_row public.user_email_connections%ROWTYPE;
	readonly_scope constant text := 'https://www.googleapis.com/auth/gmail.readonly';
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF NOT readonly_scope = ANY(COALESCE(p_granted_scopes, '{}'::text[])) THEN
		RAISE EXCEPTION 'gmail_readonly_scope_required' USING ERRCODE = 'check_violation';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM unnest(COALESCE(p_granted_scopes, '{}'::text[])) AS granted_scope(value)
		WHERE granted_scope.value IN ('https://mail.google.com', 'https://mail.google.com/')
			OR (
				granted_scope.value LIKE 'https://www.googleapis.com/auth/gmail.%'
				AND granted_scope.value <> readonly_scope
			)
	) THEN
		RAISE EXCEPTION 'unexpected_gmail_scope_not_allowed_on_read_connection'
			USING ERRCODE = 'check_violation';
	END IF;

	IF p_expected_connection_id IS NOT NULL THEN
		SELECT connection.*
		INTO connection_row
		FROM public.user_email_connections AS connection
		WHERE connection.id = p_expected_connection_id
			AND connection.user_id = p_user_id
			AND connection.provider = 'google_gmail'
			AND connection.deleted_at IS NULL
		FOR UPDATE;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'gmail_connection_not_found' USING ERRCODE = 'no_data_found';
		END IF;

		IF connection_row.provider_account_id <> p_provider_account_id THEN
			RAISE EXCEPTION 'gmail_reconnect_account_mismatch' USING ERRCODE = 'check_violation';
		END IF;
	ELSE
		SELECT connection.*
		INTO connection_row
		FROM public.user_email_connections AS connection
		WHERE connection.user_id = p_user_id
			AND connection.provider = 'google_gmail'
			AND connection.provider_account_id = p_provider_account_id
			AND connection.deleted_at IS NULL
		FOR UPDATE;
	END IF;

	IF connection_row.id IS NULL THEN
		INSERT INTO public.user_email_connections (
			user_id,
			provider,
			provider_account_id,
			email_address,
			display_name,
			account_label,
			status,
			read_enabled,
			last_verified_at
		)
		VALUES (
			p_user_id,
			'google_gmail',
			p_provider_account_id,
			lower(trim(p_email_address)),
			nullif(trim(p_display_name), ''),
			left(COALESCE(nullif(trim(p_default_account_label), ''), split_part(p_email_address, '@', 1)), 60),
			'active',
			true,
			now()
		)
		RETURNING * INTO connection_row;
	ELSE
		UPDATE public.user_email_connections
		SET email_address = lower(trim(p_email_address)),
			display_name = nullif(trim(p_display_name), ''),
			status = 'active',
			read_enabled = true,
			last_verified_at = now(),
			updated_at = now()
		WHERE id = connection_row.id
		RETURNING * INTO connection_row;
	END IF;

	INSERT INTO public.email_connection_credentials (
		connection_id,
		grant_kind,
		oauth_client_kind,
		access_token_ciphertext,
		refresh_token_ciphertext,
		access_token_expires_at,
		token_type,
		granted_scopes,
		key_version,
		last_refreshed_at,
		revoked_at
	)
	VALUES (
		connection_row.id,
		'read',
		'gmail_read',
		p_access_token_ciphertext,
		p_refresh_token_ciphertext,
		p_access_token_expires_at,
		COALESCE(nullif(p_token_type, ''), 'Bearer'),
		p_granted_scopes,
		p_key_version,
		now(),
		NULL
	)
	ON CONFLICT (connection_id, grant_kind) DO UPDATE
	SET access_token_ciphertext = EXCLUDED.access_token_ciphertext,
		refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
		access_token_expires_at = EXCLUDED.access_token_expires_at,
		token_type = EXCLUDED.token_type,
		granted_scopes = EXCLUDED.granted_scopes,
		key_version = EXCLUDED.key_version,
		last_refreshed_at = now(),
		revoked_at = NULL,
		updated_at = now();

	INSERT INTO public.email_capability_grants (
		connection_id,
		capability,
		status,
		granted_scopes,
		consent_policy_version,
		enabled_by_user_id,
		enabled_at,
		disabled_at
	)
	VALUES (
		connection_row.id,
		'read',
		'enabled',
		p_granted_scopes,
		p_consent_policy_version,
		p_user_id,
		now(),
		NULL
	)
	ON CONFLICT (connection_id, capability) DO UPDATE
	SET status = 'enabled',
		granted_scopes = EXCLUDED.granted_scopes,
		consent_policy_version = EXCLUDED.consent_policy_version,
		enabled_by_user_id = EXCLUDED.enabled_by_user_id,
		enabled_at = now(),
		disabled_at = NULL,
		updated_at = now();

	RETURN NEXT connection_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_gmail_read_connection(
	uuid, uuid, text, text, text, text, text, text, timestamptz, text, text[], integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_gmail_read_connection(
	uuid, uuid, text, text, text, text, text, text, timestamptz, text, text[], integer, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.rotate_gmail_read_credentials(
	p_user_id uuid,
	p_connection_id uuid,
	p_access_token_ciphertext text,
	p_refresh_token_ciphertext text,
	p_access_token_expires_at timestamptz,
	p_token_type text,
	p_granted_scopes text[],
	p_key_version integer
)
RETURNS SETOF public.user_email_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	connection_row public.user_email_connections%ROWTYPE;
	readonly_scope constant text := 'https://www.googleapis.com/auth/gmail.readonly';
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT connection.*
	INTO connection_row
	FROM public.user_email_connections AS connection
	WHERE connection.id = p_connection_id
		AND connection.user_id = p_user_id
		AND connection.provider = 'google_gmail'
		AND connection.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'gmail_connection_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	IF connection_row.status <> 'active' OR NOT connection_row.read_enabled THEN
		RAISE EXCEPTION 'gmail_connection_not_active' USING ERRCODE = 'check_violation';
	END IF;

	IF NOT readonly_scope = ANY(COALESCE(p_granted_scopes, '{}'::text[])) THEN
		RAISE EXCEPTION 'gmail_readonly_scope_required' USING ERRCODE = 'check_violation';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM unnest(COALESCE(p_granted_scopes, '{}'::text[])) AS granted_scope(value)
		WHERE granted_scope.value IN ('https://mail.google.com', 'https://mail.google.com/')
			OR (
				granted_scope.value LIKE 'https://www.googleapis.com/auth/gmail.%'
				AND granted_scope.value <> readonly_scope
			)
	) THEN
		RAISE EXCEPTION 'unexpected_gmail_scope_not_allowed_on_read_connection'
			USING ERRCODE = 'check_violation';
	END IF;

	UPDATE public.email_connection_credentials
	SET access_token_ciphertext = p_access_token_ciphertext,
		refresh_token_ciphertext = p_refresh_token_ciphertext,
		access_token_expires_at = p_access_token_expires_at,
		token_type = COALESCE(nullif(p_token_type, ''), 'Bearer'),
		granted_scopes = p_granted_scopes,
		key_version = p_key_version,
		last_refreshed_at = now(),
		updated_at = now()
	WHERE connection_id = p_connection_id
		AND grant_kind = 'read'
		AND oauth_client_kind = 'gmail_read'
		AND revoked_at IS NULL;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'gmail_read_credentials_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	UPDATE public.user_email_connections
	SET status = 'active',
		read_enabled = true,
		last_verified_at = now(),
		last_used_at = now(),
		updated_at = now()
	WHERE id = p_connection_id
	RETURNING * INTO connection_row;

	UPDATE public.email_capability_grants
	SET status = 'enabled',
		granted_scopes = p_granted_scopes,
		disabled_at = NULL,
		updated_at = now()
	WHERE connection_id = p_connection_id
		AND capability = 'read';

	RETURN NEXT connection_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_gmail_read_credentials(
	uuid, uuid, text, text, timestamptz, text, text[], integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_gmail_read_credentials(
	uuid, uuid, text, text, timestamptz, text, text[], integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_gmail_read_connection_reconnect_required(
	p_user_id uuid,
	p_connection_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	PERFORM 1
	FROM public.user_email_connections AS connection
	WHERE connection.id = p_connection_id
		AND connection.user_id = p_user_id
		AND connection.provider = 'google_gmail'
		AND connection.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'gmail_connection_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	UPDATE public.user_email_connections
	SET status = 'reconnect_required',
		read_enabled = false,
		updated_at = now()
	WHERE id = p_connection_id;

	UPDATE public.email_connection_credentials
	SET revoked_at = COALESCE(revoked_at, now()),
		updated_at = now()
	WHERE connection_id = p_connection_id
		AND grant_kind = 'read';

	UPDATE public.email_capability_grants
	SET status = 'reconnect_required',
		disabled_at = COALESCE(disabled_at, now()),
		updated_at = now()
	WHERE connection_id = p_connection_id
		AND capability = 'read';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_gmail_read_connection_reconnect_required(uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_gmail_read_connection_reconnect_required(uuid, uuid)
	TO service_role;

COMMENT ON TABLE public.user_email_connections IS
	'Multi-account email integration metadata. Gmail connections are read-only by default.';
COMMENT ON TABLE public.email_connection_credentials IS
	'Server-only encrypted OAuth credentials, isolated by account and grant kind.';
COMMENT ON TABLE public.email_oauth_states IS
	'Server-only hashed, expiring, single-use OAuth state and PKCE material.';
COMMENT ON TABLE public.email_access_audit_events IS
	'Content-free audit events. Never store message subjects, bodies, recipients, headers, or tokens.';
