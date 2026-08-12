-- supabase/migrations/20260811235000_multi_google_calendar_connections_foundation.sql
-- Multi-Google-Calendar connection and source identity foundation.
--
-- This migration is intentionally additive apart from the accurate rename of
-- onto_event_sync.calendar_id to project_calendar_id. Existing singleton credentials remain in
-- user_calendar_tokens during the compatibility window and are migrated by an application job.

BEGIN;

CREATE TABLE public.user_calendar_connections (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	provider text NOT NULL DEFAULT 'google_calendar'
		CHECK (provider = 'google_calendar'),
	provider_account_id text NOT NULL
		CHECK (char_length(provider_account_id) BETWEEN 1 AND 255),
	email_address text NOT NULL
		CHECK (char_length(email_address) BETWEEN 3 AND 320),
	display_name text,
	account_label text NOT NULL
		CHECK (char_length(account_label) BETWEEN 1 AND 60),
	status text NOT NULL DEFAULT 'active'
		CHECK (status IN ('active', 'reconnect_required', 'disabled', 'error')),
	connected_at timestamptz NOT NULL DEFAULT now(),
	last_verified_at timestamptz,
	last_used_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz,
	UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX user_calendar_connections_user_provider_account_active_idx
	ON public.user_calendar_connections (user_id, provider, provider_account_id)
	WHERE deleted_at IS NULL;

-- Shared Google identities need an explicit product/security model. Until that exists, one
-- provider identity may belong to only one BuildOS user.
CREATE UNIQUE INDEX user_calendar_connections_provider_account_active_idx
	ON public.user_calendar_connections (provider, provider_account_id)
	WHERE deleted_at IS NULL;

CREATE INDEX user_calendar_connections_user_status_idx
	ON public.user_calendar_connections (user_id, status, connected_at)
	WHERE deleted_at IS NULL;

CREATE TABLE public.calendar_connection_credentials (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	connection_id uuid NOT NULL UNIQUE
		REFERENCES public.user_calendar_connections(id) ON DELETE CASCADE,
	oauth_client_kind text NOT NULL DEFAULT 'google_calendar'
		CHECK (oauth_client_kind IN ('google_calendar', 'google_shared_login')),
	access_token_ciphertext text NOT NULL
		CHECK (access_token_ciphertext ~ '^enc:calendar:v[0-9]+\.'),
	refresh_token_ciphertext text NOT NULL
		CHECK (refresh_token_ciphertext ~ '^enc:calendar:v[0-9]+\.'),
	access_token_expires_at timestamptz,
	refresh_token_expires_at timestamptz,
	token_type text NOT NULL DEFAULT 'Bearer',
	granted_scopes text[] NOT NULL DEFAULT '{}'::text[],
	key_version integer NOT NULL DEFAULT 1 CHECK (key_version > 0),
	last_refreshed_at timestamptz,
	revoked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calendar_connection_credentials_expiry_idx
	ON public.calendar_connection_credentials (access_token_expires_at)
	WHERE revoked_at IS NULL;

CREATE TABLE public.calendar_oauth_states (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	state_hash text NOT NULL UNIQUE
		CHECK (state_hash ~ '^[a-f0-9]{64}$'),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	connection_id uuid REFERENCES public.user_calendar_connections(id) ON DELETE CASCADE,
	oauth_client_kind text NOT NULL DEFAULT 'google_calendar'
		CHECK (oauth_client_kind = 'google_calendar'),
	redirect_path text NOT NULL DEFAULT '/profile?tab=calendar'
		CHECK (redirect_path LIKE '/%' AND redirect_path NOT LIKE '//%'),
	nonce text NOT NULL,
	code_verifier text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
	consumed_at timestamptz,
	CHECK (expires_at > created_at)
);

CREATE INDEX calendar_oauth_states_unconsumed_expiry_idx
	ON public.calendar_oauth_states (expires_at)
	WHERE consumed_at IS NULL;

CREATE TABLE public.user_calendar_sources (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	connection_id uuid NOT NULL,
	provider_calendar_id text NOT NULL
		CHECK (char_length(provider_calendar_id) BETWEEN 1 AND 1024),
	summary text NOT NULL,
	summary_override text,
	description text,
	timezone text,
	color_id text,
	background_color text,
	foreground_color text,
	access_role text NOT NULL
		CHECK (
			access_role IN (
				'freeBusyReader',
				'reader',
				'writerWithoutPrivateAccess',
				'writer',
				'owner'
			)
		),
	is_primary boolean NOT NULL DEFAULT false,
	is_hidden boolean NOT NULL DEFAULT false,
	is_selected_in_google boolean NOT NULL DEFAULT false,
	read_enabled boolean NOT NULL DEFAULT false,
	availability_enabled boolean NOT NULL DEFAULT false,
	analysis_enabled boolean NOT NULL DEFAULT false,
	sync_enabled boolean NOT NULL DEFAULT false,
	provider_deleted_at timestamptz,
	last_discovered_at timestamptz NOT NULL DEFAULT now(),
	last_seen_at timestamptz NOT NULL DEFAULT now(),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz,
	UNIQUE (id, user_id),
	CONSTRAINT user_calendar_sources_connection_owner_fkey
		FOREIGN KEY (connection_id, user_id)
		REFERENCES public.user_calendar_connections(id, user_id)
		ON DELETE CASCADE,
	CHECK (NOT sync_enabled OR read_enabled),
	CHECK (
		NOT sync_enabled
		OR access_role IN ('writerWithoutPrivateAccess', 'writer', 'owner')
	),
	CHECK (
		access_role <> 'freeBusyReader'
		OR (
			NOT read_enabled
			AND NOT analysis_enabled
			AND NOT sync_enabled
		)
	)
);

CREATE UNIQUE INDEX user_calendar_sources_connection_calendar_active_idx
	ON public.user_calendar_sources (connection_id, provider_calendar_id)
	WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX user_calendar_sources_one_primary_per_connection_idx
	ON public.user_calendar_sources (connection_id)
	WHERE is_primary AND deleted_at IS NULL;

CREATE INDEX user_calendar_sources_user_read_idx
	ON public.user_calendar_sources (user_id, read_enabled)
	WHERE deleted_at IS NULL;

CREATE INDEX user_calendar_sources_connection_sync_idx
	ON public.user_calendar_sources (connection_id, sync_enabled)
	WHERE deleted_at IS NULL;

CREATE INDEX user_calendar_sources_user_provider_calendar_idx
	ON public.user_calendar_sources (user_id, provider_calendar_id)
	WHERE deleted_at IS NULL;

CREATE TABLE public.calendar_access_audit_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	connection_id uuid REFERENCES public.user_calendar_connections(id) ON DELETE SET NULL,
	calendar_source_id uuid REFERENCES public.user_calendar_sources(id) ON DELETE SET NULL,
	operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 100),
	outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked')),
	reason_code text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calendar_access_audit_events_user_created_idx
	ON public.calendar_access_audit_events (user_id, created_at DESC);

CREATE INDEX calendar_access_audit_events_connection_created_idx
	ON public.calendar_access_audit_events (connection_id, created_at DESC)
	WHERE connection_id IS NOT NULL;

-- Provider creation and local mapping cannot share a transaction. If the mapping write fails and
-- compensating provider deletion also fails, this service-only receipt retains the minimum
-- identity needed for deterministic repair without exposing event content.
CREATE TABLE public.calendar_event_orphan_receipts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	calendar_source_id uuid NOT NULL,
	provider_event_id text NOT NULL CHECK (char_length(provider_event_id) BETWEEN 1 AND 2048),
	entity_kind text NOT NULL CHECK (entity_kind IN ('onto_event', 'task', 'time_block')),
	entity_id uuid NOT NULL,
	operation text NOT NULL DEFAULT 'create_mapping'
		CHECK (operation = 'create_mapping'),
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'repairing', 'resolved', 'abandoned')),
	reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 1 AND 100),
	attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
	last_attempted_at timestamptz,
	resolved_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT calendar_event_orphan_receipts_source_owner_fkey
		FOREIGN KEY (calendar_source_id, user_id)
		REFERENCES public.user_calendar_sources(id, user_id)
		ON DELETE CASCADE
);

CREATE UNIQUE INDEX calendar_event_orphan_receipts_pending_identity_idx
	ON public.calendar_event_orphan_receipts (
		user_id,
		calendar_source_id,
		provider_event_id,
		operation
	)
	WHERE resolved_at IS NULL;

CREATE INDEX calendar_event_orphan_receipts_pending_idx
	ON public.calendar_event_orphan_receipts (status, created_at)
	WHERE resolved_at IS NULL;

ALTER TABLE public.user_calendar_preferences
	ADD COLUMN default_write_calendar_source_id uuid
		REFERENCES public.user_calendar_sources(id) ON DELETE SET NULL;

ALTER TABLE public.project_calendars
	ADD COLUMN calendar_source_id uuid;

ALTER TABLE public.project_calendars
	ADD CONSTRAINT project_calendars_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (calendar_source_id);

CREATE INDEX project_calendars_calendar_source_idx
	ON public.project_calendars (calendar_source_id)
	WHERE calendar_source_id IS NOT NULL;

ALTER TABLE public.calendar_webhook_channels
	ADD COLUMN calendar_source_id uuid;

ALTER TABLE public.calendar_webhook_channels
	ADD CONSTRAINT calendar_webhook_channels_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (calendar_source_id);

CREATE UNIQUE INDEX calendar_webhook_channels_source_idx
	ON public.calendar_webhook_channels (calendar_source_id)
	WHERE calendar_source_id IS NOT NULL;

-- calendar_id has always referenced project_calendars.id. Rename it now, when it becomes nullable,
-- so new user-scoped sync code cannot mistake it for a Google calendar ID.
ALTER TABLE public.onto_event_sync
	RENAME COLUMN calendar_id TO project_calendar_id;

ALTER TABLE public.onto_event_sync
	RENAME CONSTRAINT onto_event_sync_calendar_id_fkey
	TO onto_event_sync_project_calendar_id_fkey;

ALTER TABLE public.onto_event_sync
	ALTER COLUMN project_calendar_id DROP NOT NULL,
	ADD COLUMN calendar_source_id uuid,
	ADD COLUMN external_calendar_id text;

ALTER TABLE public.onto_event_sync
	ADD CONSTRAINT onto_event_sync_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (calendar_source_id),
	ADD CONSTRAINT onto_event_sync_source_requires_user_check
	CHECK (calendar_source_id IS NULL OR user_id IS NOT NULL);

CREATE INDEX onto_event_sync_calendar_source_external_event_idx
	ON public.onto_event_sync (calendar_source_id, external_event_id)
	WHERE calendar_source_id IS NOT NULL;

ALTER TABLE public.task_calendar_events
	ADD COLUMN calendar_source_id uuid;

ALTER TABLE public.task_calendar_events
	ADD CONSTRAINT task_calendar_events_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (calendar_source_id);

CREATE INDEX task_calendar_events_source_event_idx
	ON public.task_calendar_events (calendar_source_id, calendar_event_id)
	WHERE calendar_source_id IS NOT NULL;

ALTER TABLE public.time_blocks
	ADD COLUMN calendar_source_id uuid;

ALTER TABLE public.time_blocks
	ADD CONSTRAINT time_blocks_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (calendar_source_id);

CREATE INDEX time_blocks_calendar_source_event_idx
	ON public.time_blocks (calendar_source_id, calendar_event_id)
	WHERE calendar_source_id IS NOT NULL;

ALTER TABLE public.recurring_task_instances
	ADD COLUMN calendar_source_id uuid;

ALTER TABLE public.recurring_task_instances
	ADD CONSTRAINT recurring_task_instances_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (calendar_source_id),
	ADD CONSTRAINT recurring_task_instances_source_requires_user_check
	CHECK (calendar_source_id IS NULL OR user_id IS NOT NULL);

CREATE INDEX recurring_task_instances_calendar_source_event_idx
	ON public.recurring_task_instances (calendar_source_id, calendar_event_id)
	WHERE calendar_source_id IS NOT NULL;

ALTER TABLE public.scheduled_sms_messages
	ADD COLUMN calendar_source_id uuid;

ALTER TABLE public.scheduled_sms_messages
	ADD CONSTRAINT scheduled_sms_messages_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (calendar_source_id);

CREATE INDEX scheduled_sms_messages_calendar_source_event_idx
	ON public.scheduled_sms_messages (calendar_source_id, calendar_event_id)
	WHERE calendar_source_id IS NOT NULL;

ALTER TABLE public.tasks
	ADD COLUMN source_calendar_source_id uuid;

ALTER TABLE public.tasks
	ADD CONSTRAINT tasks_source_calendar_source_owner_fkey
	FOREIGN KEY (source_calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (source_calendar_source_id);

ALTER TABLE public.draft_tasks
	ADD COLUMN source_calendar_source_id uuid;

ALTER TABLE public.draft_tasks
	ADD CONSTRAINT draft_tasks_source_calendar_source_owner_fkey
	FOREIGN KEY (source_calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (source_calendar_source_id);

ALTER TABLE public.calendar_analysis_events
	ADD COLUMN calendar_source_id uuid
		REFERENCES public.user_calendar_sources(id) ON DELETE SET NULL;

CREATE INDEX calendar_analysis_events_calendar_source_event_idx
	ON public.calendar_analysis_events (calendar_source_id, calendar_event_id)
	WHERE calendar_source_id IS NOT NULL;

ALTER TABLE public.calendar_analyses
	ADD COLUMN calendar_source_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.user_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connection_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_calendar_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_access_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_orphan_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_calendar_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.calendar_connection_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.calendar_oauth_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_calendar_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.calendar_access_audit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.calendar_event_orphan_receipts FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.user_calendar_connections TO authenticated;
GRANT SELECT ON TABLE public.user_calendar_sources TO authenticated;

GRANT ALL ON TABLE public.user_calendar_connections TO service_role;
GRANT ALL ON TABLE public.calendar_connection_credentials TO service_role;
GRANT ALL ON TABLE public.calendar_oauth_states TO service_role;
GRANT ALL ON TABLE public.user_calendar_sources TO service_role;
GRANT ALL ON TABLE public.calendar_access_audit_events TO service_role;
GRANT ALL ON TABLE public.calendar_event_orphan_receipts TO service_role;

CREATE POLICY user_calendar_connections_owner_select
	ON public.user_calendar_connections FOR SELECT
	TO authenticated
	USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY user_calendar_connections_service_role_all
	ON public.user_calendar_connections FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY calendar_connection_credentials_service_role_all
	ON public.calendar_connection_credentials FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY calendar_oauth_states_service_role_all
	ON public.calendar_oauth_states FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY user_calendar_sources_owner_select
	ON public.user_calendar_sources FOR SELECT
	TO authenticated
	USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY user_calendar_sources_service_role_all
	ON public.user_calendar_sources FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY calendar_access_audit_events_service_role_all
	ON public.calendar_access_audit_events FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY calendar_event_orphan_receipts_service_role_all
	ON public.calendar_event_orphan_receipts FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- Webhook and incremental-sync tokens are secrets. Existing authenticated CRUD access is removed
-- now, before connection-aware webhook work begins.
DROP POLICY IF EXISTS calendar_webhook_channels_own_all
	ON public.calendar_webhook_channels;
REVOKE ALL ON TABLE public.calendar_webhook_channels FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.calendar_webhook_channels TO service_role;

CREATE POLICY calendar_webhook_channels_service_role_all
	ON public.calendar_webhook_channels FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enforce_calendar_connection_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	active_connection_count integer;
BEGIN
	IF NEW.provider <> 'google_calendar' OR NEW.deleted_at IS NOT NULL THEN
		RETURN NEW;
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 1));

	SELECT count(*)
	INTO active_connection_count
	FROM public.user_calendar_connections AS connection
	WHERE connection.user_id = NEW.user_id
		AND connection.provider = 'google_calendar'
		AND connection.deleted_at IS NULL
		AND connection.id <> NEW.id;

	IF active_connection_count >= 5 THEN
		RAISE EXCEPTION 'calendar_connection_limit_exceeded'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_calendar_connection_limit_trigger
	BEFORE INSERT OR UPDATE OF user_id, provider, deleted_at
	ON public.user_calendar_connections
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_calendar_connection_limit();

CREATE OR REPLACE FUNCTION public.validate_default_calendar_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF NEW.default_write_calendar_source_id IS NULL THEN
		RETURN NEW;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM public.user_calendar_sources AS source
		JOIN public.user_calendar_connections AS connection
			ON connection.id = source.connection_id
			AND connection.user_id = source.user_id
		WHERE source.id = NEW.default_write_calendar_source_id
			AND source.user_id = NEW.user_id
			AND source.access_role IN ('writerWithoutPrivateAccess', 'writer', 'owner')
			AND source.provider_deleted_at IS NULL
			AND source.deleted_at IS NULL
			AND connection.status = 'active'
			AND connection.deleted_at IS NULL
	) THEN
		RAISE EXCEPTION 'calendar_default_source_not_eligible'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

CREATE TRIGGER validate_default_calendar_source_trigger
	BEFORE INSERT OR UPDATE OF user_id, default_write_calendar_source_id
	ON public.user_calendar_preferences
	FOR EACH ROW
	EXECUTE FUNCTION public.validate_default_calendar_source();

CREATE OR REPLACE FUNCTION public.consume_calendar_oauth_state(
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
	state_row public.calendar_oauth_states%ROWTYPE;
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT state.*
	INTO state_row
	FROM public.calendar_oauth_states AS state
	WHERE state.state_hash = p_state_hash
		AND state.user_id = p_user_id
		AND state.oauth_client_kind = p_oauth_client_kind
		AND state.consumed_at IS NULL
		AND state.expires_at > now()
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN;
	END IF;

	UPDATE public.calendar_oauth_states
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

REVOKE ALL ON FUNCTION public.consume_calendar_oauth_state(text, uuid, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_calendar_oauth_state(text, uuid, text)
	TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_google_calendar_connection(
	p_user_id uuid,
	p_expected_connection_id uuid,
	p_new_connection_id uuid,
	p_provider_account_id text,
	p_email_address text,
	p_display_name text,
	p_default_account_label text,
	p_oauth_client_kind text,
	p_access_token_ciphertext text,
	p_refresh_token_ciphertext text,
	p_access_token_expires_at timestamptz,
	p_refresh_token_expires_at timestamptz,
	p_token_type text,
	p_granted_scopes text[],
	p_key_version integer
)
RETURNS SETOF public.user_calendar_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	connection_row public.user_calendar_connections%ROWTYPE;
	calendar_scope constant text := 'https://www.googleapis.com/auth/calendar';
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF p_oauth_client_kind NOT IN ('google_calendar', 'google_shared_login') THEN
		RAISE EXCEPTION 'calendar_oauth_client_kind_invalid' USING ERRCODE = 'check_violation';
	END IF;

	IF NOT calendar_scope = ANY(COALESCE(p_granted_scopes, '{}'::text[])) THEN
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
$$;

REVOKE ALL ON FUNCTION public.upsert_google_calendar_connection(
	uuid, uuid, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz,
	text, text[], integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_calendar_connection(
	uuid, uuid, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz,
	text, text[], integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.rotate_google_calendar_credentials(
	p_user_id uuid,
	p_connection_id uuid,
	p_oauth_client_kind text,
	p_access_token_ciphertext text,
	p_refresh_token_ciphertext text,
	p_access_token_expires_at timestamptz,
	p_refresh_token_expires_at timestamptz,
	p_token_type text,
	p_granted_scopes text[],
	p_key_version integer
)
RETURNS SETOF public.user_calendar_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	connection_row public.user_calendar_connections%ROWTYPE;
	credential_client_kind text;
	calendar_scope constant text := 'https://www.googleapis.com/auth/calendar';
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

	IF NOT calendar_scope = ANY(COALESCE(p_granted_scopes, '{}'::text[])) THEN
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
$$;

REVOKE ALL ON FUNCTION public.rotate_google_calendar_credentials(
	uuid, uuid, text, text, text, timestamptz, timestamptz, text, text[], integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_google_calendar_credentials(
	uuid, uuid, text, text, text, timestamptz, timestamptz, text, text[], integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_calendar_connection_reconnect_required(
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
	FROM public.user_calendar_connections AS connection
	WHERE connection.id = p_connection_id
		AND connection.user_id = p_user_id
		AND connection.provider = 'google_calendar'
		AND connection.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'calendar_connection_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	UPDATE public.user_calendar_connections
	SET status = 'reconnect_required',
		updated_at = now()
	WHERE id = p_connection_id;

	UPDATE public.calendar_connection_credentials
	SET revoked_at = COALESCE(revoked_at, now()),
		updated_at = now()
	WHERE connection_id = p_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_calendar_connection_reconnect_required(uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_calendar_connection_reconnect_required(uuid, uuid)
	TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_google_calendar_source(
	p_user_id uuid,
	p_connection_id uuid,
	p_provider_calendar_id text,
	p_summary text,
	p_summary_override text,
	p_description text,
	p_timezone text,
	p_color_id text,
	p_background_color text,
	p_foreground_color text,
	p_access_role text,
	p_is_primary boolean,
	p_is_hidden boolean,
	p_is_selected_in_google boolean
)
RETURNS SETOF public.user_calendar_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	source_row public.user_calendar_sources%ROWTYPE;
	default_candidate uuid;
	enable_content boolean;
	enable_sync boolean;
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF p_access_role NOT IN (
		'freeBusyReader',
		'reader',
		'writerWithoutPrivateAccess',
		'writer',
		'owner'
	) THEN
		RAISE EXCEPTION 'calendar_source_access_role_invalid'
			USING ERRCODE = 'check_violation';
	END IF;

	PERFORM 1
	FROM public.user_calendar_connections AS connection
	WHERE connection.id = p_connection_id
		AND connection.user_id = p_user_id
		AND connection.status = 'active'
		AND connection.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'calendar_connection_not_active' USING ERRCODE = 'no_data_found';
	END IF;

	SELECT source.*
	INTO source_row
	FROM public.user_calendar_sources AS source
	WHERE source.connection_id = p_connection_id
		AND source.provider_calendar_id = p_provider_calendar_id
		AND source.deleted_at IS NULL
	FOR UPDATE;

	IF COALESCE(p_is_primary, false) THEN
		UPDATE public.user_calendar_sources
		SET is_primary = false,
			updated_at = now()
		WHERE connection_id = p_connection_id
			AND is_primary
			AND deleted_at IS NULL
			AND id IS DISTINCT FROM source_row.id;
	END IF;

	enable_content := COALESCE(p_is_primary, false) AND p_access_role <> 'freeBusyReader';
	enable_sync := COALESCE(p_is_primary, false)
		AND p_access_role IN ('writerWithoutPrivateAccess', 'writer', 'owner');

	IF source_row.id IS NULL THEN
		INSERT INTO public.user_calendar_sources (
			user_id,
			connection_id,
			provider_calendar_id,
			summary,
			summary_override,
			description,
			timezone,
			color_id,
			background_color,
			foreground_color,
			access_role,
			is_primary,
			is_hidden,
			is_selected_in_google,
			read_enabled,
			availability_enabled,
			analysis_enabled,
			sync_enabled
		)
		VALUES (
			p_user_id,
			p_connection_id,
			p_provider_calendar_id,
			COALESCE(p_summary, ''),
			nullif(p_summary_override, ''),
			nullif(p_description, ''),
			nullif(p_timezone, ''),
			nullif(p_color_id, ''),
			nullif(p_background_color, ''),
			nullif(p_foreground_color, ''),
			p_access_role,
			COALESCE(p_is_primary, false),
			COALESCE(p_is_hidden, false),
			COALESCE(p_is_selected_in_google, false),
			enable_content,
			COALESCE(p_is_primary, false),
			enable_content,
			enable_sync
		)
		RETURNING * INTO source_row;
	ELSE
		IF p_access_role NOT IN ('writerWithoutPrivateAccess', 'writer', 'owner') THEN
			UPDATE public.user_calendar_preferences
			SET default_write_calendar_source_id = NULL,
				updated_at = now()
			WHERE user_id = p_user_id
				AND default_write_calendar_source_id = source_row.id;
		END IF;

		UPDATE public.user_calendar_sources
		SET summary = COALESCE(p_summary, ''),
			summary_override = nullif(p_summary_override, ''),
			description = nullif(p_description, ''),
			timezone = nullif(p_timezone, ''),
			color_id = nullif(p_color_id, ''),
			background_color = nullif(p_background_color, ''),
			foreground_color = nullif(p_foreground_color, ''),
			access_role = p_access_role,
			is_primary = COALESCE(p_is_primary, false),
			is_hidden = COALESCE(p_is_hidden, false),
			is_selected_in_google = COALESCE(p_is_selected_in_google, false),
			read_enabled = CASE
				WHEN p_access_role = 'freeBusyReader' THEN false
				ELSE read_enabled
			END,
			analysis_enabled = CASE
				WHEN p_access_role = 'freeBusyReader' THEN false
				ELSE analysis_enabled
			END,
			sync_enabled = CASE
				WHEN p_access_role NOT IN ('writerWithoutPrivateAccess', 'writer', 'owner') THEN false
				ELSE sync_enabled
			END,
			provider_deleted_at = NULL,
			last_discovered_at = now(),
			last_seen_at = now(),
			updated_at = now()
		WHERE id = source_row.id
		RETURNING * INTO source_row;
	END IF;

	IF source_row.is_primary
		AND source_row.access_role IN ('writerWithoutPrivateAccess', 'writer', 'owner') THEN
		SELECT preferences.default_write_calendar_source_id
		INTO default_candidate
		FROM public.user_calendar_preferences AS preferences
		WHERE preferences.user_id = p_user_id;

		IF default_candidate IS NULL THEN
			INSERT INTO public.user_calendar_preferences (
				user_id,
				default_write_calendar_source_id
			)
			VALUES (p_user_id, source_row.id)
			ON CONFLICT (user_id) DO UPDATE
			SET default_write_calendar_source_id = COALESCE(
				public.user_calendar_preferences.default_write_calendar_source_id,
				EXCLUDED.default_write_calendar_source_id
			),
			updated_at = now();
		END IF;
	END IF;

	RETURN NEXT source_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_google_calendar_source(
	uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_google_calendar_source(
	uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, boolean, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.set_default_calendar_source(
	p_user_id uuid,
	p_calendar_source_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF auth.role() NOT IN ('authenticated', 'service_role') THEN
		RAISE EXCEPTION 'authenticated_role_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'calendar_source_owner_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	INSERT INTO public.user_calendar_preferences (
		user_id,
		default_write_calendar_source_id
	)
	VALUES (p_user_id, p_calendar_source_id)
	ON CONFLICT (user_id) DO UPDATE
	SET default_write_calendar_source_id = EXCLUDED.default_write_calendar_source_id,
		updated_at = now();

	RETURN p_calendar_source_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_calendar_source(uuid, uuid)
	FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_calendar_source(uuid, uuid)
	TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_calendar_source_preferences(
	p_user_id uuid,
	p_calendar_source_id uuid,
	p_read_enabled boolean DEFAULT NULL,
	p_availability_enabled boolean DEFAULT NULL,
	p_analysis_enabled boolean DEFAULT NULL,
	p_sync_enabled boolean DEFAULT NULL
)
RETURNS SETOF public.user_calendar_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	source_row public.user_calendar_sources%ROWTYPE;
	next_read_enabled boolean;
	next_availability_enabled boolean;
	next_analysis_enabled boolean;
	next_sync_enabled boolean;
BEGIN
	IF auth.role() NOT IN ('authenticated', 'service_role') THEN
		RAISE EXCEPTION 'authenticated_role_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'calendar_source_owner_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT source.*
	INTO source_row
	FROM public.user_calendar_sources AS source
	JOIN public.user_calendar_connections AS connection
		ON connection.id = source.connection_id
		AND connection.user_id = source.user_id
	WHERE source.id = p_calendar_source_id
		AND source.user_id = p_user_id
		AND source.provider_deleted_at IS NULL
		AND source.deleted_at IS NULL
		AND connection.status = 'active'
		AND connection.deleted_at IS NULL
	FOR UPDATE OF source;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'calendar_source_not_active' USING ERRCODE = 'no_data_found';
	END IF;

	next_read_enabled := COALESCE(p_read_enabled, source_row.read_enabled);
	next_availability_enabled := COALESCE(
		p_availability_enabled,
		source_row.availability_enabled
	);
	next_analysis_enabled := COALESCE(p_analysis_enabled, source_row.analysis_enabled);
	next_sync_enabled := COALESCE(p_sync_enabled, source_row.sync_enabled);

	IF next_sync_enabled AND NOT next_read_enabled THEN
		RAISE EXCEPTION 'calendar_sync_requires_read'
			USING ERRCODE = 'check_violation';
	END IF;

	IF source_row.access_role = 'freeBusyReader'
		AND (next_read_enabled OR next_analysis_enabled OR next_sync_enabled) THEN
		RAISE EXCEPTION 'calendar_source_freebusy_only'
			USING ERRCODE = 'check_violation';
	END IF;

	IF next_sync_enabled
		AND source_row.access_role NOT IN ('writerWithoutPrivateAccess', 'writer', 'owner') THEN
		RAISE EXCEPTION 'calendar_source_not_writable'
			USING ERRCODE = 'check_violation';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.user_calendar_sources AS duplicate_source
		JOIN public.user_calendar_connections AS duplicate_connection
			ON duplicate_connection.id = duplicate_source.connection_id
			AND duplicate_connection.user_id = duplicate_source.user_id
		WHERE duplicate_source.id <> source_row.id
			AND duplicate_source.user_id = p_user_id
			AND duplicate_source.provider_calendar_id = source_row.provider_calendar_id
			AND duplicate_source.deleted_at IS NULL
			AND duplicate_source.provider_deleted_at IS NULL
			AND duplicate_connection.status = 'active'
			AND duplicate_connection.deleted_at IS NULL
			AND (
				(next_read_enabled AND duplicate_source.read_enabled)
				OR (
					next_availability_enabled
					AND duplicate_source.availability_enabled
				)
				OR (next_analysis_enabled AND duplicate_source.analysis_enabled)
				OR (next_sync_enabled AND duplicate_source.sync_enabled)
			)
	) THEN
		RAISE EXCEPTION 'calendar_source_duplicate_enabled'
			USING ERRCODE = 'unique_violation';
	END IF;

	UPDATE public.user_calendar_sources
	SET read_enabled = next_read_enabled,
		availability_enabled = next_availability_enabled,
		analysis_enabled = next_analysis_enabled,
		sync_enabled = next_sync_enabled,
		updated_at = now()
	WHERE id = source_row.id
	RETURNING * INTO source_row;

	RETURN NEXT source_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_calendar_source_preferences(
	uuid, uuid, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_calendar_source_preferences(
	uuid, uuid, boolean, boolean, boolean, boolean
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.disable_calendar_connection(
	p_user_id uuid,
	p_connection_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	promoted_source_id uuid;
BEGIN
	IF auth.role() <> 'service_role' THEN
		RAISE EXCEPTION 'service_role_required' USING ERRCODE = 'insufficient_privilege';
	END IF;

	PERFORM 1
	FROM public.user_calendar_connections AS connection
	WHERE connection.id = p_connection_id
		AND connection.user_id = p_user_id
		AND connection.provider = 'google_calendar'
		AND connection.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'calendar_connection_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	UPDATE public.user_calendar_connections
	SET status = 'disabled',
		deleted_at = now(),
		updated_at = now()
	WHERE id = p_connection_id;

	UPDATE public.calendar_connection_credentials
	SET revoked_at = COALESCE(revoked_at, now()),
		updated_at = now()
	WHERE connection_id = p_connection_id;

	UPDATE public.user_calendar_sources
	SET read_enabled = false,
		availability_enabled = false,
		analysis_enabled = false,
		sync_enabled = false,
		deleted_at = COALESCE(deleted_at, now()),
		updated_at = now()
	WHERE connection_id = p_connection_id
		AND deleted_at IS NULL;

	SELECT source.id
	INTO promoted_source_id
	FROM public.user_calendar_sources AS source
	JOIN public.user_calendar_connections AS connection
		ON connection.id = source.connection_id
		AND connection.user_id = source.user_id
	WHERE source.user_id = p_user_id
		AND source.is_primary
		AND source.access_role IN ('writerWithoutPrivateAccess', 'writer', 'owner')
		AND source.provider_deleted_at IS NULL
		AND source.deleted_at IS NULL
		AND connection.status = 'active'
		AND connection.deleted_at IS NULL
	ORDER BY connection.connected_at, source.created_at, source.id
	LIMIT 1;

	INSERT INTO public.user_calendar_preferences (
		user_id,
		default_write_calendar_source_id
	)
	VALUES (p_user_id, promoted_source_id)
	ON CONFLICT (user_id) DO UPDATE
	SET default_write_calendar_source_id = EXCLUDED.default_write_calendar_source_id,
		updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.disable_calendar_connection(uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disable_calendar_connection(uuid, uuid)
	TO service_role;

COMMENT ON TABLE public.user_calendar_connections IS
	'One Google Calendar identity and OAuth grant per BuildOS user connection.';
COMMENT ON TABLE public.calendar_connection_credentials IS
	'Server-only encrypted Calendar credentials keyed by connection and issuing OAuth client.';
COMMENT ON TABLE public.calendar_oauth_states IS
	'Server-only hashed, expiring, single-use Calendar OAuth state and PKCE material.';
COMMENT ON TABLE public.user_calendar_sources IS
	'Canonical Google calendar resources discovered through a specific Calendar connection.';
COMMENT ON TABLE public.calendar_access_audit_events IS
	'Content-free Calendar provider access audit events. Never store event content or secrets.';
COMMENT ON TABLE public.calendar_event_orphan_receipts IS
	'Service-only source-qualified provider event identities awaiting mapping repair or cleanup.';
COMMENT ON COLUMN public.onto_event_sync.project_calendar_id IS
	'Optional internal project_calendars.id. This is not a Google calendar identifier.';
COMMENT ON COLUMN public.onto_event_sync.external_calendar_id IS
	'Diagnostic snapshot of the canonical provider calendar ID; routing uses calendar_source_id.';

COMMIT;
