-- supabase/migrations/20260723223402_gmail_relevance_metadata_retrieval.sql
-- Gmail relevance Phase A, Slice 3: bounded metadata-only retrieval and A/B candidates.
--
-- This exact-file migration adds only content-free observation/candidate storage, encrypted
-- provider-link/cursor fields, and database-priced list/metadata reservation operations. It does
-- not register transport, enable a feature flag, read Gmail, or add a model/mutation path.

BEGIN;

ALTER TABLE public.email_relevance_scan_reservations
	DROP CONSTRAINT email_relevance_scan_reservations_operation_code_check;
ALTER TABLE public.email_relevance_scan_reservations
	ADD CONSTRAINT email_relevance_scan_reservations_operation_code_check
	CHECK (operation_code IN ('synthetic_step', 'list_page', 'metadata_batch'));

ALTER TABLE public.email_relevance_scan_connections
	ADD COLUMN cursor_envelope text,
	ADD COLUMN cursor_key_version integer,
	ADD COLUMN pending_cursor_envelope text,
	ADD COLUMN pending_cursor_key_version integer,
	ADD COLUMN pending_page_is_final boolean,
	ADD COLUMN list_pages_completed integer NOT NULL DEFAULT 0,
	ADD COLUMN observations_discovered integer NOT NULL DEFAULT 0,
	ADD COLUMN observations_processed integer NOT NULL DEFAULT 0,
	ADD CONSTRAINT email_relevance_scan_connections_cursor_pair_check CHECK (
		(cursor_envelope IS NULL AND cursor_key_version IS NULL)
		OR (
			cursor_envelope ~ '^enc:gmail-relevance:v[0-9]+\.'
			AND char_length(cursor_envelope) <= 8192
			AND cursor_key_version > 0
		)
	),
	ADD CONSTRAINT email_relevance_scan_connections_pending_cursor_pair_check CHECK (
		(
			pending_cursor_envelope IS NULL
			AND pending_cursor_key_version IS NULL
			AND pending_page_is_final IS NULL
		)
		OR (
			pending_cursor_envelope ~ '^enc:gmail-relevance:v[0-9]+\.'
			AND char_length(pending_cursor_envelope) <= 8192
			AND pending_cursor_key_version > 0
			AND pending_page_is_final = false
		)
		OR (
			pending_cursor_envelope IS NULL
			AND pending_cursor_key_version IS NULL
			AND pending_page_is_final = true
		)
	),
	ADD CONSTRAINT email_relevance_scan_connections_list_pages_check CHECK (
		list_pages_completed BETWEEN 0 AND 10
	),
	ADD CONSTRAINT email_relevance_scan_connections_observation_counts_check CHECK (
		observations_discovered BETWEEN 0 AND message_cap
		AND observations_processed BETWEEN 0 AND observations_discovered
	);

ALTER TABLE public.email_relevance_scan_connections
	DROP CONSTRAINT email_relevance_scan_connections_last_error_code_check;
ALTER TABLE public.email_relevance_scan_connections
	ADD CONSTRAINT email_relevance_scan_connections_last_error_code_check CHECK (
		last_error_code IS NULL OR last_error_code IN (
			'lease_expired', 'stale_checkpoint', 'stale_processing_token',
			'policy_unavailable', 'accounting_unavailable', 'budget_exceeded',
			'synthetic_retryable', 'retry_exhausted', 'connection_disconnected',
			'project_unavailable', 'manifest_expired', 'provider_timeout',
			'provider_rejected', 'provider_response_too_large',
			'invalid_provider_response', 'internal_error'
		)
	);

CREATE OR REPLACE FUNCTION public.email_relevance_hash_array_is_valid(p_hashes text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
	SELECT COALESCE(array_length(p_hashes, 1), 0) <= 32
		AND NOT EXISTS (
			SELECT 1 FROM unnest(p_hashes) AS hash(value)
			WHERE hash.value !~ '^[a-f0-9]{64}$'
		);
$$;

REVOKE ALL ON FUNCTION public.email_relevance_hash_array_is_valid(text[])
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_relevance_hash_array_is_valid(text[])
	TO service_role;

CREATE TABLE public.email_relevance_message_observations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	connection_scope_id uuid NOT NULL
		REFERENCES public.email_relevance_scan_connections(id) ON DELETE CASCADE,
	provider_message_id_hash text NOT NULL CHECK (provider_message_id_hash ~ '^[a-f0-9]{64}$'),
	provider_message_id_ciphertext text NOT NULL CHECK (
		provider_message_id_ciphertext ~ '^enc:gmail-relevance:v[0-9]+\.'
		AND char_length(provider_message_id_ciphertext) <= 4096
	),
	provider_thread_id_hash text NOT NULL CHECK (provider_thread_id_hash ~ '^[a-f0-9]{64}$'),
	provider_thread_id_ciphertext text NOT NULL CHECK (
		provider_thread_id_ciphertext ~ '^enc:gmail-relevance:v[0-9]+\.'
		AND char_length(provider_thread_id_ciphertext) <= 4096
	),
	key_version integer NOT NULL CHECK (key_version > 0),
	discovery_page integer NOT NULL CHECK (discovery_page BETWEEN 1 AND 10),
	internal_date timestamptz,
	mailbox_inbox boolean,
	mailbox_sent boolean,
	processing_state text NOT NULL DEFAULT 'pending' CHECK (
		processing_state IN ('pending', 'processed')
	),
	evidence_fingerprints text[] NOT NULL DEFAULT '{}'::text[] CHECK (
		public.email_relevance_hash_array_is_valid(evidence_fingerprints)
	),
	retention_expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	processed_at timestamptz,
	UNIQUE (connection_scope_id, provider_message_id_hash),
	CHECK (
		(
			processing_state = 'pending'
			AND internal_date IS NULL
			AND mailbox_inbox IS NULL
			AND mailbox_sent IS NULL
			AND processed_at IS NULL
		)
		OR (
			processing_state = 'processed'
			AND internal_date IS NOT NULL
			AND mailbox_inbox IS NOT NULL
			AND mailbox_sent IS NOT NULL
			AND processed_at IS NOT NULL
		)
	),
	CHECK (retention_expires_at > created_at AND retention_expires_at <= created_at + interval '7 days')
);

CREATE INDEX email_relevance_observations_pending_idx
	ON public.email_relevance_message_observations (
		connection_scope_id,
		discovery_page,
		created_at,
		id
	)
	WHERE processing_state = 'pending';
CREATE INDEX email_relevance_observations_retention_idx
	ON public.email_relevance_message_observations (retention_expires_at);

CREATE TABLE public.email_relevance_project_candidates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	observation_id uuid NOT NULL
		REFERENCES public.email_relevance_message_observations(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	profile_version_id uuid NOT NULL
		REFERENCES public.email_project_profile_versions(id) ON DELETE RESTRICT,
	variant text NOT NULL CHECK (variant IN ('a', 'b')),
	scorer_version text NOT NULL CHECK (scorer_version = 'email-relevance-ab-scorer-v1'),
	policy_version text NOT NULL CHECK (policy_version = 'email-relevance-metadata-policy-v1'),
	score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
	confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
	confirmed_thread boolean NOT NULL DEFAULT false,
	explicit_rule boolean NOT NULL DEFAULT false,
	actor_overlap boolean NOT NULL DEFAULT false,
	domain_overlap boolean NOT NULL DEFAULT false,
	artifact_overlap boolean NOT NULL DEFAULT false,
	identifier_overlap boolean NOT NULL DEFAULT false,
	lexical_overlap boolean NOT NULL DEFAULT false,
	negative_evidence boolean NOT NULL DEFAULT false,
	actor_overlap_count smallint NOT NULL DEFAULT 0 CHECK (actor_overlap_count BETWEEN 0 AND 32),
	domain_overlap_count smallint NOT NULL DEFAULT 0 CHECK (domain_overlap_count BETWEEN 0 AND 32),
	artifact_overlap_count smallint NOT NULL DEFAULT 0 CHECK (artifact_overlap_count BETWEEN 0 AND 32),
	identifier_overlap_count smallint NOT NULL DEFAULT 0 CHECK (identifier_overlap_count BETWEEN 0 AND 32),
	lexical_overlap_count smallint NOT NULL DEFAULT 0 CHECK (lexical_overlap_count BETWEEN 0 AND 32),
	negative_evidence_count smallint NOT NULL DEFAULT 0 CHECK (negative_evidence_count BETWEEN 0 AND 32),
	candidate_state text NOT NULL DEFAULT 'suggested' CHECK (
		candidate_state IN ('suggested', 'expired')
	),
	retention_expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (observation_id, project_id, variant),
	CHECK (retention_expires_at > created_at AND retention_expires_at <= created_at + interval '7 days')
);

CREATE INDEX email_relevance_candidates_project_idx
	ON public.email_relevance_project_candidates (user_id, project_id, created_at DESC);
CREATE INDEX email_relevance_candidates_retention_idx
	ON public.email_relevance_project_candidates (retention_expires_at);

-- The Slice 2 reservation trigger remains append-only, but permits the database-priced wrapper
-- below to specialize a newly reserved synthetic code before returning the claim.
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
		OR NEW.reserved_quantity IS DISTINCT FROM OLD.reserved_quantity
		OR NEW.attempt IS DISTINCT FROM OLD.attempt
		OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
		OR OLD.state <> 'reserved'
		OR (
			NEW.operation_code IS DISTINCT FROM OLD.operation_code
			AND NOT (
				OLD.operation_code = 'synthetic_step'
				AND NEW.operation_code IN ('list_page', 'metadata_batch')
				AND NEW.state = 'reserved'
				AND NEW.settled_quantity IS NULL
				AND NEW.settled_at IS NULL
			)
		)
		OR (
			NEW.operation_code IS NOT DISTINCT FROM OLD.operation_code
			AND NEW.state NOT IN ('settled', 'released')
		)
	THEN
		RAISE EXCEPTION 'email_relevance_scan_reservation_immutable'
			USING ERRCODE = 'integrity_constraint_violation';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_relevance_scan_operation(
	p_user_id uuid,
	p_run_id uuid,
	p_connection_scope_id uuid,
	p_expected_checkpoint integer,
	p_processing_token_hash text,
	p_lease_owner text,
	p_operation_code text,
	p_message_count integer DEFAULT NULL
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
	priced_gmail_units bigint;
	priced_runtime_ms bigint;
	claim_record record;
	pending_count integer;
	scope_row public.email_relevance_scan_connections%ROWTYPE;
BEGIN
	IF p_operation_code = 'list_page' AND p_message_count IS NULL THEN
		priced_gmail_units := 5;
		priced_runtime_ms := 15000;
	ELSIF p_operation_code = 'metadata_batch' AND p_message_count BETWEEN 1 AND 50 THEN
		priced_gmail_units := p_message_count * 20;
		priced_runtime_ms := 60000;
	ELSE
		RAISE EXCEPTION 'email_relevance_scan_policy_unavailable'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO scope_row
	FROM public.email_relevance_scan_connections
	WHERE id = p_connection_scope_id AND run_id = p_run_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'email_relevance_scan_scope_not_found' USING ERRCODE = 'no_data_found';
	END IF;

	SELECT count(*) INTO pending_count
	FROM public.email_relevance_message_observations
	WHERE connection_scope_id = p_connection_scope_id
		AND processing_state = 'pending';
	IF p_operation_code = 'list_page' AND (
		pending_count <> 0
		OR scope_row.list_pages_completed >= 10
		OR scope_row.observations_discovered >= scope_row.message_cap
	) THEN
		RAISE EXCEPTION 'email_relevance_scan_invalid_list_boundary'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;
	IF p_operation_code = 'metadata_batch' AND pending_count < p_message_count THEN
		RAISE EXCEPTION 'email_relevance_scan_invalid_metadata_boundary'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO claim_record
	FROM public.claim_email_relevance_scan_step(
		p_user_id,
		p_run_id,
		p_connection_scope_id,
		p_expected_checkpoint,
		p_processing_token_hash,
		p_lease_owner,
		priced_gmail_units,
		priced_runtime_ms
	);

	IF claim_record.claimed THEN
		UPDATE public.email_relevance_scan_reservations AS reservation
		SET operation_code = p_operation_code
		WHERE reservation.operation_id = claim_record.operation_id
			AND reservation.state = 'reserved'
			AND reservation.operation_code = 'synthetic_step';
	END IF;

	RETURN QUERY SELECT
		claim_record.claimed,
		claim_record.operation_id,
		claim_record.checkpoint_version,
		claim_record.scope_state,
		claim_record.error_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_relevance_discovery_batch_is_valid(p_batch jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
	entry jsonb;
	entry_count integer;
BEGIN
	IF jsonb_typeof(p_batch) <> 'array' THEN RETURN false; END IF;
	entry_count := jsonb_array_length(p_batch);
	IF entry_count > 100 THEN RETURN false; END IF;
	IF (
		SELECT count(DISTINCT value->>'provider_message_id_hash')
		FROM jsonb_array_elements(p_batch)
	) <> entry_count THEN RETURN false; END IF;
	FOR entry IN SELECT value FROM jsonb_array_elements(p_batch)
	LOOP
		IF jsonb_typeof(entry) <> 'object'
			OR NOT entry ?& ARRAY[
				'provider_message_id_hash',
				'provider_message_id_ciphertext',
				'provider_thread_id_hash',
				'provider_thread_id_ciphertext',
				'key_version'
			]
			OR entry - ARRAY[
				'provider_message_id_hash',
				'provider_message_id_ciphertext',
				'provider_thread_id_hash',
				'provider_thread_id_ciphertext',
				'key_version'
			] <> '{}'::jsonb
			OR entry->>'provider_message_id_hash' !~ '^[a-f0-9]{64}$'
			OR entry->>'provider_thread_id_hash' !~ '^[a-f0-9]{64}$'
			OR entry->>'provider_message_id_ciphertext' !~ '^enc:gmail-relevance:v[0-9]+\.'
			OR entry->>'provider_thread_id_ciphertext' !~ '^enc:gmail-relevance:v[0-9]+\.'
			OR char_length(entry->>'provider_message_id_ciphertext') > 4096
			OR char_length(entry->>'provider_thread_id_ciphertext') > 4096
			OR (entry->>'key_version')::integer < 1
		THEN RETURN false;
		END IF;
	END LOOP;
	RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_relevance_metadata_batch_is_valid(p_batch jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
	entry jsonb;
	candidate jsonb;
	fingerprint jsonb;
	entry_count integer;
BEGIN
	IF jsonb_typeof(p_batch) <> 'array' THEN RETURN false; END IF;
	entry_count := jsonb_array_length(p_batch);
	IF entry_count NOT BETWEEN 1 AND 50 THEN RETURN false; END IF;
	IF (
		SELECT count(DISTINCT value->>'observation_id') FROM jsonb_array_elements(p_batch)
	) <> entry_count THEN RETURN false; END IF;
	FOR entry IN SELECT value FROM jsonb_array_elements(p_batch)
	LOOP
		IF jsonb_typeof(entry) <> 'object'
			OR NOT entry ?& ARRAY[
				'observation_id',
				'internal_date',
				'mailbox_inbox',
				'mailbox_sent',
				'evidence_fingerprints',
				'candidates'
			]
			OR entry - ARRAY[
				'observation_id',
				'internal_date',
				'mailbox_inbox',
				'mailbox_sent',
				'evidence_fingerprints',
				'candidates'
			] <> '{}'::jsonb
			OR jsonb_typeof(entry->'mailbox_inbox') <> 'boolean'
			OR jsonb_typeof(entry->'mailbox_sent') <> 'boolean'
			OR jsonb_typeof(entry->'evidence_fingerprints') <> 'array'
			OR jsonb_array_length(entry->'evidence_fingerprints') > 32
			OR jsonb_typeof(entry->'candidates') <> 'array'
			OR jsonb_array_length(entry->'candidates') > 50
		THEN RETURN false;
		END IF;
		PERFORM (entry->>'observation_id')::uuid;
		PERFORM (entry->>'internal_date')::timestamptz;
		FOR fingerprint IN SELECT value FROM jsonb_array_elements(entry->'evidence_fingerprints')
		LOOP
			IF jsonb_typeof(fingerprint) <> 'string'
				OR trim(both '"' from fingerprint::text) !~ '^[a-f0-9]{64}$'
			THEN RETURN false;
			END IF;
		END LOOP;
		FOR candidate IN SELECT value FROM jsonb_array_elements(entry->'candidates')
		LOOP
			IF jsonb_typeof(candidate) <> 'object'
				OR NOT candidate ?& ARRAY[
					'project_id', 'profile_version_id', 'variant', 'score', 'confidence',
					'confirmed_thread', 'explicit_rule', 'actor_overlap', 'domain_overlap',
					'artifact_overlap', 'identifier_overlap', 'lexical_overlap',
					'negative_evidence', 'actor_overlap_count', 'domain_overlap_count',
					'artifact_overlap_count', 'identifier_overlap_count',
					'lexical_overlap_count', 'negative_evidence_count'
				]
				OR candidate - ARRAY[
					'project_id', 'profile_version_id', 'variant', 'score', 'confidence',
					'confirmed_thread', 'explicit_rule', 'actor_overlap', 'domain_overlap',
					'artifact_overlap', 'identifier_overlap', 'lexical_overlap',
					'negative_evidence', 'actor_overlap_count', 'domain_overlap_count',
					'artifact_overlap_count', 'identifier_overlap_count',
					'lexical_overlap_count', 'negative_evidence_count'
				] <> '{}'::jsonb
				OR candidate->>'variant' NOT IN ('a', 'b')
				OR (candidate->>'score')::integer NOT BETWEEN 0 AND 100
				OR (candidate->>'confidence')::numeric NOT BETWEEN 0 AND 1
			THEN RETURN false;
			END IF;
			PERFORM (candidate->>'project_id')::uuid;
			PERFORM (candidate->>'profile_version_id')::uuid;
			IF EXISTS (
				SELECT 1 FROM (VALUES
					('confirmed_thread'), ('explicit_rule'), ('actor_overlap'),
					('domain_overlap'), ('artifact_overlap'), ('identifier_overlap'),
					('lexical_overlap'), ('negative_evidence')
				) AS boolean_key(key)
				WHERE jsonb_typeof(candidate->boolean_key.key) <> 'boolean'
			) OR EXISTS (
				SELECT 1 FROM (VALUES
					('actor_overlap_count'), ('domain_overlap_count'),
					('artifact_overlap_count'), ('identifier_overlap_count'),
					('lexical_overlap_count'), ('negative_evidence_count')
				) AS count_key(key)
				WHERE (candidate->>count_key.key)::integer NOT BETWEEN 0 AND 32
			) THEN RETURN false;
			END IF;
		END LOOP;
	END LOOP;
	RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.email_relevance_discovery_batch_is_valid(jsonb)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_relevance_metadata_batch_is_valid(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_relevance_discovery_batch_is_valid(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_relevance_metadata_batch_is_valid(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_email_relevance_list_page(
	p_user_id uuid,
	p_run_id uuid,
	p_connection_scope_id uuid,
	p_expected_checkpoint integer,
	p_processing_token_hash text,
	p_operation_id uuid,
	p_actual_runtime_ms bigint,
	p_observations jsonb,
	p_next_cursor_envelope text DEFAULT NULL,
	p_next_cursor_key_version integer DEFAULT NULL
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
	inserted_count integer;
	next_state text;
	next_checkpoint integer;
	next_discovered integer;
BEGIN
	IF p_actual_runtime_ms NOT BETWEEN 0 AND 15000
		OR NOT public.email_relevance_discovery_batch_is_valid(p_observations)
		OR (
			(p_next_cursor_envelope IS NULL) <> (p_next_cursor_key_version IS NULL)
		)
		OR (
			p_next_cursor_envelope IS NOT NULL
			AND (
				p_next_cursor_envelope !~ '^enc:gmail-relevance:v[0-9]+\.'
				OR char_length(p_next_cursor_envelope) > 8192
				OR p_next_cursor_key_version < 1
			)
		)
	THEN RAISE EXCEPTION 'email_relevance_scan_invalid_list_settlement'
		USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO scope_row FROM public.email_relevance_scan_connections
	WHERE id = p_connection_scope_id AND run_id = p_run_id FOR UPDATE;
	SELECT * INTO run_row FROM public.email_relevance_scan_runs
	WHERE id = p_run_id FOR UPDATE;
	IF NOT FOUND OR run_row.user_id IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'email_relevance_scan_owner_required' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF scope_row.checkpoint_version <> p_expected_checkpoint THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'stale_checkpoint'::text;
		RETURN;
	END IF;
	IF scope_row.state <> 'leased' OR scope_row.lease_token_hash <> p_processing_token_hash THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'stale_processing_token'::text;
		RETURN;
	END IF;
	IF scope_row.lease_expires_at <= now() THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'lease_expired'::text;
		RETURN;
	END IF;
	IF jsonb_array_length(p_observations) > scope_row.message_cap - scope_row.observations_discovered THEN
		RAISE EXCEPTION 'email_relevance_scan_message_cap_exceeded'
			USING ERRCODE = 'check_violation';
	END IF;

	SELECT
		max(reservation.reserved_quantity) FILTER (WHERE reservation.resource_kind = 'gmail_quota'),
		max(reservation.reserved_quantity) FILTER (WHERE reservation.resource_kind = 'runtime_ms')
	INTO reserved_gmail, reserved_runtime
	FROM public.email_relevance_scan_reservations AS reservation
	WHERE reservation.operation_id = p_operation_id
		AND reservation.connection_scope_id = scope_row.id
		AND reservation.checkpoint_version = p_expected_checkpoint
		AND reservation.operation_code = 'list_page'
		AND reservation.state = 'reserved';
	IF reserved_gmail <> 5 OR reserved_runtime <> 15000 THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'settlement_conflict'::text;
		RETURN;
	END IF;

	INSERT INTO public.email_relevance_message_observations (
		user_id, run_id, connection_scope_id,
		provider_message_id_hash, provider_message_id_ciphertext,
		provider_thread_id_hash, provider_thread_id_ciphertext,
		key_version, discovery_page, retention_expires_at
	)
	SELECT
		run_row.user_id, scope_row.run_id, scope_row.id,
		entry.value->>'provider_message_id_hash',
		entry.value->>'provider_message_id_ciphertext',
		entry.value->>'provider_thread_id_hash',
		entry.value->>'provider_thread_id_ciphertext',
		(entry.value->>'key_version')::integer,
		scope_row.list_pages_completed + 1,
		now() + interval '7 days'
	FROM jsonb_array_elements(p_observations) AS entry(value)
	ON CONFLICT (connection_scope_id, provider_message_id_hash) DO NOTHING;
	GET DIAGNOSTICS inserted_count = ROW_COUNT;

	UPDATE public.email_relevance_scan_reservations AS reservation
	SET state = 'settled',
		settled_quantity = CASE WHEN resource_kind = 'gmail_quota' THEN 5 ELSE p_actual_runtime_ms END,
		settled_at = now()
	WHERE reservation.operation_id = p_operation_id AND reservation.state = 'reserved';

	next_checkpoint := scope_row.checkpoint_version + 1;
	next_discovered := scope_row.observations_discovered + inserted_count;
	IF inserted_count = 0 AND (
		p_next_cursor_envelope IS NULL OR next_discovered >= scope_row.message_cap
	) THEN next_state := 'completed';
	ELSIF inserted_count = 0 AND scope_row.list_pages_completed + 1 >= 10 THEN
		next_state := 'quota_stopped';
	ELSE next_state := 'pending';
	END IF;

	UPDATE public.email_relevance_scan_connections
	SET state = next_state,
		terminal_reason_code = CASE
			WHEN next_state = 'completed' THEN 'completed'
			WHEN next_state = 'quota_stopped' THEN 'budget_exceeded'
			ELSE NULL
		END,
		gmail_quota_reserved = gmail_quota_reserved - reserved_gmail,
		gmail_quota_used = gmail_quota_used + 5,
		runtime_ms_reserved = runtime_ms_reserved - reserved_runtime,
		runtime_ms_used = runtime_ms_used + p_actual_runtime_ms,
		checkpoint_version = next_checkpoint,
		steps_completed = steps_completed + 1,
		messages_seen = next_discovered,
		list_pages_completed = list_pages_completed + 1,
		observations_discovered = next_discovered,
		cursor_envelope = CASE WHEN inserted_count = 0 THEN p_next_cursor_envelope ELSE cursor_envelope END,
		cursor_key_version = CASE WHEN inserted_count = 0 THEN p_next_cursor_key_version ELSE cursor_key_version END,
		pending_cursor_envelope = CASE WHEN inserted_count > 0 THEN p_next_cursor_envelope ELSE NULL END,
		pending_cursor_key_version = CASE WHEN inserted_count > 0 THEN p_next_cursor_key_version ELSE NULL END,
		pending_page_is_final = CASE WHEN inserted_count > 0 THEN p_next_cursor_envelope IS NULL ELSE NULL END,
		checkpoint_attempts = 0,
		lease_token_hash = NULL, lease_owner = NULL, lease_expires_at = NULL,
		next_attempt_at = NULL,
		last_error_code = CASE WHEN next_state = 'quota_stopped' THEN 'budget_exceeded' ELSE NULL END,
		completed_at = CASE
			WHEN next_state IN ('completed', 'quota_stopped') THEN COALESCE(completed_at, now())
			ELSE NULL
		END,
		updated_at = now()
	WHERE id = scope_row.id;

	UPDATE public.email_relevance_scan_runs
	SET gmail_quota_reserved = gmail_quota_reserved - reserved_gmail,
		gmail_quota_used = gmail_quota_used + 5,
		runtime_ms_reserved = runtime_ms_reserved - reserved_runtime,
		runtime_ms_used = runtime_ms_used + p_actual_runtime_ms,
		steps_completed = steps_completed + 1,
		messages_seen = messages_seen + inserted_count,
		updated_at = now()
	WHERE id = scope_row.run_id;
	PERFORM public.email_relevance_refresh_scan_run_state(scope_row.run_id);
	RETURN QUERY SELECT true, next_checkpoint, next_state, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_email_relevance_metadata_batch(
	p_user_id uuid,
	p_run_id uuid,
	p_connection_scope_id uuid,
	p_expected_checkpoint integer,
	p_processing_token_hash text,
	p_operation_id uuid,
	p_actual_runtime_ms bigint,
	p_results jsonb
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
	result_entry jsonb;
	candidate_entry jsonb;
	result_count integer;
	owned_result_count integer;
	pending_count integer;
	next_state text;
	next_checkpoint integer;
	selected_project_count integer;
BEGIN
	IF p_actual_runtime_ms NOT BETWEEN 0 AND 60000
		OR NOT public.email_relevance_metadata_batch_is_valid(p_results)
	THEN RAISE EXCEPTION 'email_relevance_scan_invalid_metadata_settlement'
		USING ERRCODE = 'invalid_parameter_value';
	END IF;
	result_count := jsonb_array_length(p_results);

	SELECT * INTO scope_row FROM public.email_relevance_scan_connections
	WHERE id = p_connection_scope_id AND run_id = p_run_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'email_relevance_scan_scope_not_found' USING ERRCODE = 'no_data_found';
	END IF;
	SELECT * INTO run_row FROM public.email_relevance_scan_runs
	WHERE id = p_run_id FOR UPDATE;
	IF NOT FOUND OR run_row.user_id IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'email_relevance_scan_owner_required' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF scope_row.checkpoint_version <> p_expected_checkpoint THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'stale_checkpoint'::text;
		RETURN;
	END IF;
	IF scope_row.state <> 'leased' OR scope_row.lease_token_hash <> p_processing_token_hash THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'stale_processing_token'::text;
		RETURN;
	END IF;
	IF scope_row.lease_expires_at <= now() THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'lease_expired'::text;
		RETURN;
	END IF;

	SELECT
		max(reservation.reserved_quantity) FILTER (WHERE reservation.resource_kind = 'gmail_quota'),
		max(reservation.reserved_quantity) FILTER (WHERE reservation.resource_kind = 'runtime_ms')
	INTO reserved_gmail, reserved_runtime
	FROM public.email_relevance_scan_reservations AS reservation
	WHERE reservation.operation_id = p_operation_id
		AND reservation.connection_scope_id = scope_row.id
		AND reservation.checkpoint_version = p_expected_checkpoint
		AND reservation.operation_code = 'metadata_batch'
		AND reservation.state = 'reserved';
	IF reserved_gmail <> result_count * 20 OR reserved_runtime <> 60000 THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'settlement_conflict'::text;
		RETURN;
	END IF;

	SELECT count(*) INTO owned_result_count
	FROM public.email_relevance_message_observations AS observation
	WHERE observation.id IN (
		SELECT (value->>'observation_id')::uuid FROM jsonb_array_elements(p_results)
	)
		AND observation.user_id = p_user_id
		AND observation.run_id = p_run_id
		AND observation.connection_scope_id = p_connection_scope_id
		AND observation.discovery_page = scope_row.list_pages_completed
		AND observation.processing_state = 'pending';
	IF owned_result_count <> result_count THEN
		RAISE EXCEPTION 'email_relevance_scan_observation_scope_mismatch'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	FOR result_entry IN SELECT value FROM jsonb_array_elements(p_results)
	LOOP
		IF (result_entry->>'internal_date')::timestamptz < run_row.window_start
			OR (result_entry->>'internal_date')::timestamptz >= run_row.window_end
		THEN RAISE EXCEPTION 'email_relevance_scan_observation_outside_window'
			USING ERRCODE = 'check_violation';
		END IF;

		UPDATE public.email_relevance_message_observations
		SET internal_date = (result_entry->>'internal_date')::timestamptz,
			mailbox_inbox = (result_entry->>'mailbox_inbox')::boolean,
			mailbox_sent = (result_entry->>'mailbox_sent')::boolean,
			processing_state = 'processed',
			evidence_fingerprints = ARRAY(
				SELECT value FROM jsonb_array_elements_text(result_entry->'evidence_fingerprints')
			),
			processed_at = now()
		WHERE id = (result_entry->>'observation_id')::uuid;

		FOR candidate_entry IN SELECT value FROM jsonb_array_elements(result_entry->'candidates')
		LOOP
			SELECT count(*) INTO selected_project_count
			FROM public.email_relevance_scan_projects AS selected
			JOIN public.email_project_profile_versions AS version
				ON version.id = (candidate_entry->>'profile_version_id')::uuid
				AND version.profile_id = selected.profile_id
				AND version.profile_version = selected.profile_version
			WHERE selected.run_id = p_run_id
				AND selected.project_id = (candidate_entry->>'project_id')::uuid
				AND selected.invalidated_at IS NULL;
			IF selected_project_count <> 1
				OR (
					candidate_entry->>'variant' = 'a'
					AND (candidate_entry->>'score')::integer < 20
				)
				OR (
					candidate_entry->>'variant' = 'b'
					AND (candidate_entry->>'score')::integer < 24
				)
			THEN RAISE EXCEPTION 'email_relevance_scan_candidate_scope_mismatch'
				USING ERRCODE = 'insufficient_privilege';
			END IF;

			INSERT INTO public.email_relevance_project_candidates (
				observation_id, user_id, project_id, profile_version_id, variant,
				scorer_version, policy_version, score, confidence,
				confirmed_thread, explicit_rule, actor_overlap, domain_overlap,
				artifact_overlap, identifier_overlap, lexical_overlap, negative_evidence,
				actor_overlap_count, domain_overlap_count, artifact_overlap_count,
				identifier_overlap_count, lexical_overlap_count, negative_evidence_count,
				retention_expires_at
			) VALUES (
				(result_entry->>'observation_id')::uuid,
				p_user_id,
				(candidate_entry->>'project_id')::uuid,
				(candidate_entry->>'profile_version_id')::uuid,
				candidate_entry->>'variant',
				'email-relevance-ab-scorer-v1',
				'email-relevance-metadata-policy-v1',
				(candidate_entry->>'score')::smallint,
				(candidate_entry->>'confidence')::numeric,
				(candidate_entry->>'confirmed_thread')::boolean,
				(candidate_entry->>'explicit_rule')::boolean,
				(candidate_entry->>'actor_overlap')::boolean,
				(candidate_entry->>'domain_overlap')::boolean,
				(candidate_entry->>'artifact_overlap')::boolean,
				(candidate_entry->>'identifier_overlap')::boolean,
				(candidate_entry->>'lexical_overlap')::boolean,
				(candidate_entry->>'negative_evidence')::boolean,
				(candidate_entry->>'actor_overlap_count')::smallint,
				(candidate_entry->>'domain_overlap_count')::smallint,
				(candidate_entry->>'artifact_overlap_count')::smallint,
				(candidate_entry->>'identifier_overlap_count')::smallint,
				(candidate_entry->>'lexical_overlap_count')::smallint,
				(candidate_entry->>'negative_evidence_count')::smallint,
				now() + interval '7 days'
			)
			ON CONFLICT (observation_id, project_id, variant) DO NOTHING;
		END LOOP;
	END LOOP;

	UPDATE public.email_relevance_scan_reservations AS reservation
	SET state = 'settled',
		settled_quantity = CASE
			WHEN resource_kind = 'gmail_quota' THEN result_count * 20
			ELSE p_actual_runtime_ms
		END,
		settled_at = now()
	WHERE reservation.operation_id = p_operation_id AND reservation.state = 'reserved';

	SELECT count(*) INTO pending_count
	FROM public.email_relevance_message_observations
	WHERE connection_scope_id = scope_row.id
		AND discovery_page = scope_row.list_pages_completed
		AND processing_state = 'pending';
	IF pending_count > 0 THEN
		next_state := 'pending';
	ELSIF scope_row.pending_page_is_final OR scope_row.observations_discovered >= scope_row.message_cap THEN
		next_state := 'completed';
	ELSIF scope_row.list_pages_completed >= 10 THEN
		next_state := 'quota_stopped';
	ELSE
		next_state := 'pending';
	END IF;
	next_checkpoint := scope_row.checkpoint_version + 1;

	UPDATE public.email_relevance_scan_connections
	SET state = next_state,
		terminal_reason_code = CASE
			WHEN next_state = 'completed' THEN 'completed'
			WHEN next_state = 'quota_stopped' THEN 'budget_exceeded'
			ELSE NULL
		END,
		gmail_quota_reserved = gmail_quota_reserved - reserved_gmail,
		gmail_quota_used = gmail_quota_used + result_count * 20,
		runtime_ms_reserved = runtime_ms_reserved - reserved_runtime,
		runtime_ms_used = runtime_ms_used + p_actual_runtime_ms,
		checkpoint_version = next_checkpoint,
		steps_completed = steps_completed + 1,
		observations_processed = observations_processed + result_count,
		cursor_envelope = CASE WHEN pending_count = 0 THEN pending_cursor_envelope ELSE cursor_envelope END,
		cursor_key_version = CASE WHEN pending_count = 0 THEN pending_cursor_key_version ELSE cursor_key_version END,
		pending_cursor_envelope = CASE WHEN pending_count = 0 THEN NULL ELSE pending_cursor_envelope END,
		pending_cursor_key_version = CASE WHEN pending_count = 0 THEN NULL ELSE pending_cursor_key_version END,
		pending_page_is_final = CASE WHEN pending_count = 0 THEN NULL ELSE pending_page_is_final END,
		checkpoint_attempts = 0,
		lease_token_hash = NULL, lease_owner = NULL, lease_expires_at = NULL,
		next_attempt_at = NULL,
		last_error_code = CASE WHEN next_state = 'quota_stopped' THEN 'budget_exceeded' ELSE NULL END,
		completed_at = CASE
			WHEN next_state IN ('completed', 'quota_stopped') THEN COALESCE(completed_at, now())
			ELSE NULL
		END,
		updated_at = now()
	WHERE id = scope_row.id;

	UPDATE public.email_relevance_scan_runs
	SET gmail_quota_reserved = gmail_quota_reserved - reserved_gmail,
		gmail_quota_used = gmail_quota_used + result_count * 20,
		runtime_ms_reserved = runtime_ms_reserved - reserved_runtime,
		runtime_ms_used = runtime_ms_used + p_actual_runtime_ms,
		steps_completed = steps_completed + 1,
		updated_at = now()
	WHERE id = scope_row.run_id;
	PERFORM public.email_relevance_refresh_scan_run_state(scope_row.run_id);
	RETURN QUERY SELECT true, next_checkpoint, next_state, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_email_relevance_operation_failure(
	p_user_id uuid,
	p_run_id uuid,
	p_connection_scope_id uuid,
	p_expected_checkpoint integer,
	p_processing_token_hash text,
	p_operation_id uuid,
	p_provider_calls_started integer,
	p_actual_runtime_ms bigint,
	p_error_code text
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
	operation_code text;
	reserved_gmail bigint;
	reserved_runtime bigint;
	actual_gmail bigint;
	max_calls integer;
	next_state text;
	next_error text;
BEGIN
	IF p_actual_runtime_ms NOT BETWEEN 0 AND 60000
		OR p_provider_calls_started IS NULL OR p_provider_calls_started < 0
		OR p_error_code NOT IN (
			'provider_timeout', 'provider_rejected', 'provider_response_too_large',
			'invalid_provider_response', 'connection_disconnected', 'internal_error'
		)
	THEN RAISE EXCEPTION 'email_relevance_scan_invalid_failure_settlement'
		USING ERRCODE = 'invalid_parameter_value';
	END IF;

	SELECT * INTO scope_row FROM public.email_relevance_scan_connections
	WHERE id = p_connection_scope_id AND run_id = p_run_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'email_relevance_scan_scope_not_found' USING ERRCODE = 'no_data_found';
	END IF;
	SELECT * INTO run_row FROM public.email_relevance_scan_runs
	WHERE id = p_run_id FOR UPDATE;
	IF NOT FOUND OR run_row.user_id IS DISTINCT FROM p_user_id THEN
		RAISE EXCEPTION 'email_relevance_scan_owner_required' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF scope_row.checkpoint_version <> p_expected_checkpoint THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'stale_checkpoint'::text;
		RETURN;
	END IF;
	IF scope_row.state <> 'leased' OR scope_row.lease_token_hash <> p_processing_token_hash THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'stale_processing_token'::text;
		RETURN;
	END IF;
	IF scope_row.lease_expires_at <= now() THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'lease_expired'::text;
		RETURN;
	END IF;

	SELECT max(reservation.operation_code),
		max(reservation.reserved_quantity) FILTER (WHERE reservation.resource_kind = 'gmail_quota'),
		max(reservation.reserved_quantity) FILTER (WHERE reservation.resource_kind = 'runtime_ms')
	INTO operation_code, reserved_gmail, reserved_runtime
	FROM public.email_relevance_scan_reservations AS reservation
	WHERE reservation.operation_id = p_operation_id
		AND reservation.connection_scope_id = scope_row.id
		AND reservation.checkpoint_version = p_expected_checkpoint
		AND reservation.operation_code IN ('list_page', 'metadata_batch')
		AND reservation.state = 'reserved';
	IF operation_code = 'list_page' THEN max_calls := 1;
	ELSIF operation_code = 'metadata_batch' THEN max_calls := reserved_gmail / 20;
	ELSE max_calls := -1;
	END IF;
	IF p_provider_calls_started > max_calls OR p_actual_runtime_ms > reserved_runtime THEN
		RETURN QUERY SELECT false, scope_row.checkpoint_version, scope_row.state, 'settlement_conflict'::text;
		RETURN;
	END IF;
	actual_gmail := p_provider_calls_started * CASE WHEN operation_code = 'list_page' THEN 5 ELSE 20 END;

	UPDATE public.email_relevance_scan_reservations AS reservation
	SET state = 'settled',
		settled_quantity = CASE
			WHEN resource_kind = 'gmail_quota' THEN actual_gmail
			ELSE p_actual_runtime_ms
		END,
		settled_at = now()
	WHERE reservation.operation_id = p_operation_id AND reservation.state = 'reserved';

	IF p_error_code IN ('provider_timeout', 'provider_rejected')
		AND scope_row.checkpoint_attempts < scope_row.max_attempts
	THEN
		next_state := 'retry_wait';
		next_error := p_error_code;
	ELSE
		next_state := 'failed';
		next_error := CASE
			WHEN scope_row.checkpoint_attempts >= scope_row.max_attempts THEN 'retry_exhausted'
			ELSE p_error_code
		END;
	END IF;

	UPDATE public.email_relevance_scan_connections
	SET state = next_state,
		terminal_reason_code = CASE
			WHEN next_state = 'failed' AND p_error_code = 'connection_disconnected'
				THEN 'connection_disconnected'
			WHEN next_state = 'failed' AND next_error = 'retry_exhausted'
				THEN 'retry_exhausted'
			WHEN next_state = 'failed' THEN 'internal_error'
			ELSE NULL
		END,
		gmail_quota_reserved = gmail_quota_reserved - reserved_gmail,
		gmail_quota_used = gmail_quota_used + actual_gmail,
		runtime_ms_reserved = runtime_ms_reserved - reserved_runtime,
		runtime_ms_used = runtime_ms_used + p_actual_runtime_ms,
		lease_token_hash = NULL, lease_owner = NULL, lease_expires_at = NULL,
		next_attempt_at = CASE WHEN next_state = 'retry_wait' THEN now() + interval '1 second' ELSE NULL END,
		last_error_code = next_error,
		completed_at = CASE WHEN next_state = 'failed' THEN COALESCE(completed_at, now()) ELSE NULL END,
		updated_at = now()
	WHERE id = scope_row.id;

	UPDATE public.email_relevance_scan_runs
	SET gmail_quota_reserved = gmail_quota_reserved - reserved_gmail,
		gmail_quota_used = gmail_quota_used + actual_gmail,
		runtime_ms_reserved = runtime_ms_reserved - reserved_runtime,
		runtime_ms_used = runtime_ms_used + p_actual_runtime_ms,
		updated_at = now()
	WHERE id = scope_row.run_id;
	PERFORM public.email_relevance_refresh_scan_run_state(scope_row.run_id);
	RETURN QUERY SELECT true, scope_row.checkpoint_version, next_state, next_error;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_email_relevance_metadata(p_limit integer DEFAULT 500)
RETURNS TABLE(observations_deleted integer, candidates_deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	deleted_candidates integer;
	deleted_observations integer;
BEGIN
	IF p_limit NOT BETWEEN 1 AND 1000 THEN
		RAISE EXCEPTION 'email_relevance_invalid_retention_limit'
			USING ERRCODE = 'invalid_parameter_value';
	END IF;
	WITH expired AS (
		SELECT id FROM public.email_relevance_project_candidates
		WHERE retention_expires_at <= now()
		ORDER BY retention_expires_at, id
		LIMIT p_limit
	), deleted AS (
		DELETE FROM public.email_relevance_project_candidates AS candidate
		USING expired
		WHERE candidate.id = expired.id
		RETURNING candidate.id
	)
	SELECT count(*) INTO deleted_candidates FROM deleted;

	WITH expired AS (
		SELECT id FROM public.email_relevance_message_observations
		WHERE retention_expires_at <= now()
		ORDER BY retention_expires_at, id
		LIMIT p_limit
	), deleted AS (
		DELETE FROM public.email_relevance_message_observations AS observation
		USING expired
		WHERE observation.id = expired.id
		RETURNING observation.id
	)
	SELECT count(*) INTO deleted_observations FROM deleted;
	RETURN QUERY SELECT deleted_observations, deleted_candidates;
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
		NEW.deleted_at IS NOT NULL OR NEW.status <> 'active' OR NEW.read_enabled = false
	) THEN RETURN NEW;
	END IF;

	connection_to_stop := OLD.id;
	DELETE FROM public.email_relevance_message_observations AS observation
	WHERE observation.connection_scope_id IN (
		SELECT scope.id FROM public.email_relevance_scan_connections AS scope
		WHERE scope.connection_id = connection_to_stop
	);
	FOR scope_record IN
		SELECT id, run_id FROM public.email_relevance_scan_connections
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
			cursor_envelope = NULL,
			cursor_key_version = NULL,
			pending_cursor_envelope = NULL,
			pending_cursor_key_version = NULL,
			pending_page_is_final = NULL,
			lease_token_hash = NULL,
			lease_owner = NULL,
			lease_expires_at = NULL,
			completed_at = COALESCE(completed_at, now()),
			updated_at = now()
		WHERE id = scope_record.id;
		PERFORM public.email_relevance_refresh_scan_run_state(scope_record.run_id);
	END LOOP;

	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END;
$$;

ALTER TABLE public.email_relevance_message_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_relevance_project_candidates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_relevance_message_observations
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_relevance_project_candidates
	FROM PUBLIC, anon, authenticated;

GRANT SELECT (
	id, user_id, run_id, connection_scope_id, internal_date,
	mailbox_inbox, mailbox_sent, processing_state, retention_expires_at,
	created_at, processed_at
) ON TABLE public.email_relevance_message_observations TO authenticated;
GRANT SELECT ON TABLE public.email_relevance_project_candidates TO authenticated;
GRANT ALL ON TABLE public.email_relevance_message_observations TO service_role;
GRANT ALL ON TABLE public.email_relevance_project_candidates TO service_role;

CREATE POLICY email_relevance_observations_owner_select
	ON public.email_relevance_message_observations FOR SELECT
	TO authenticated
	USING ((SELECT auth.uid()) = user_id);
CREATE POLICY email_relevance_candidates_owner_select
	ON public.email_relevance_project_candidates FOR SELECT
	TO authenticated
	USING ((SELECT auth.uid()) = user_id);
CREATE POLICY email_relevance_observations_service_role_all
	ON public.email_relevance_message_observations FOR ALL
	TO service_role USING (true) WITH CHECK (true);
CREATE POLICY email_relevance_candidates_service_role_all
	ON public.email_relevance_project_candidates FOR ALL
	TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.claim_email_relevance_scan_operation(
	uuid, uuid, uuid, integer, text, text, text, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_email_relevance_list_page(
	uuid, uuid, uuid, integer, text, uuid, bigint, jsonb, text, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_email_relevance_metadata_batch(
	uuid, uuid, uuid, integer, text, uuid, bigint, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_email_relevance_operation_failure(
	uuid, uuid, uuid, integer, text, uuid, integer, bigint, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_email_relevance_metadata(integer)
	FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_email_relevance_scan_operation(
	uuid, uuid, uuid, integer, text, text, text, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_email_relevance_list_page(
	uuid, uuid, uuid, integer, text, uuid, bigint, jsonb, text, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_email_relevance_metadata_batch(
	uuid, uuid, uuid, integer, text, uuid, bigint, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_email_relevance_operation_failure(
	uuid, uuid, uuid, integer, text, uuid, integer, bigint, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_email_relevance_metadata(integer)
	TO service_role;

COMMENT ON TABLE public.email_relevance_message_observations IS
	'Encrypted transient provider links and content-free metadata processing state for Phase A.';
COMMENT ON TABLE public.email_relevance_project_candidates IS
	'Content-free deterministic A/B relevance candidates with fixed explainability categories.';

COMMIT;
