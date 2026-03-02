-- supabase/migrations/20260428000000_add_user_contacts_agentic_memory.sql
-- User-owned contacts memory tables for agentic retrieval, conflict-safe ingestion, and auditability.

CREATE TABLE IF NOT EXISTS public.user_contacts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
	display_name TEXT NOT NULL,
	given_name TEXT,
	family_name TEXT,
	nickname TEXT,
	organization TEXT,
	title TEXT,
	notes TEXT,
	relationship_label TEXT,
	linked_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
	linked_actor_id UUID REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	sensitivity TEXT NOT NULL DEFAULT 'sensitive',
	usage_scope TEXT NOT NULL DEFAULT 'profile_only',
	status TEXT NOT NULL DEFAULT 'active',
	merged_into_contact_id UUID REFERENCES public.user_contacts(id) ON DELETE SET NULL,
	first_seen_source TEXT NOT NULL DEFAULT 'chat',
	first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_confirmed_at TIMESTAMPTZ,
	confidence REAL NOT NULL DEFAULT 0.7,
	normalized_name TEXT,
	search_vector TSVECTOR,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	deleted_at TIMESTAMPTZ,
	CONSTRAINT user_contacts_sensitivity_check
		CHECK (sensitivity IN ('standard', 'sensitive')),
	CONSTRAINT user_contacts_usage_scope_check
		CHECK (usage_scope IN ('all_agents', 'profile_only', 'never_prompt')),
	CONSTRAINT user_contacts_status_check
		CHECK (status IN ('active', 'archived', 'merged')),
	CONSTRAINT user_contacts_first_seen_source_check
		CHECK (first_seen_source IN ('chat', 'manual', 'import'))
);

CREATE TABLE IF NOT EXISTS public.user_contact_methods (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	contact_id UUID NOT NULL REFERENCES public.user_contacts(id) ON DELETE CASCADE,
	method_type TEXT NOT NULL,
	label TEXT,
	value_raw TEXT NOT NULL,
	value_normalized TEXT NOT NULL,
	value_hash TEXT NOT NULL,
	is_primary BOOLEAN NOT NULL DEFAULT FALSE,
	is_verified BOOLEAN NOT NULL DEFAULT FALSE,
	verification_source TEXT NOT NULL DEFAULT 'inferred',
	confidence REAL NOT NULL DEFAULT 0.7,
	sensitivity TEXT NOT NULL DEFAULT 'sensitive',
	usage_scope TEXT NOT NULL DEFAULT 'profile_only',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	deleted_at TIMESTAMPTZ,
	CONSTRAINT user_contact_methods_type_check
		CHECK (
			method_type IN ('phone', 'email', 'sms', 'whatsapp', 'telegram', 'website', 'address', 'other')
		),
	CONSTRAINT user_contact_methods_sensitivity_check
		CHECK (sensitivity IN ('standard', 'sensitive')),
	CONSTRAINT user_contact_methods_usage_scope_check
		CHECK (usage_scope IN ('all_agents', 'profile_only', 'never_prompt')),
	CONSTRAINT user_contact_methods_verification_source_check
		CHECK (verification_source IN ('inferred', 'user_confirmed', 'import'))
);

CREATE TABLE IF NOT EXISTS public.user_contact_observations (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	source_type TEXT NOT NULL,
	source_id UUID,
	session_id UUID,
	proposed_display_name TEXT,
	proposed_method_type TEXT,
	proposed_method_value TEXT,
	proposed_method_normalized TEXT,
	proposed_method_hash TEXT,
	relationship_label TEXT,
	confidence REAL NOT NULL DEFAULT 0.5,
	inference_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
	idempotency_key TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	resolved_contact_id UUID REFERENCES public.user_contacts(id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	resolved_at TIMESTAMPTZ,
	CONSTRAINT user_contact_observations_source_check
		CHECK (source_type IN ('chat', 'manual', 'import')),
	CONSTRAINT user_contact_observations_status_check
		CHECK (status IN ('pending', 'applied', 'needs_confirmation', 'dismissed')),
	CONSTRAINT user_contact_observations_method_type_check
		CHECK (
			proposed_method_type IS NULL
			OR proposed_method_type IN ('phone', 'email', 'sms', 'whatsapp', 'telegram', 'website', 'address', 'other')
		),
	CONSTRAINT user_contact_observations_unique_idempotency
		UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.user_contact_merge_candidates (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	observation_id UUID REFERENCES public.user_contact_observations(id) ON DELETE SET NULL,
	primary_contact_id UUID NOT NULL REFERENCES public.user_contacts(id) ON DELETE CASCADE,
	secondary_contact_id UUID NOT NULL REFERENCES public.user_contacts(id) ON DELETE CASCADE,
	reason TEXT NOT NULL,
	score REAL NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	resolved_at TIMESTAMPTZ,
	resolved_by_actor_id UUID REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	CONSTRAINT user_contact_merge_candidates_status_check
		CHECK (status IN ('pending', 'confirmed_merge', 'rejected', 'snoozed')),
	CONSTRAINT user_contact_merge_candidates_distinct_contacts
		CHECK (primary_contact_id <> secondary_contact_id)
);

CREATE TABLE IF NOT EXISTS public.user_contact_links (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	contact_id UUID NOT NULL REFERENCES public.user_contacts(id) ON DELETE CASCADE,
	link_type TEXT NOT NULL,
	profile_document_id UUID REFERENCES public.profile_documents(id) ON DELETE CASCADE,
	profile_fragment_id UUID REFERENCES public.profile_fragments(id) ON DELETE CASCADE,
	actor_id UUID REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	project_id UUID REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	entity_type TEXT,
	entity_id UUID,
	props JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_by_actor_id UUID REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	CONSTRAINT user_contact_links_type_check
		CHECK (link_type IN ('profile_document', 'profile_fragment', 'onto_actor', 'onto_entity'))
);

CREATE TABLE IF NOT EXISTS public.user_contact_access_audit (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	contact_id UUID REFERENCES public.user_contacts(id) ON DELETE SET NULL,
	actor_id UUID REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	access_type TEXT NOT NULL,
	context_type TEXT,
	reason TEXT,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT user_contact_access_audit_type_check
		CHECK (
			access_type IN ('search', 'method_read', 'method_write', 'merge', 'link', 'prompt_injection', 'action_prepare')
		)
);

CREATE INDEX IF NOT EXISTS idx_user_contacts_user_active
	ON public.user_contacts(user_id, updated_at DESC)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_contacts_linked_actor
	ON public.user_contacts(user_id, linked_actor_id)
	WHERE linked_actor_id IS NOT NULL
		AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_contacts_profile_id
	ON public.user_contacts(profile_id)
	WHERE profile_id IS NOT NULL
		AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_contact_methods_contact
	ON public.user_contact_methods(contact_id, method_type, updated_at DESC)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_contact_methods_user_hash
	ON public.user_contact_methods(user_id, method_type, value_hash)
	WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_contact_methods_unique_per_contact
	ON public.user_contact_methods(contact_id, method_type, value_hash)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_contact_observations_user_status
	ON public.user_contact_observations(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_contact_merge_candidates_user_status
	ON public.user_contact_merge_candidates(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_contact_links_contact
	ON public.user_contact_links(contact_id, link_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_contact_access_audit_user_created
	ON public.user_contact_access_audit(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.user_contacts_set_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.search_vector :=
		to_tsvector(
			'english',
			COALESCE(NEW.display_name, '') || ' ' ||
			COALESCE(NEW.given_name, '') || ' ' ||
			COALESCE(NEW.family_name, '') || ' ' ||
			COALESCE(NEW.nickname, '') || ' ' ||
			COALESCE(NEW.organization, '') || ' ' ||
			COALESCE(NEW.title, '') || ' ' ||
			COALESCE(NEW.relationship_label, '') || ' ' ||
			COALESCE(NEW.notes, '')
		);
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_contacts_search_vector ON public.user_contacts;
CREATE TRIGGER trg_user_contacts_search_vector
BEFORE INSERT OR UPDATE OF display_name, given_name, family_name, nickname, organization, title, relationship_label, notes
ON public.user_contacts
FOR EACH ROW
EXECUTE FUNCTION public.user_contacts_set_search_vector();

DROP TRIGGER IF EXISTS trg_user_contacts_updated_at ON public.user_contacts;
CREATE TRIGGER trg_user_contacts_updated_at
BEFORE UPDATE ON public.user_contacts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_contact_methods_updated_at ON public.user_contact_methods;
CREATE TRIGGER trg_user_contact_methods_updated_at
BEFORE UPDATE ON public.user_contact_methods
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contact_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contact_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contact_merge_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contact_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own contacts" ON public.user_contacts;
CREATE POLICY "Users manage own contacts"
	ON public.user_contacts
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own contact methods" ON public.user_contact_methods;
CREATE POLICY "Users manage own contact methods"
	ON public.user_contact_methods
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own contact observations" ON public.user_contact_observations;
CREATE POLICY "Users manage own contact observations"
	ON public.user_contact_observations
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own contact merge candidates" ON public.user_contact_merge_candidates;
CREATE POLICY "Users manage own contact merge candidates"
	ON public.user_contact_merge_candidates
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own contact links" ON public.user_contact_links;
CREATE POLICY "Users manage own contact links"
	ON public.user_contact_links
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own contact access audit" ON public.user_contact_access_audit;
CREATE POLICY "Users manage own contact access audit"
	ON public.user_contact_access_audit
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

