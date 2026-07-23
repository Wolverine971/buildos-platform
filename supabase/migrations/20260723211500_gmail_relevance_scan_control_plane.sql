-- supabase/migrations/20260723211500_gmail_relevance_scan_control_plane.sql
-- Gmail relevance Phase A, Slice 2: content-free synthetic scan control plane.
--
-- This migration intentionally contains no provider cursor, message observation, candidate,
-- mailbox content, Gmail gateway, queue registration, or model path. Apply only through the
-- exact-file forward protocol documented in
-- apps/web/docs/technical/email/SUPABASE-MIGRATION-LEDGER-BASELINE.md.

BEGIN;

CREATE OR REPLACE FUNCTION public.email_relevance_scan_configuration_is_valid(
	p_configuration jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
	connection_count integer;
	project_count integer;
	connection_entry jsonb;
	project_entry jsonb;
	per_connection_budgets jsonb;
	global_budgets jsonb;
BEGIN
	IF jsonb_typeof(p_configuration) <> 'object'
		OR NOT p_configuration ?& ARRAY[
			'manifest_schema_version',
			'control_plane_version',
			'serializer_version',
			'profile_compiler_version',
			'quota_policy_version',
			'query_policy_version',
			'start_mode',
			'user_id',
			'connection_ids',
			'projects',
			'window_start',
			'window_end',
			'expires_at',
			'message_cap_per_connection',
			'metadata_batch_ceiling',
			'per_connection_budgets',
			'global_budgets'
		]
		OR p_configuration - ARRAY[
			'manifest_schema_version',
			'control_plane_version',
			'serializer_version',
			'profile_compiler_version',
			'quota_policy_version',
			'query_policy_version',
			'start_mode',
			'user_id',
			'connection_ids',
			'projects',
			'window_start',
			'window_end',
			'expires_at',
			'message_cap_per_connection',
			'metadata_batch_ceiling',
			'per_connection_budgets',
			'global_budgets'
		] <> '{}'::jsonb
	THEN
		RETURN false;
	END IF;

	IF p_configuration->>'manifest_schema_version' <> 'email-relevance-scan-manifest-v1'
		OR p_configuration->>'control_plane_version' <> 'email-relevance-scan-control-plane-v1'
		OR p_configuration->>'serializer_version' <> 'email-relevance-scan-serializer-v1'
		OR p_configuration->>'profile_compiler_version' <> 'project-email-profile-v1'
		OR p_configuration->>'quota_policy_version' <> 'email-relevance-gmail-quota-v1'
		OR p_configuration->>'query_policy_version' <> 'inbox-sent-exclude-spam-trash-drafts-v1'
		OR p_configuration->>'start_mode' <> 'manual'
		OR (p_configuration->>'message_cap_per_connection')::integer <> 1000
		OR (p_configuration->>'metadata_batch_ceiling')::integer <> 50
		OR octet_length(p_configuration::text) > 16384
	THEN
		RETURN false;
	END IF;

	PERFORM (p_configuration->>'user_id')::uuid;
	PERFORM (p_configuration->>'window_start')::timestamptz;
	PERFORM (p_configuration->>'window_end')::timestamptz;
	PERFORM (p_configuration->>'expires_at')::timestamptz;

	IF (p_configuration->>'window_end')::timestamptz
		- (p_configuration->>'window_start')::timestamptz <> interval '30 days'
	THEN
		RETURN false;
	END IF;

	IF jsonb_typeof(p_configuration->'connection_ids') <> 'array'
		OR jsonb_typeof(p_configuration->'projects') <> 'array'
	THEN
		RETURN false;
	END IF;

	connection_count := jsonb_array_length(p_configuration->'connection_ids');
	project_count := jsonb_array_length(p_configuration->'projects');
	IF connection_count NOT BETWEEN 1 AND 3 OR project_count NOT BETWEEN 1 AND 25 THEN
		RETURN false;
	END IF;

	IF (
		SELECT count(DISTINCT entry.value)
		FROM jsonb_array_elements_text(p_configuration->'connection_ids') AS entry(value)
	) <> connection_count
		OR p_configuration->'connection_ids' <> (
			SELECT jsonb_agg(entry.value ORDER BY entry.value COLLATE "C")
			FROM jsonb_array_elements_text(p_configuration->'connection_ids') AS entry(value)
		)
	THEN
		RETURN false;
	END IF;

	FOR connection_entry IN
		SELECT value
		FROM jsonb_array_elements(p_configuration->'connection_ids')
	LOOP
		IF jsonb_typeof(connection_entry) <> 'string' THEN
			RETURN false;
		END IF;
		PERFORM trim(both '"' from connection_entry::text)::uuid;
	END LOOP;

	IF (
		SELECT count(DISTINCT entry.value->>'project_id')
		FROM jsonb_array_elements(p_configuration->'projects') AS entry(value)
	) <> project_count
		OR (
			SELECT count(DISTINCT entry.value->>'profile_id')
			FROM jsonb_array_elements(p_configuration->'projects') AS entry(value)
		) <> project_count
		OR p_configuration->'projects' <> (
			SELECT jsonb_agg(
				entry.value
				ORDER BY
					entry.value->>'project_id' COLLATE "C",
					entry.value->>'profile_id' COLLATE "C"
			)
			FROM jsonb_array_elements(p_configuration->'projects') AS entry(value)
		)
	THEN
		RETURN false;
	END IF;

	FOR project_entry IN
		SELECT value
		FROM jsonb_array_elements(p_configuration->'projects')
	LOOP
		IF jsonb_typeof(project_entry) <> 'object'
			OR NOT project_entry ?& ARRAY[
				'project_id',
				'profile_id',
				'profile_version',
				'profile_hash'
			]
			OR project_entry - ARRAY[
				'project_id',
				'profile_id',
				'profile_version',
				'profile_hash'
			] <> '{}'::jsonb
			OR (project_entry->>'profile_version')::integer < 1
			OR project_entry->>'profile_hash' !~ '^[a-f0-9]{64}$'
		THEN
			RETURN false;
		END IF;
		PERFORM (project_entry->>'project_id')::uuid;
		PERFORM (project_entry->>'profile_id')::uuid;
	END LOOP;

	per_connection_budgets := p_configuration->'per_connection_budgets';
	global_budgets := p_configuration->'global_budgets';
	IF jsonb_typeof(per_connection_budgets) <> 'object'
		OR NOT per_connection_budgets ?& ARRAY[
			'gmail_quota_units',
			'runtime_ms',
			'raw_content_bytes',
			'model_tokens',
			'model_cost_micros'
		]
		OR per_connection_budgets - ARRAY[
			'gmail_quota_units',
			'runtime_ms',
			'raw_content_bytes',
			'model_tokens',
			'model_cost_micros'
		] <> '{}'::jsonb
		OR (per_connection_budgets->>'gmail_quota_units')::bigint <> 20050
		OR (per_connection_budgets->>'runtime_ms')::bigint <> 1200000
		OR (per_connection_budgets->>'raw_content_bytes')::bigint <> 0
		OR (per_connection_budgets->>'model_tokens')::bigint <> 0
		OR (per_connection_budgets->>'model_cost_micros')::bigint <> 0
	THEN
		RETURN false;
	END IF;

	IF jsonb_typeof(global_budgets) <> 'object'
		OR NOT global_budgets ?& ARRAY[
			'gmail_quota_units',
			'runtime_ms',
			'raw_content_bytes',
			'model_tokens',
			'model_cost_micros'
		]
		OR global_budgets - ARRAY[
			'gmail_quota_units',
			'runtime_ms',
			'raw_content_bytes',
			'model_tokens',
			'model_cost_micros'
		] <> '{}'::jsonb
		OR (global_budgets->>'gmail_quota_units')::bigint <> connection_count * 20050
		OR (global_budgets->>'runtime_ms')::bigint <> connection_count * 1200000
		OR (global_budgets->>'raw_content_bytes')::bigint <> 0
		OR (global_budgets->>'model_tokens')::bigint <> 0
		OR (global_budgets->>'model_cost_micros')::bigint <> 0
	THEN
		RETURN false;
	END IF;

	RETURN true;
EXCEPTION
	WHEN OTHERS THEN
		RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.email_relevance_scan_configuration_is_valid(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_relevance_scan_configuration_is_valid(jsonb)
	TO service_role;

CREATE TABLE public.email_relevance_scan_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
	state text NOT NULL DEFAULT 'pending' CHECK (
		state IN (
			'pending',
			'running',
			'paused',
			'completed',
			'partial',
			'cancelled',
			'quota_stopped',
			'failed',
			'expired'
		)
	),
	terminal_reason_code text CHECK (
		terminal_reason_code IS NULL OR terminal_reason_code IN (
			'completed',
			'partial',
			'cancelled',
			'budget_exceeded',
			'retry_exhausted',
			'connection_disconnected',
			'project_unavailable',
			'manifest_expired',
			'internal_error'
		)
	),
	pause_requested_at timestamptz,
	cancel_requested_at timestamptz,
	window_start timestamptz NOT NULL,
	window_end timestamptz NOT NULL,
	message_cap_per_connection integer NOT NULL CHECK (message_cap_per_connection = 1000),
	query_policy_version text NOT NULL CHECK (
		query_policy_version = 'inbox-sent-exclude-spam-trash-drafts-v1'
	),
	control_plane_version text NOT NULL CHECK (
		control_plane_version = 'email-relevance-scan-control-plane-v1'
	),
	serializer_version text NOT NULL CHECK (
		serializer_version = 'email-relevance-scan-serializer-v1'
	),
	quota_policy_version text NOT NULL CHECK (
		quota_policy_version = 'email-relevance-gmail-quota-v1'
	),
	manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
	configuration jsonb NOT NULL CHECK (
		public.email_relevance_scan_configuration_is_valid(configuration)
	),
	gmail_quota_budget bigint NOT NULL CHECK (gmail_quota_budget > 0),
	gmail_quota_reserved bigint NOT NULL DEFAULT 0 CHECK (gmail_quota_reserved >= 0),
	gmail_quota_used bigint NOT NULL DEFAULT 0 CHECK (gmail_quota_used >= 0),
	runtime_ms_budget bigint NOT NULL CHECK (runtime_ms_budget > 0),
	runtime_ms_reserved bigint NOT NULL DEFAULT 0 CHECK (runtime_ms_reserved >= 0),
	runtime_ms_used bigint NOT NULL DEFAULT 0 CHECK (runtime_ms_used >= 0),
	raw_content_byte_budget bigint NOT NULL DEFAULT 0 CHECK (raw_content_byte_budget = 0),
	model_token_budget bigint NOT NULL DEFAULT 0 CHECK (model_token_budget = 0),
	model_cost_budget_micros bigint NOT NULL DEFAULT 0 CHECK (model_cost_budget_micros = 0),
	connection_count integer NOT NULL CHECK (connection_count BETWEEN 1 AND 3),
	project_count integer NOT NULL CHECK (project_count BETWEEN 1 AND 25),
	steps_completed integer NOT NULL DEFAULT 0 CHECK (steps_completed >= 0),
	messages_seen integer NOT NULL DEFAULT 0 CHECK (messages_seen >= 0),
	expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	started_at timestamptz,
	completed_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (user_id, idempotency_key_hash),
	CHECK (window_end - window_start = interval '30 days'),
	CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours'),
	CHECK (gmail_quota_reserved + gmail_quota_used <= gmail_quota_budget),
	CHECK (runtime_ms_reserved + runtime_ms_used <= runtime_ms_budget),
	CHECK ((configuration->>'user_id')::uuid = user_id),
	CHECK ((configuration->>'window_start')::timestamptz = window_start),
	CHECK ((configuration->>'window_end')::timestamptz = window_end),
	CHECK ((configuration->>'expires_at')::timestamptz = expires_at),
	CHECK ((configuration->>'message_cap_per_connection')::integer = message_cap_per_connection),
	CHECK (configuration->>'query_policy_version' = query_policy_version),
	CHECK (configuration->>'control_plane_version' = control_plane_version),
	CHECK (configuration->>'serializer_version' = serializer_version),
	CHECK (configuration->>'quota_policy_version' = quota_policy_version),
	CHECK ((configuration->'global_budgets'->>'gmail_quota_units')::bigint = gmail_quota_budget),
	CHECK ((configuration->'global_budgets'->>'runtime_ms')::bigint = runtime_ms_budget)
);

CREATE INDEX email_relevance_scan_runs_user_created_idx
	ON public.email_relevance_scan_runs (user_id, created_at DESC);

CREATE INDEX email_relevance_scan_runs_active_expiry_idx
	ON public.email_relevance_scan_runs (expires_at)
	WHERE state IN ('pending', 'running', 'paused');

CREATE TABLE public.email_relevance_scan_projects (
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	project_id uuid NOT NULL,
	profile_id uuid NOT NULL,
	profile_version integer NOT NULL CHECK (profile_version > 0),
	profile_hash text NOT NULL CHECK (profile_hash ~ '^[a-f0-9]{64}$'),
	invalidated_at timestamptz,
	invalidation_reason_code text CHECK (
		invalidation_reason_code IS NULL OR invalidation_reason_code = 'project_unavailable'
	),
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (run_id, project_id),
	UNIQUE (run_id, profile_id),
	CHECK (
		(invalidated_at IS NULL AND invalidation_reason_code IS NULL)
		OR (invalidated_at IS NOT NULL AND invalidation_reason_code IS NOT NULL)
	)
);

CREATE INDEX email_relevance_scan_projects_project_idx
	ON public.email_relevance_scan_projects (project_id, run_id);

CREATE TABLE public.email_relevance_scan_connections (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	connection_id uuid REFERENCES public.user_email_connections(id) ON DELETE SET NULL,
	state text NOT NULL DEFAULT 'pending' CHECK (
		state IN (
			'pending',
			'leased',
			'retry_wait',
			'completed',
			'cancelled',
			'quota_stopped',
			'failed',
			'expired'
		)
	),
	terminal_reason_code text CHECK (
		terminal_reason_code IS NULL OR terminal_reason_code IN (
			'completed',
			'cancelled',
			'budget_exceeded',
			'retry_exhausted',
			'connection_disconnected',
			'project_unavailable',
			'manifest_expired',
			'internal_error'
		)
	),
	message_cap integer NOT NULL CHECK (message_cap = 1000),
	metadata_batch_ceiling integer NOT NULL CHECK (metadata_batch_ceiling = 50),
	gmail_quota_budget bigint NOT NULL CHECK (gmail_quota_budget = 20050),
	gmail_quota_reserved bigint NOT NULL DEFAULT 0 CHECK (gmail_quota_reserved >= 0),
	gmail_quota_used bigint NOT NULL DEFAULT 0 CHECK (gmail_quota_used >= 0),
	runtime_ms_budget bigint NOT NULL CHECK (runtime_ms_budget = 1200000),
	runtime_ms_reserved bigint NOT NULL DEFAULT 0 CHECK (runtime_ms_reserved >= 0),
	runtime_ms_used bigint NOT NULL DEFAULT 0 CHECK (runtime_ms_used >= 0),
	raw_content_byte_budget bigint NOT NULL DEFAULT 0 CHECK (raw_content_byte_budget = 0),
	model_token_budget bigint NOT NULL DEFAULT 0 CHECK (model_token_budget = 0),
	model_cost_budget_micros bigint NOT NULL DEFAULT 0 CHECK (model_cost_budget_micros = 0),
	checkpoint_version integer NOT NULL DEFAULT 0 CHECK (checkpoint_version >= 0),
	synthetic_step integer NOT NULL DEFAULT 0 CHECK (synthetic_step >= 0),
	steps_completed integer NOT NULL DEFAULT 0 CHECK (steps_completed >= 0),
	messages_seen integer NOT NULL DEFAULT 0 CHECK (
		messages_seen >= 0 AND messages_seen <= message_cap
	),
	total_attempts integer NOT NULL DEFAULT 0 CHECK (total_attempts >= 0),
	checkpoint_attempts integer NOT NULL DEFAULT 0 CHECK (
		checkpoint_attempts >= 0 AND checkpoint_attempts <= 3
	),
	max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts = 3),
	lease_token_hash text CHECK (lease_token_hash IS NULL OR lease_token_hash ~ '^[a-f0-9]{64}$'),
	lease_owner text CHECK (
		lease_owner IS NULL OR lease_owner ~ '^[a-z0-9_-]{1,64}$'
	),
	lease_expires_at timestamptz,
	next_attempt_at timestamptz,
	last_error_code text CHECK (
		last_error_code IS NULL OR last_error_code IN (
			'lease_expired',
			'stale_checkpoint',
			'stale_processing_token',
			'policy_unavailable',
			'accounting_unavailable',
			'budget_exceeded',
			'synthetic_retryable',
			'retry_exhausted',
			'connection_disconnected',
			'project_unavailable',
			'manifest_expired',
			'internal_error'
		)
	),
	created_at timestamptz NOT NULL DEFAULT now(),
	started_at timestamptz,
	completed_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (run_id, connection_id),
	CHECK (gmail_quota_reserved + gmail_quota_used <= gmail_quota_budget),
	CHECK (runtime_ms_reserved + runtime_ms_used <= runtime_ms_budget),
	CHECK (
		(state = 'leased' AND lease_token_hash IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
		OR (state <> 'leased' AND lease_token_hash IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
	)
);

CREATE INDEX email_relevance_scan_connections_claim_idx
	ON public.email_relevance_scan_connections (state, next_attempt_at, lease_expires_at);

CREATE INDEX email_relevance_scan_connections_connection_idx
	ON public.email_relevance_scan_connections (connection_id)
	WHERE connection_id IS NOT NULL;

CREATE TABLE public.email_relevance_scan_reservations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	operation_id uuid NOT NULL,
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	connection_scope_id uuid NOT NULL REFERENCES public.email_relevance_scan_connections(id) ON DELETE CASCADE,
	checkpoint_version integer NOT NULL CHECK (checkpoint_version >= 0),
	resource_kind text NOT NULL CHECK (resource_kind IN ('gmail_quota', 'runtime_ms')),
	operation_code text NOT NULL CHECK (operation_code = 'synthetic_step'),
	reserved_quantity bigint NOT NULL CHECK (reserved_quantity > 0),
	settled_quantity bigint CHECK (settled_quantity IS NULL OR settled_quantity >= 0),
	state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'released')),
	attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 3),
	policy_version text NOT NULL CHECK (policy_version = 'email-relevance-gmail-quota-v1'),
	created_at timestamptz NOT NULL DEFAULT now(),
	settled_at timestamptz,
	UNIQUE (operation_id, resource_kind),
	CHECK (
		(state = 'reserved' AND settled_quantity IS NULL AND settled_at IS NULL)
		OR (
			state IN ('settled', 'released')
			AND settled_quantity IS NOT NULL
			AND settled_quantity <= reserved_quantity
			AND settled_at IS NOT NULL
		)
	)
);

CREATE INDEX email_relevance_scan_reservations_scope_state_idx
	ON public.email_relevance_scan_reservations (connection_scope_id, state, created_at);

CREATE OR REPLACE FUNCTION public.enforce_email_relevance_scan_run_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NEW.user_id IS DISTINCT FROM OLD.user_id
		OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash
		OR NEW.window_start IS DISTINCT FROM OLD.window_start
		OR NEW.window_end IS DISTINCT FROM OLD.window_end
		OR NEW.message_cap_per_connection IS DISTINCT FROM OLD.message_cap_per_connection
		OR NEW.query_policy_version IS DISTINCT FROM OLD.query_policy_version
		OR NEW.control_plane_version IS DISTINCT FROM OLD.control_plane_version
		OR NEW.serializer_version IS DISTINCT FROM OLD.serializer_version
		OR NEW.quota_policy_version IS DISTINCT FROM OLD.quota_policy_version
		OR NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash
		OR NEW.configuration IS DISTINCT FROM OLD.configuration
		OR NEW.gmail_quota_budget IS DISTINCT FROM OLD.gmail_quota_budget
		OR NEW.runtime_ms_budget IS DISTINCT FROM OLD.runtime_ms_budget
		OR NEW.raw_content_byte_budget IS DISTINCT FROM OLD.raw_content_byte_budget
		OR NEW.model_token_budget IS DISTINCT FROM OLD.model_token_budget
		OR NEW.model_cost_budget_micros IS DISTINCT FROM OLD.model_cost_budget_micros
		OR NEW.connection_count IS DISTINCT FROM OLD.connection_count
		OR NEW.project_count IS DISTINCT FROM OLD.project_count
		OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'email_relevance_scan_manifest_immutable'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_email_relevance_scan_run_immutable_trigger
	BEFORE UPDATE ON public.email_relevance_scan_runs
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_email_relevance_scan_run_immutable();

CREATE OR REPLACE FUNCTION public.enforce_email_relevance_scan_project_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NEW.run_id IS DISTINCT FROM OLD.run_id
		OR NEW.project_id IS DISTINCT FROM OLD.project_id
		OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
		OR NEW.profile_version IS DISTINCT FROM OLD.profile_version
		OR NEW.profile_hash IS DISTINCT FROM OLD.profile_hash
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'email_relevance_scan_project_immutable'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_email_relevance_scan_project_immutable_trigger
	BEFORE UPDATE ON public.email_relevance_scan_projects
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_email_relevance_scan_project_immutable();

CREATE OR REPLACE FUNCTION public.enforce_email_relevance_scan_connection_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NEW.run_id IS DISTINCT FROM OLD.run_id
		OR NEW.message_cap IS DISTINCT FROM OLD.message_cap
		OR NEW.metadata_batch_ceiling IS DISTINCT FROM OLD.metadata_batch_ceiling
		OR NEW.gmail_quota_budget IS DISTINCT FROM OLD.gmail_quota_budget
		OR NEW.runtime_ms_budget IS DISTINCT FROM OLD.runtime_ms_budget
		OR NEW.raw_content_byte_budget IS DISTINCT FROM OLD.raw_content_byte_budget
		OR NEW.model_token_budget IS DISTINCT FROM OLD.model_token_budget
		OR NEW.model_cost_budget_micros IS DISTINCT FROM OLD.model_cost_budget_micros
		OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'email_relevance_scan_connection_manifest_immutable'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_email_relevance_scan_connection_immutable_trigger
	BEFORE UPDATE ON public.email_relevance_scan_connections
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_email_relevance_scan_connection_immutable();

CREATE OR REPLACE FUNCTION public.enforce_email_relevance_scan_reservation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NEW.operation_id IS DISTINCT FROM OLD.operation_id
		OR NEW.run_id IS DISTINCT FROM OLD.run_id
		OR NEW.connection_scope_id IS DISTINCT FROM OLD.connection_scope_id
		OR NEW.checkpoint_version IS DISTINCT FROM OLD.checkpoint_version
		OR NEW.resource_kind IS DISTINCT FROM OLD.resource_kind
		OR NEW.operation_code IS DISTINCT FROM OLD.operation_code
		OR NEW.reserved_quantity IS DISTINCT FROM OLD.reserved_quantity
		OR NEW.attempt IS DISTINCT FROM OLD.attempt
		OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
		OR OLD.state <> 'reserved'
		OR NEW.state NOT IN ('settled', 'released')
	THEN
		RAISE EXCEPTION 'email_relevance_scan_reservation_immutable'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_email_relevance_scan_reservation_update_trigger
	BEFORE UPDATE ON public.email_relevance_scan_reservations
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_email_relevance_scan_reservation_update();

CREATE OR REPLACE FUNCTION public.email_relevance_refresh_scan_run_state(
	p_run_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	run_row public.email_relevance_scan_runs%ROWTYPE;
	total_count integer;
	completed_count integer;
	nonterminal_count integer;
	cancelled_count integer;
	expired_count integer;
	quota_count integer;
	failed_count integer;
	next_state text;
	next_reason text;
	failed_reason text;
BEGIN
	SELECT * INTO run_row
	FROM public.email_relevance_scan_runs
	WHERE id = p_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'email_relevance_scan_run_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	SELECT
		count(*),
		count(*) FILTER (WHERE state = 'completed'),
		count(*) FILTER (WHERE state IN ('pending', 'leased', 'retry_wait')),
		count(*) FILTER (WHERE state = 'cancelled'),
		count(*) FILTER (WHERE state = 'expired'),
		count(*) FILTER (WHERE state = 'quota_stopped'),
		count(*) FILTER (WHERE state = 'failed')
	INTO
		total_count,
		completed_count,
		nonterminal_count,
		cancelled_count,
		expired_count,
		quota_count,
		failed_count
	FROM public.email_relevance_scan_connections
	WHERE run_id = p_run_id;

	SELECT terminal_reason_code INTO failed_reason
	FROM public.email_relevance_scan_connections
	WHERE run_id = p_run_id
		AND state IN ('cancelled', 'failed')
		AND terminal_reason_code IN (
			'connection_disconnected',
			'project_unavailable',
			'retry_exhausted',
			'internal_error'
		)
	ORDER BY CASE terminal_reason_code
		WHEN 'connection_disconnected' THEN 1
		WHEN 'project_unavailable' THEN 2
		WHEN 'retry_exhausted' THEN 3
		ELSE 4
	END
	LIMIT 1;

	IF total_count = 0 THEN
		next_state := 'failed';
		next_reason := 'internal_error';
	ELSIF nonterminal_count = 0 THEN
		IF completed_count = total_count THEN
			next_state := 'completed';
			next_reason := 'completed';
		ELSIF completed_count > 0 THEN
			next_state := 'partial';
			next_reason := 'partial';
		ELSIF run_row.cancel_requested_at IS NOT NULL
			OR (
				cancelled_count = total_count
				AND failed_reason IS NULL
			)
		THEN
			next_state := 'cancelled';
			next_reason := 'cancelled';
		ELSIF expired_count > 0 THEN
			next_state := 'expired';
			next_reason := 'manifest_expired';
		ELSIF quota_count > 0 THEN
			next_state := 'quota_stopped';
			next_reason := 'budget_exceeded';
		ELSE
			next_state := 'failed';
			next_reason := COALESCE(failed_reason, 'internal_error');
		END IF;
	ELSE
		next_reason := NULL;
		IF run_row.pause_requested_at IS NOT NULL AND run_row.started_at IS NOT NULL THEN
			next_state := 'paused';
		ELSIF run_row.started_at IS NULL THEN
			next_state := 'pending';
		ELSE
			next_state := 'running';
		END IF;
	END IF;

	UPDATE public.email_relevance_scan_runs
	SET state = next_state,
		terminal_reason_code = next_reason,
		completed_at = CASE
			WHEN next_state IN ('completed', 'partial', 'cancelled', 'quota_stopped', 'failed', 'expired')
				THEN COALESCE(completed_at, now())
			ELSE NULL
		END,
		updated_at = now()
	WHERE id = p_run_id;

	RETURN next_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_relevance_release_scope_reservations(
	p_scope_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	scope_row public.email_relevance_scan_connections%ROWTYPE;
	released_gmail bigint := 0;
	released_runtime bigint := 0;
BEGIN
	SELECT * INTO scope_row
	FROM public.email_relevance_scan_connections
	WHERE id = p_scope_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RETURN;
	END IF;

	WITH released AS (
		UPDATE public.email_relevance_scan_reservations
		SET state = 'released',
			settled_quantity = 0,
			settled_at = now()
		WHERE connection_scope_id = p_scope_id
			AND state = 'reserved'
		RETURNING resource_kind, reserved_quantity
	)
	SELECT
		COALESCE(sum(reserved_quantity) FILTER (WHERE resource_kind = 'gmail_quota'), 0),
		COALESCE(sum(reserved_quantity) FILTER (WHERE resource_kind = 'runtime_ms'), 0)
	INTO released_gmail, released_runtime
	FROM released;

	IF released_gmail > 0 OR released_runtime > 0 THEN
		UPDATE public.email_relevance_scan_connections
		SET gmail_quota_reserved = gmail_quota_reserved - released_gmail,
			runtime_ms_reserved = runtime_ms_reserved - released_runtime,
			updated_at = now()
		WHERE id = p_scope_id;

		UPDATE public.email_relevance_scan_runs
		SET gmail_quota_reserved = gmail_quota_reserved - released_gmail,
			runtime_ms_reserved = runtime_ms_reserved - released_runtime,
			updated_at = now()
		WHERE id = scope_row.run_id;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_email_relevance_scan_run(
	p_user_id uuid,
	p_idempotency_key_hash text,
	p_manifest_hash text,
	p_configuration jsonb
)
RETURNS TABLE(run_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	existing_run public.email_relevance_scan_runs%ROWTYPE;
	new_run_id uuid;
	connection_count integer;
	project_count integer;
	inserted_count integer;
BEGIN
	IF p_user_id IS NULL
		OR p_idempotency_key_hash !~ '^[a-f0-9]{64}$'
		OR p_manifest_hash !~ '^[a-f0-9]{64}$'
		OR NOT public.email_relevance_scan_configuration_is_valid(p_configuration)
		OR (p_configuration->>'user_id')::uuid <> p_user_id
	THEN
		RAISE EXCEPTION 'email_relevance_scan_invalid_manifest'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO existing_run
	FROM public.email_relevance_scan_runs
	WHERE user_id = p_user_id
		AND idempotency_key_hash = p_idempotency_key_hash;
	IF FOUND THEN
		IF existing_run.manifest_hash <> p_manifest_hash
			OR existing_run.configuration <> p_configuration
		THEN
			RAISE EXCEPTION 'email_relevance_scan_idempotency_conflict'
				USING ERRCODE = 'unique_violation';
		END IF;
		RETURN QUERY SELECT existing_run.id, false;
		RETURN;
	END IF;

	IF (p_configuration->>'expires_at')::timestamptz <= now() THEN
		RAISE EXCEPTION 'email_relevance_scan_manifest_expired'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	connection_count := jsonb_array_length(p_configuration->'connection_ids');
	project_count := jsonb_array_length(p_configuration->'projects');

	SELECT count(*) INTO inserted_count
	FROM public.user_email_connections AS connection
	WHERE connection.id IN (
		SELECT value::uuid
		FROM jsonb_array_elements_text(p_configuration->'connection_ids') AS selected(value)
	)
		AND connection.user_id = p_user_id
		AND connection.provider = 'google_gmail'
		AND connection.status = 'active'
		AND connection.read_enabled = true
		AND connection.deleted_at IS NULL;
	IF inserted_count <> connection_count THEN
		RAISE EXCEPTION 'email_relevance_scan_connection_scope_mismatch'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	SELECT count(*) INTO inserted_count
	FROM jsonb_array_elements(p_configuration->'projects') AS selected(value)
	JOIN public.email_project_profiles AS profile
		ON profile.id = (selected.value->>'profile_id')::uuid
		AND profile.user_id = p_user_id
		AND profile.project_id = (selected.value->>'project_id')::uuid
		AND profile.current_version = (selected.value->>'profile_version')::integer
		AND profile.current_profile_hash = selected.value->>'profile_hash'
		AND profile.compiler_version = p_configuration->>'profile_compiler_version'
		AND profile.deleted_at IS NULL
	JOIN public.email_project_profile_versions AS version
		ON version.profile_id = profile.id
		AND version.profile_version = profile.current_version
		AND version.profile_hash = profile.current_profile_hash
	WHERE public.email_relevance_user_owns_project(
		p_user_id,
		(selected.value->>'project_id')::uuid
	);
	IF inserted_count <> project_count THEN
		RAISE EXCEPTION 'email_relevance_scan_project_scope_mismatch'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	INSERT INTO public.email_relevance_scan_runs (
		user_id,
		idempotency_key_hash,
		window_start,
		window_end,
		message_cap_per_connection,
		query_policy_version,
		control_plane_version,
		serializer_version,
		quota_policy_version,
		manifest_hash,
		configuration,
		gmail_quota_budget,
		runtime_ms_budget,
		connection_count,
		project_count,
		expires_at
	)
	VALUES (
		p_user_id,
		p_idempotency_key_hash,
		(p_configuration->>'window_start')::timestamptz,
		(p_configuration->>'window_end')::timestamptz,
		(p_configuration->>'message_cap_per_connection')::integer,
		p_configuration->>'query_policy_version',
		p_configuration->>'control_plane_version',
		p_configuration->>'serializer_version',
		p_configuration->>'quota_policy_version',
		p_manifest_hash,
		p_configuration,
		(p_configuration->'global_budgets'->>'gmail_quota_units')::bigint,
		(p_configuration->'global_budgets'->>'runtime_ms')::bigint,
		connection_count,
		project_count,
		(p_configuration->>'expires_at')::timestamptz
	)
	ON CONFLICT (user_id, idempotency_key_hash) DO NOTHING
	RETURNING id INTO new_run_id;

	IF new_run_id IS NULL THEN
		SELECT * INTO existing_run
		FROM public.email_relevance_scan_runs
		WHERE user_id = p_user_id
			AND idempotency_key_hash = p_idempotency_key_hash;
		IF existing_run.manifest_hash <> p_manifest_hash
			OR existing_run.configuration <> p_configuration
		THEN
			RAISE EXCEPTION 'email_relevance_scan_idempotency_conflict'
				USING ERRCODE = 'unique_violation';
		END IF;
		RETURN QUERY SELECT existing_run.id, false;
		RETURN;
	END IF;

	INSERT INTO public.email_relevance_scan_projects (
		run_id,
		project_id,
		profile_id,
		profile_version,
		profile_hash
	)
	SELECT
		new_run_id,
		(value->>'project_id')::uuid,
		(value->>'profile_id')::uuid,
		(value->>'profile_version')::integer,
		value->>'profile_hash'
	FROM jsonb_array_elements(p_configuration->'projects') AS selected(value);

	INSERT INTO public.email_relevance_scan_connections (
		run_id,
		connection_id,
		message_cap,
		metadata_batch_ceiling,
		gmail_quota_budget,
		runtime_ms_budget
	)
	SELECT
		new_run_id,
		value::uuid,
		(p_configuration->>'message_cap_per_connection')::integer,
		(p_configuration->>'metadata_batch_ceiling')::integer,
		(p_configuration->'per_connection_budgets'->>'gmail_quota_units')::bigint,
		(p_configuration->'per_connection_budgets'->>'runtime_ms')::bigint
	FROM jsonb_array_elements_text(p_configuration->'connection_ids') AS selected(value);

	RETURN QUERY SELECT new_run_id, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_relevance_scan_step(
	p_user_id uuid,
	p_run_id uuid,
	p_connection_scope_id uuid,
	p_expected_checkpoint integer,
	p_processing_token_hash text,
	p_lease_owner text,
	p_gmail_quota_units bigint,
	p_runtime_ms bigint
)
RETURNS TABLE(
	claimed boolean,
	operation_id uuid,
	checkpoint_version integer,
	scope_state text,
	error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	scope_row public.email_relevance_scan_connections%ROWTYPE;
	run_row public.email_relevance_scan_runs%ROWTYPE;
	new_operation_id uuid;
BEGIN
	IF p_user_id IS NULL
		OR p_run_id IS NULL
		OR p_connection_scope_id IS NULL
		OR p_expected_checkpoint IS NULL
		OR p_expected_checkpoint < 0
		OR p_processing_token_hash IS NULL
		OR p_processing_token_hash !~ '^[a-f0-9]{64}$'
		OR p_lease_owner IS NULL
		OR p_lease_owner !~ '^[a-z0-9_-]{1,64}$'
		OR p_gmail_quota_units IS NULL
		OR p_gmail_quota_units NOT BETWEEN 1 AND 1000
		OR p_runtime_ms IS NULL
		OR p_runtime_ms NOT BETWEEN 1 AND 60000
	THEN
		RAISE EXCEPTION 'email_relevance_scan_invalid_claim'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO scope_row
	FROM public.email_relevance_scan_connections
	WHERE id = p_connection_scope_id
		AND run_id = p_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'email_relevance_scan_scope_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	SELECT * INTO run_row
	FROM public.email_relevance_scan_runs
	WHERE id = p_run_id
	FOR UPDATE;
	IF run_row.user_id IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'email_relevance_scan_owner_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF run_row.expires_at <= now() THEN
		PERFORM public.email_relevance_release_scope_reservations(scope_row.id);
		UPDATE public.email_relevance_scan_connections
		SET state = 'expired',
			terminal_reason_code = 'manifest_expired',
			last_error_code = 'manifest_expired',
			lease_token_hash = NULL,
			lease_owner = NULL,
			lease_expires_at = NULL,
			completed_at = COALESCE(completed_at, now()),
			updated_at = now()
		WHERE id = scope_row.id;
		PERFORM public.email_relevance_refresh_scan_run_state(scope_row.run_id);
		RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, 'expired'::text, 'manifest_expired'::text;
		RETURN;
	END IF;

	IF run_row.cancel_requested_at IS NOT NULL THEN
		PERFORM public.email_relevance_release_scope_reservations(scope_row.id);
		UPDATE public.email_relevance_scan_connections
		SET state = 'cancelled',
			terminal_reason_code = 'cancelled',
			lease_token_hash = NULL,
			lease_owner = NULL,
			lease_expires_at = NULL,
			completed_at = COALESCE(completed_at, now()),
			updated_at = now()
		WHERE id = scope_row.id;
		PERFORM public.email_relevance_refresh_scan_run_state(scope_row.run_id);
		RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, 'cancelled'::text, 'cancelled'::text;
		RETURN;
	END IF;

	IF run_row.pause_requested_at IS NOT NULL THEN
		RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, scope_row.state, 'paused'::text;
		RETURN;
	END IF;

	IF scope_row.state IN ('completed', 'cancelled', 'quota_stopped', 'failed', 'expired') THEN
		RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, scope_row.state, scope_row.last_error_code;
		RETURN;
	END IF;

	IF scope_row.state = 'leased' AND scope_row.lease_expires_at > now() THEN
		RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, scope_row.state, 'lease_conflict'::text;
		RETURN;
	ELSIF scope_row.state = 'leased' THEN
		PERFORM public.email_relevance_release_scope_reservations(scope_row.id);
		IF scope_row.checkpoint_attempts >= scope_row.max_attempts THEN
			UPDATE public.email_relevance_scan_connections
			SET state = 'failed',
				terminal_reason_code = 'retry_exhausted',
				lease_token_hash = NULL,
				lease_owner = NULL,
				lease_expires_at = NULL,
				last_error_code = 'retry_exhausted',
				completed_at = COALESCE(completed_at, now()),
				updated_at = now()
			WHERE id = scope_row.id;
			PERFORM public.email_relevance_refresh_scan_run_state(scope_row.run_id);
			RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, 'failed'::text, 'retry_exhausted'::text;
			RETURN;
		END IF;
		UPDATE public.email_relevance_scan_connections
		SET state = 'pending',
			lease_token_hash = NULL,
			lease_owner = NULL,
			lease_expires_at = NULL,
			last_error_code = 'lease_expired',
			updated_at = now()
		WHERE id = scope_row.id;

		SELECT * INTO scope_row
		FROM public.email_relevance_scan_connections
		WHERE id = p_connection_scope_id
		FOR UPDATE;
		SELECT * INTO run_row
		FROM public.email_relevance_scan_runs
		WHERE id = scope_row.run_id
		FOR UPDATE;
	END IF;

	IF scope_row.state = 'retry_wait' AND scope_row.next_attempt_at > now() THEN
		RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, scope_row.state, 'synthetic_retryable'::text;
		RETURN;
	END IF;

	IF scope_row.checkpoint_version <> p_expected_checkpoint THEN
		RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, scope_row.state, 'stale_checkpoint'::text;
		RETURN;
	END IF;

	IF scope_row.gmail_quota_reserved + scope_row.gmail_quota_used + p_gmail_quota_units
			> scope_row.gmail_quota_budget
		OR scope_row.runtime_ms_reserved + scope_row.runtime_ms_used + p_runtime_ms
			> scope_row.runtime_ms_budget
		OR run_row.gmail_quota_reserved + run_row.gmail_quota_used + p_gmail_quota_units
			> run_row.gmail_quota_budget
		OR run_row.runtime_ms_reserved + run_row.runtime_ms_used + p_runtime_ms
			> run_row.runtime_ms_budget
	THEN
		UPDATE public.email_relevance_scan_connections
		SET state = 'quota_stopped',
			terminal_reason_code = 'budget_exceeded',
			last_error_code = 'budget_exceeded',
			completed_at = COALESCE(completed_at, now()),
			updated_at = now()
		WHERE id = scope_row.id;
		PERFORM public.email_relevance_refresh_scan_run_state(scope_row.run_id);
		RETURN QUERY SELECT false, NULL::uuid, scope_row.checkpoint_version, 'quota_stopped'::text, 'budget_exceeded'::text;
		RETURN;
	END IF;

	new_operation_id := gen_random_uuid();
	UPDATE public.email_relevance_scan_connections
	SET state = 'leased',
		gmail_quota_reserved = gmail_quota_reserved + p_gmail_quota_units,
		runtime_ms_reserved = runtime_ms_reserved + p_runtime_ms,
		total_attempts = total_attempts + 1,
		checkpoint_attempts = checkpoint_attempts + 1,
		lease_token_hash = p_processing_token_hash,
		lease_owner = p_lease_owner,
		lease_expires_at = now() + interval '60 seconds',
		next_attempt_at = NULL,
		last_error_code = NULL,
		started_at = COALESCE(started_at, now()),
		updated_at = now()
	WHERE id = scope_row.id;

	INSERT INTO public.email_relevance_scan_reservations (
		operation_id,
		run_id,
		connection_scope_id,
		checkpoint_version,
		resource_kind,
		operation_code,
		reserved_quantity,
		attempt,
		policy_version
	)
	VALUES
		(
			new_operation_id,
			scope_row.run_id,
			scope_row.id,
			scope_row.checkpoint_version,
			'gmail_quota',
			'synthetic_step',
			p_gmail_quota_units,
			scope_row.checkpoint_attempts + 1,
			run_row.quota_policy_version
		),
		(
			new_operation_id,
			scope_row.run_id,
			scope_row.id,
			scope_row.checkpoint_version,
			'runtime_ms',
			'synthetic_step',
			p_runtime_ms,
			scope_row.checkpoint_attempts + 1,
			run_row.quota_policy_version
		);

	UPDATE public.email_relevance_scan_runs
	SET state = 'running',
		gmail_quota_reserved = gmail_quota_reserved + p_gmail_quota_units,
		runtime_ms_reserved = runtime_ms_reserved + p_runtime_ms,
		started_at = COALESCE(started_at, now()),
		updated_at = now()
	WHERE id = scope_row.run_id;

	RETURN QUERY SELECT true, new_operation_id, scope_row.checkpoint_version, 'leased'::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_email_relevance_scan_step(
	p_user_id uuid,
	p_run_id uuid,
	p_connection_scope_id uuid,
	p_expected_checkpoint integer,
	p_processing_token_hash text,
	p_operation_id uuid,
	p_result text,
	p_actual_gmail_quota_units bigint,
	p_actual_runtime_ms bigint,
	p_error_code text DEFAULT NULL
)
RETURNS TABLE(
	committed boolean,
	checkpoint_version integer,
	scope_state text,
	error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	scope_row public.email_relevance_scan_connections%ROWTYPE;
	run_row public.email_relevance_scan_runs%ROWTYPE;
	reserved_gmail bigint;
	reserved_runtime bigint;
	next_checkpoint integer;
	next_messages integer;
	next_state text;
	next_error text;
BEGIN
	IF p_user_id IS NULL
		OR p_run_id IS NULL
		OR p_connection_scope_id IS NULL
		OR p_operation_id IS NULL
		OR p_result IS NULL
		OR p_result NOT IN ('success', 'retryable_failure', 'nonretryable_failure')
		OR p_actual_gmail_quota_units IS NULL
		OR p_actual_gmail_quota_units < 0
		OR p_actual_runtime_ms IS NULL
		OR p_actual_runtime_ms < 0
		OR p_expected_checkpoint IS NULL
		OR p_expected_checkpoint < 0
		OR p_processing_token_hash IS NULL
		OR p_processing_token_hash !~ '^[a-f0-9]{64}$'
	THEN
		RAISE EXCEPTION 'email_relevance_scan_invalid_settlement'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO scope_row
	FROM public.email_relevance_scan_connections
	WHERE id = p_connection_scope_id
		AND run_id = p_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'email_relevance_scan_scope_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	SELECT * INTO run_row
	FROM public.email_relevance_scan_runs
	WHERE id = p_run_id
	FOR UPDATE;
	IF run_row.user_id IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'email_relevance_scan_owner_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF scope_row.checkpoint_version <> p_expected_checkpoint THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'stale_checkpoint'::text;
		RETURN;
	END IF;
	IF scope_row.state <> 'leased'
		OR scope_row.lease_token_hash <> p_processing_token_hash
	THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'stale_processing_token'::text;
		RETURN;
	END IF;
	IF scope_row.lease_expires_at <= now() THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'lease_expired'::text;
		RETURN;
	END IF;

	SELECT
		max(reservation.reserved_quantity) FILTER (
			WHERE reservation.resource_kind = 'gmail_quota'
		),
		max(reservation.reserved_quantity) FILTER (
			WHERE reservation.resource_kind = 'runtime_ms'
		)
	INTO reserved_gmail, reserved_runtime
	FROM public.email_relevance_scan_reservations AS reservation
	WHERE reservation.operation_id = p_operation_id
		AND reservation.connection_scope_id = scope_row.id
		AND reservation.checkpoint_version = p_expected_checkpoint
		AND reservation.state = 'reserved';

	IF reserved_gmail IS NULL OR reserved_runtime IS NULL
		OR p_actual_gmail_quota_units > reserved_gmail
		OR p_actual_runtime_ms > reserved_runtime
	THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'settlement_conflict'::text;
		RETURN;
	END IF;

	UPDATE public.email_relevance_scan_reservations
	SET state = 'settled',
		settled_quantity = CASE
			WHEN resource_kind = 'gmail_quota' THEN p_actual_gmail_quota_units
			ELSE p_actual_runtime_ms
		END,
		settled_at = now()
	WHERE operation_id = p_operation_id
		AND state = 'reserved';

	next_checkpoint := scope_row.checkpoint_version;
	next_messages := scope_row.messages_seen;
	next_state := scope_row.state;
	next_error := p_error_code;

	IF p_result = 'success' THEN
		next_checkpoint := scope_row.checkpoint_version + 1;
		next_messages := LEAST(scope_row.message_cap, scope_row.messages_seen + scope_row.metadata_batch_ceiling);
		IF next_messages >= scope_row.message_cap THEN
			next_state := 'completed';
			next_error := NULL;
		ELSIF run_row.cancel_requested_at IS NOT NULL THEN
			next_state := 'cancelled';
			next_error := NULL;
		ELSE
			next_state := 'pending';
			next_error := NULL;
		END IF;
	ELSIF p_result = 'retryable_failure' THEN
		IF scope_row.checkpoint_attempts >= scope_row.max_attempts THEN
			next_state := 'failed';
			next_error := 'retry_exhausted';
		ELSE
			next_state := 'retry_wait';
			next_error := 'synthetic_retryable';
		END IF;
	ELSE
		IF p_error_code NOT IN ('connection_disconnected', 'project_unavailable', 'internal_error') THEN
			RAISE EXCEPTION 'email_relevance_scan_invalid_error_code'
				USING ERRCODE = 'invalid_parameter_value';
		END IF;
		next_state := 'failed';
		next_error := p_error_code;
	END IF;

	UPDATE public.email_relevance_scan_connections
	SET state = next_state,
		terminal_reason_code = CASE
			WHEN next_state = 'completed' THEN 'completed'
			WHEN next_state = 'cancelled' THEN 'cancelled'
			WHEN next_state = 'failed' THEN COALESCE(next_error, 'internal_error')
			ELSE NULL
		END,
		gmail_quota_reserved = gmail_quota_reserved - reserved_gmail,
		gmail_quota_used = gmail_quota_used + p_actual_gmail_quota_units,
		runtime_ms_reserved = runtime_ms_reserved - reserved_runtime,
		runtime_ms_used = runtime_ms_used + p_actual_runtime_ms,
		checkpoint_version = next_checkpoint,
		synthetic_step = CASE WHEN p_result = 'success' THEN synthetic_step + 1 ELSE synthetic_step END,
		steps_completed = CASE WHEN p_result = 'success' THEN steps_completed + 1 ELSE steps_completed END,
		messages_seen = next_messages,
		checkpoint_attempts = CASE WHEN p_result = 'success' THEN 0 ELSE checkpoint_attempts END,
		lease_token_hash = NULL,
		lease_owner = NULL,
		lease_expires_at = NULL,
		next_attempt_at = CASE WHEN next_state = 'retry_wait' THEN now() + interval '1 second' ELSE NULL END,
		last_error_code = next_error,
		completed_at = CASE
			WHEN next_state IN ('completed', 'cancelled', 'failed') THEN COALESCE(completed_at, now())
			ELSE NULL
		END,
		updated_at = now()
	WHERE id = scope_row.id;

	UPDATE public.email_relevance_scan_runs
	SET gmail_quota_reserved = gmail_quota_reserved - reserved_gmail,
		gmail_quota_used = gmail_quota_used + p_actual_gmail_quota_units,
		runtime_ms_reserved = runtime_ms_reserved - reserved_runtime,
		runtime_ms_used = runtime_ms_used + p_actual_runtime_ms,
		steps_completed = steps_completed + CASE WHEN p_result = 'success' THEN 1 ELSE 0 END,
		messages_seen = messages_seen + CASE WHEN p_result = 'success' THEN next_messages - scope_row.messages_seen ELSE 0 END,
		updated_at = now()
	WHERE id = scope_row.run_id;

	PERFORM public.email_relevance_refresh_scan_run_state(scope_row.run_id);
	RETURN QUERY SELECT true, next_checkpoint, next_state, next_error;
END;
$$;

CREATE OR REPLACE FUNCTION public.control_email_relevance_scan_run(
	p_user_id uuid,
	p_run_id uuid,
	p_action text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	run_row public.email_relevance_scan_runs%ROWTYPE;
	scope_id uuid;
BEGIN
	IF p_user_id IS NULL
		OR p_run_id IS NULL
		OR p_action IS NULL
		OR p_action NOT IN ('pause', 'resume', 'cancel')
	THEN
		RAISE EXCEPTION 'email_relevance_scan_invalid_control_action'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO run_row
	FROM public.email_relevance_scan_runs
	WHERE id = p_run_id
	FOR UPDATE;
	IF NOT FOUND OR run_row.user_id IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'email_relevance_scan_owner_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF run_row.state IN ('completed', 'partial', 'cancelled', 'quota_stopped', 'failed', 'expired') THEN
		RETURN run_row.state;
	END IF;

	IF p_action = 'pause' THEN
		UPDATE public.email_relevance_scan_runs
		SET pause_requested_at = COALESCE(pause_requested_at, now()),
			updated_at = now()
		WHERE id = p_run_id;
	ELSIF p_action = 'resume' THEN
		UPDATE public.email_relevance_scan_runs
		SET pause_requested_at = NULL,
			updated_at = now()
		WHERE id = p_run_id;
	ELSE
		UPDATE public.email_relevance_scan_runs
		SET cancel_requested_at = COALESCE(cancel_requested_at, now()),
			pause_requested_at = NULL,
			updated_at = now()
		WHERE id = p_run_id;
		FOR scope_id IN
			SELECT id
			FROM public.email_relevance_scan_connections
			WHERE run_id = p_run_id
				AND state IN ('pending', 'retry_wait')
			FOR UPDATE
		LOOP
			PERFORM public.email_relevance_release_scope_reservations(scope_id);
			UPDATE public.email_relevance_scan_connections
			SET state = 'cancelled',
				terminal_reason_code = 'cancelled',
				last_error_code = NULL,
				completed_at = COALESCE(completed_at, now()),
				updated_at = now()
			WHERE id = scope_id;
		END LOOP;
	END IF;

	RETURN public.email_relevance_refresh_scan_run_state(p_run_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_email_relevance_scan_run(
	p_user_id uuid,
	p_run_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	run_row public.email_relevance_scan_runs%ROWTYPE;
	scope_id uuid;
BEGIN
	IF p_user_id IS NULL OR p_run_id IS NULL THEN
		RAISE EXCEPTION 'email_relevance_scan_invalid_expiry_request'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO run_row
	FROM public.email_relevance_scan_runs
	WHERE id = p_run_id
	FOR UPDATE;
	IF NOT FOUND OR run_row.user_id IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'email_relevance_scan_owner_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF run_row.expires_at > now() THEN
		RAISE EXCEPTION 'email_relevance_scan_not_expired'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	FOR scope_id IN
		SELECT id
		FROM public.email_relevance_scan_connections
		WHERE run_id = p_run_id
			AND state IN ('pending', 'leased', 'retry_wait')
		FOR UPDATE
	LOOP
		PERFORM public.email_relevance_release_scope_reservations(scope_id);
		UPDATE public.email_relevance_scan_connections
		SET state = 'expired',
			terminal_reason_code = 'manifest_expired',
			last_error_code = 'manifest_expired',
			lease_token_hash = NULL,
			lease_owner = NULL,
			lease_expires_at = NULL,
			completed_at = COALESCE(completed_at, now()),
			updated_at = now()
		WHERE id = scope_id;
	END LOOP;

	RETURN public.email_relevance_refresh_scan_run_state(p_run_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_email_relevance_connection_unavailable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	connection_to_stop uuid;
	scope_record record;
BEGIN
	IF TG_OP = 'UPDATE' AND NOT (
		NEW.deleted_at IS NOT NULL
		OR NEW.status <> 'active'
		OR NEW.read_enabled = false
	) THEN
		RETURN NEW;
	END IF;

	connection_to_stop := OLD.id;
	FOR scope_record IN
		SELECT id, run_id
		FROM public.email_relevance_scan_connections
		WHERE connection_id = connection_to_stop
			AND state IN ('pending', 'leased', 'retry_wait')
		FOR UPDATE
	LOOP
		PERFORM public.email_relevance_release_scope_reservations(scope_record.id);
		UPDATE public.email_relevance_scan_connections
		SET connection_id = NULL,
			state = 'cancelled',
			terminal_reason_code = 'connection_disconnected',
			last_error_code = 'connection_disconnected',
			checkpoint_version = checkpoint_version + 1,
			synthetic_step = 0,
			lease_token_hash = NULL,
			lease_owner = NULL,
			lease_expires_at = NULL,
			completed_at = COALESCE(completed_at, now()),
			updated_at = now()
		WHERE id = scope_record.id;
		PERFORM public.email_relevance_refresh_scan_run_state(scope_record.run_id);
	END LOOP;

	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER handle_email_relevance_connection_unavailable_trigger
	BEFORE UPDATE OF status, read_enabled, deleted_at OR DELETE
	ON public.user_email_connections
	FOR EACH ROW
	EXECUTE FUNCTION public.handle_email_relevance_connection_unavailable();

CREATE OR REPLACE FUNCTION public.handle_email_relevance_project_unavailable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	project_to_stop uuid;
	selected_record record;
	scope_id uuid;
	active_project_count integer;
BEGIN
	IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NULL THEN
		RETURN NEW;
	END IF;

	project_to_stop := OLD.id;
	FOR selected_record IN
		SELECT selected.run_id, run.state, run.started_at
		FROM public.email_relevance_scan_projects AS selected
		JOIN public.email_relevance_scan_runs AS run ON run.id = selected.run_id
		WHERE selected.project_id = project_to_stop
			AND selected.invalidated_at IS NULL
			AND run.state IN ('pending', 'running', 'paused')
	LOOP
		UPDATE public.email_relevance_scan_projects
		SET invalidated_at = now(),
			invalidation_reason_code = 'project_unavailable'
		WHERE run_id = selected_record.run_id
			AND project_id = project_to_stop;

		SELECT count(*) INTO active_project_count
		FROM public.email_relevance_scan_projects
		WHERE run_id = selected_record.run_id
			AND invalidated_at IS NULL;

		IF selected_record.started_at IS NULL OR active_project_count = 0 THEN
			FOR scope_id IN
				SELECT id
				FROM public.email_relevance_scan_connections
				WHERE run_id = selected_record.run_id
					AND state IN ('pending', 'leased', 'retry_wait')
				FOR UPDATE
			LOOP
				PERFORM public.email_relevance_release_scope_reservations(scope_id);
				UPDATE public.email_relevance_scan_connections
				SET state = 'failed',
					terminal_reason_code = 'project_unavailable',
					last_error_code = 'project_unavailable',
					lease_token_hash = NULL,
					lease_owner = NULL,
					lease_expires_at = NULL,
					completed_at = COALESCE(completed_at, now()),
					updated_at = now()
				WHERE id = scope_id;
			END LOOP;
		END IF;
		PERFORM public.email_relevance_refresh_scan_run_state(selected_record.run_id);
	END LOOP;

	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER handle_email_relevance_project_unavailable_trigger
	BEFORE UPDATE OF deleted_at OR DELETE
	ON public.onto_projects
	FOR EACH ROW
	EXECUTE FUNCTION public.handle_email_relevance_project_unavailable();

ALTER TABLE public.email_relevance_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_relevance_scan_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_relevance_scan_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_relevance_scan_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_relevance_scan_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_relevance_scan_projects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_relevance_scan_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_relevance_scan_reservations FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.email_relevance_scan_runs TO authenticated, service_role;
GRANT SELECT ON TABLE public.email_relevance_scan_projects TO authenticated, service_role;
GRANT SELECT ON TABLE public.email_relevance_scan_connections TO authenticated, service_role;
GRANT SELECT ON TABLE public.email_relevance_scan_reservations TO authenticated, service_role;

CREATE POLICY email_relevance_scan_runs_owner_select
	ON public.email_relevance_scan_runs FOR SELECT
	TO authenticated
	USING ((SELECT auth.uid()) = user_id);

CREATE POLICY email_relevance_scan_projects_owner_select
	ON public.email_relevance_scan_projects FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM public.email_relevance_scan_runs AS run
			WHERE run.id = email_relevance_scan_projects.run_id
				AND run.user_id = (SELECT auth.uid())
		)
	);

CREATE POLICY email_relevance_scan_connections_owner_select
	ON public.email_relevance_scan_connections FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM public.email_relevance_scan_runs AS run
			WHERE run.id = email_relevance_scan_connections.run_id
				AND run.user_id = (SELECT auth.uid())
		)
	);

CREATE POLICY email_relevance_scan_reservations_owner_select
	ON public.email_relevance_scan_reservations FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM public.email_relevance_scan_runs AS run
			WHERE run.id = email_relevance_scan_reservations.run_id
				AND run.user_id = (SELECT auth.uid())
		)
	);

CREATE POLICY email_relevance_scan_runs_service_role_select
	ON public.email_relevance_scan_runs FOR SELECT
	TO service_role
	USING (true);

CREATE POLICY email_relevance_scan_projects_service_role_select
	ON public.email_relevance_scan_projects FOR SELECT
	TO service_role
	USING (true);

CREATE POLICY email_relevance_scan_connections_service_role_select
	ON public.email_relevance_scan_connections FOR SELECT
	TO service_role
	USING (true);

CREATE POLICY email_relevance_scan_reservations_service_role_select
	ON public.email_relevance_scan_reservations FOR SELECT
	TO service_role
	USING (true);

REVOKE ALL ON FUNCTION public.enforce_email_relevance_scan_run_immutable()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_email_relevance_scan_project_immutable()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_email_relevance_scan_connection_immutable()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_email_relevance_scan_reservation_update()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_relevance_refresh_scan_run_state(uuid)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_relevance_release_scope_reservations(uuid)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_email_relevance_connection_unavailable()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_email_relevance_project_unavailable()
	FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_email_relevance_scan_run(uuid, text, text, jsonb)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_email_relevance_scan_step(uuid, uuid, uuid, integer, text, text, bigint, bigint)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_email_relevance_scan_step(uuid, uuid, uuid, integer, text, uuid, text, bigint, bigint, text)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.control_email_relevance_scan_run(uuid, uuid, text)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_email_relevance_scan_run(uuid, uuid)
	FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_email_relevance_scan_run(uuid, text, text, jsonb)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_relevance_scan_step(uuid, uuid, uuid, integer, text, text, bigint, bigint)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_email_relevance_scan_step(uuid, uuid, uuid, integer, text, uuid, text, bigint, bigint, text)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.control_email_relevance_scan_run(uuid, uuid, text)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_email_relevance_scan_run(uuid, uuid)
	TO service_role;

COMMENT ON TABLE public.email_relevance_scan_runs IS
	'Immutable content-free Gmail relevance scan manifests plus aggregate lifecycle and budgets.';
COMMENT ON TABLE public.email_relevance_scan_projects IS
	'Immutable project/profile-version selections captured by a relevance scan manifest.';
COMMENT ON TABLE public.email_relevance_scan_connections IS
	'Independently resumable content-free account scopes for synthetic relevance scans.';
COMMENT ON TABLE public.email_relevance_scan_reservations IS
	'Append-only reservation and settlement ledger for synthetic scan Gmail quota and runtime.';

COMMIT;
