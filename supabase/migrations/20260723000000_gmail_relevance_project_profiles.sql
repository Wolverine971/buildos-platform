-- supabase/migrations/20260723000000_gmail_relevance_project_profiles.sql
-- Gmail relevance Phase A, Slice 1: versioned project profiles and encrypted exact-match rules.
--
-- This migration intentionally contains no scan, queue, Gmail message, or model-classification
-- table. Apply only through the exact-file forward protocol documented in
-- apps/web/docs/technical/email/SUPABASE-MIGRATION-LEDGER-BASELINE.md.

BEGIN;

CREATE TABLE public.email_project_profiles (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
	current_profile_hash text CHECK (
		current_profile_hash IS NULL OR current_profile_hash ~ '^[a-f0-9]{64}$'
	),
	compiler_version text CHECK (
		compiler_version IS NULL OR char_length(compiler_version) BETWEEN 1 AND 100
	),
	source_snapshot_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz,
	CHECK (
		(
			current_version = 0
			AND current_profile_hash IS NULL
			AND compiler_version IS NULL
			AND source_snapshot_at IS NULL
		)
		OR
		(
			current_version > 0
			AND current_profile_hash IS NOT NULL
			AND compiler_version IS NOT NULL
			AND source_snapshot_at IS NOT NULL
		)
	)
);

CREATE UNIQUE INDEX email_project_profiles_user_project_active_idx
	ON public.email_project_profiles (user_id, project_id)
	WHERE deleted_at IS NULL;

CREATE INDEX email_project_profiles_user_updated_idx
	ON public.email_project_profiles (user_id, updated_at DESC)
	WHERE deleted_at IS NULL;

CREATE TABLE public.email_project_profile_versions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	profile_id uuid NOT NULL REFERENCES public.email_project_profiles(id) ON DELETE CASCADE,
	profile_version integer NOT NULL CHECK (profile_version > 0),
	compiler_version text NOT NULL CHECK (char_length(compiler_version) BETWEEN 1 AND 100),
	source_snapshot_at timestamptz NOT NULL,
	profile_hash text NOT NULL CHECK (profile_hash ~ '^[a-f0-9]{64}$'),
	groups jsonb NOT NULL CHECK (
		jsonb_typeof(groups) = 'object'
		AND groups ?& ARRAY[
			'identity',
			'actors',
			'artifacts',
			'identifiers',
			'semantic_context',
			'negative_evidence',
			'user_rules',
			'recency'
		]
		AND groups - ARRAY[
			'identity',
			'actors',
			'artifacts',
			'identifiers',
			'semantic_context',
			'negative_evidence',
			'user_rules',
			'recency'
		] = '{}'::jsonb
		AND jsonb_typeof(groups->'identity') = 'array'
		AND jsonb_typeof(groups->'actors') = 'array'
		AND jsonb_typeof(groups->'artifacts') = 'array'
		AND jsonb_typeof(groups->'identifiers') = 'array'
		AND jsonb_typeof(groups->'semantic_context') = 'array'
		AND jsonb_typeof(groups->'negative_evidence') = 'array'
		AND jsonb_typeof(groups->'user_rules') = 'array'
		AND jsonb_typeof(groups->'recency') = 'array'
		AND octet_length(groups::text) <= 262144
	),
	diff jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
		jsonb_typeof(diff) = 'object'
		AND octet_length(diff::text) <= 65536
	),
	omitted jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
		jsonb_typeof(omitted) = 'object'
		AND octet_length(omitted::text) <= 16384
	),
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (profile_id, profile_version)
);

CREATE INDEX email_project_profile_versions_profile_created_idx
	ON public.email_project_profile_versions (profile_id, created_at DESC);

CREATE TABLE public.email_project_rules (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	connection_id uuid REFERENCES public.user_email_connections(id) ON DELETE CASCADE,
	rule_kind text NOT NULL CHECK (
		rule_kind IN (
			'always_sender',
			'always_domain',
			'always_label',
			'always_thread',
			'never_sender',
			'never_domain',
			'never_label',
			'never_thread'
		)
	),
	match_value_hash text NOT NULL CHECK (match_value_hash ~ '^[a-f0-9]{64}$'),
	match_value_ciphertext text NOT NULL CHECK (
		match_value_ciphertext ~ '^enc:gmail-relevance:v[0-9]+\.'
		AND char_length(match_value_ciphertext) <= 4096
	),
	key_version integer NOT NULL DEFAULT 1 CHECK (key_version > 0),
	source_decision_id uuid,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	disabled_at timestamptz,
	CHECK (
		connection_id IS NOT NULL
		OR rule_kind IN ('always_sender', 'always_domain', 'never_sender', 'never_domain')
	)
);

CREATE UNIQUE INDEX email_project_rules_active_match_idx
	ON public.email_project_rules (
		user_id,
		project_id,
		COALESCE(connection_id, '00000000-0000-0000-0000-000000000000'::uuid),
		rule_kind,
		match_value_hash
	)
	WHERE disabled_at IS NULL;

CREATE INDEX email_project_rules_user_project_idx
	ON public.email_project_rules (user_id, project_id, created_at DESC)
	WHERE disabled_at IS NULL;

CREATE OR REPLACE FUNCTION public.email_relevance_user_owns_project(
	p_user_id uuid,
	p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT EXISTS (
		SELECT 1
		FROM public.onto_actors AS actor
		JOIN public.onto_projects AS project
			ON project.id = p_project_id
			AND project.deleted_at IS NULL
		LEFT JOIN public.onto_project_members AS member
			ON member.project_id = project.id
			AND member.actor_id = actor.id
			AND member.role_key = 'owner'
			AND member.removed_at IS NULL
		WHERE actor.user_id = p_user_id
			AND (project.created_by = actor.id OR member.id IS NOT NULL)
	);
$$;

REVOKE ALL ON FUNCTION public.email_relevance_user_owns_project(uuid, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_relevance_user_owns_project(uuid, uuid)
	TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_email_project_profile_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NOT public.email_relevance_user_owns_project(NEW.user_id, NEW.project_id) THEN
		RAISE EXCEPTION 'email_relevance_project_owner_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_email_project_profile_owner()
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_email_project_profile_owner()
	TO service_role;

CREATE TRIGGER enforce_email_project_profile_owner_trigger
	BEFORE INSERT OR UPDATE OF user_id, project_id
	ON public.email_project_profiles
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_email_project_profile_owner();

CREATE OR REPLACE FUNCTION public.enforce_email_project_rule_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF NOT public.email_relevance_user_owns_project(NEW.user_id, NEW.project_id) THEN
		RAISE EXCEPTION 'email_relevance_project_owner_required'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF NEW.connection_id IS NOT NULL AND NOT EXISTS (
		SELECT 1
		FROM public.user_email_connections AS connection
		WHERE connection.id = NEW.connection_id
			AND connection.user_id = NEW.user_id
			AND connection.deleted_at IS NULL
			AND connection.read_enabled = true
	) THEN
		RAISE EXCEPTION 'email_relevance_connection_scope_mismatch'
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_email_project_rule_scope()
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_email_project_rule_scope()
	TO service_role;

CREATE TRIGGER enforce_email_project_rule_scope_trigger
	BEFORE INSERT OR UPDATE OF user_id, project_id, connection_id
	ON public.email_project_rules
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_email_project_rule_scope();

CREATE OR REPLACE FUNCTION public.enforce_email_project_profile_version_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	next_version integer;
BEGIN
	PERFORM 1
	FROM public.email_project_profiles
	WHERE id = NEW.profile_id
		AND deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'email_relevance_profile_not_found'
			USING ERRCODE = 'no_data_found';
	END IF;

	SELECT COALESCE(MAX(version.profile_version), 0) + 1
	INTO next_version
	FROM public.email_project_profile_versions AS version
	WHERE version.profile_id = NEW.profile_id;

	IF NEW.profile_version <> next_version THEN
		RAISE EXCEPTION 'email_relevance_profile_version_out_of_sequence'
			USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_email_project_profile_version_sequence()
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_email_project_profile_version_sequence()
	TO service_role;

CREATE TRIGGER enforce_email_project_profile_version_sequence_trigger
	BEFORE INSERT
	ON public.email_project_profile_versions
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_email_project_profile_version_sequence();

CREATE OR REPLACE FUNCTION public.sync_email_project_profile_current_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	UPDATE public.email_project_profiles
	SET
		current_version = NEW.profile_version,
		current_profile_hash = NEW.profile_hash,
		compiler_version = NEW.compiler_version,
		source_snapshot_at = NEW.source_snapshot_at,
		updated_at = now()
	WHERE id = NEW.profile_id;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_email_project_profile_current_version()
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_email_project_profile_current_version()
	TO service_role;

CREATE TRIGGER sync_email_project_profile_current_version_trigger
	AFTER INSERT
	ON public.email_project_profile_versions
	FOR EACH ROW
	EXECUTE FUNCTION public.sync_email_project_profile_current_version();

CREATE TRIGGER email_project_profiles_set_updated_at
	BEFORE UPDATE ON public.email_project_profiles
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_project_rules_set_updated_at
	BEFORE UPDATE ON public.email_project_rules
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_project_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_project_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_project_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_project_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_project_profile_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_project_rules FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.email_project_profiles TO authenticated;
GRANT SELECT ON TABLE public.email_project_profile_versions TO authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.email_project_profiles TO service_role;
GRANT UPDATE (deleted_at) ON TABLE public.email_project_profiles TO service_role;
GRANT SELECT, INSERT ON TABLE public.email_project_profile_versions TO service_role;
GRANT ALL ON TABLE public.email_project_rules TO service_role;

CREATE POLICY email_project_profiles_owner_select
	ON public.email_project_profiles FOR SELECT
	TO authenticated
	USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY email_project_profile_versions_owner_select
	ON public.email_project_profile_versions FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM public.email_project_profiles AS profile
			WHERE profile.id = email_project_profile_versions.profile_id
				AND profile.user_id = auth.uid()
				AND profile.deleted_at IS NULL
		)
	);

CREATE POLICY email_project_profiles_service_role_all
	ON public.email_project_profiles FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE POLICY email_project_profile_versions_service_role_select
	ON public.email_project_profile_versions FOR SELECT
	TO service_role
	USING (true);

CREATE POLICY email_project_profile_versions_service_role_insert
	ON public.email_project_profile_versions FOR INSERT
	TO service_role
	WITH CHECK (true);

CREATE POLICY email_project_rules_service_role_all
	ON public.email_project_rules FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

COMMENT ON TABLE public.email_project_profiles IS
	'Current pointer for a bounded, model-free project email relevance profile.';
COMMENT ON TABLE public.email_project_profile_versions IS
	'Immutable structured profile versions derived only from owned BuildOS project data.';
COMMENT ON TABLE public.email_project_rules IS
	'Explicit exact-match relevance rules; match values are encrypted and never exposed directly to browser roles.';

COMMIT;
