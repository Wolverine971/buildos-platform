-- supabase/migrations/20260427000000_add_user_profile_living_kb.sql
-- Living user profile knowledge base tables + policies.

CREATE TABLE IF NOT EXISTS public.user_profiles (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	actor_id UUID REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	extraction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
	doc_structure JSONB NOT NULL DEFAULT '{"version":1,"root":[]}'::jsonb,
	summary TEXT,
	safe_summary TEXT,
	summary_updated_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.profile_documents (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	type_key TEXT NOT NULL DEFAULT 'chapter.general',
	content TEXT,
	summary TEXT,
	sensitivity TEXT NOT NULL DEFAULT 'standard',
	usage_scope TEXT NOT NULL DEFAULT 'all_agents',
	props JSONB NOT NULL DEFAULT '{}'::jsonb,
	search_vector TSVECTOR,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	deleted_at TIMESTAMPTZ,
	CONSTRAINT profile_documents_sensitivity_check
		CHECK (sensitivity IN ('standard', 'sensitive')),
	CONSTRAINT profile_documents_usage_scope_check
		CHECK (usage_scope IN ('all_agents', 'profile_only', 'never_prompt'))
);

CREATE TABLE IF NOT EXISTS public.profile_document_versions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	document_id UUID NOT NULL REFERENCES public.profile_documents(id) ON DELETE CASCADE,
	number INTEGER NOT NULL,
	content TEXT,
	created_by UUID REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	merge_run_id UUID,
	change_type TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT profile_document_versions_change_type_check
		CHECK (change_type IS NULL OR change_type IN ('manual_edit', 'accepted_fragment', 'merge_apply')),
	CONSTRAINT profile_document_versions_document_number_unique
		UNIQUE (document_id, number)
);

CREATE TABLE IF NOT EXISTS public.profile_document_embeddings (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	document_id UUID NOT NULL REFERENCES public.profile_documents(id) ON DELETE CASCADE,
	model_key TEXT NOT NULL,
	embedding_dim INTEGER NOT NULL,
	embedding VECTOR(1536) NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (document_id, model_key)
);

CREATE TABLE IF NOT EXISTS public.profile_fragments (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
	source_type TEXT NOT NULL,
	source_id UUID,
	content TEXT NOT NULL,
	category TEXT NOT NULL DEFAULT 'general',
	sensitivity TEXT NOT NULL DEFAULT 'standard',
	extracted_from_message_ids JSONB,
	fingerprint_hash TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	suggested_chapter_id UUID REFERENCES public.profile_documents(id) ON DELETE SET NULL,
	suggested_chapter_title TEXT,
	confidence REAL NOT NULL DEFAULT 0.5,
	status TEXT NOT NULL DEFAULT 'pending',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT profile_fragments_source_type_check
		CHECK (source_type IN ('chat', 'braindump', 'manual')),
	CONSTRAINT profile_fragments_sensitivity_check
		CHECK (sensitivity IN ('standard', 'sensitive')),
	CONSTRAINT profile_fragments_status_check
		CHECK (status IN ('pending', 'accepted', 'dismissed', 'needs_review'))
);

CREATE TABLE IF NOT EXISTS public.profile_document_sources (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	document_version_id UUID NOT NULL REFERENCES public.profile_document_versions(id) ON DELETE CASCADE,
	fragment_id UUID REFERENCES public.profile_fragments(id) ON DELETE SET NULL,
	source_type TEXT NOT NULL,
	source_id UUID,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT profile_document_sources_source_type_check
		CHECK (source_type IN ('chat', 'braindump', 'manual', 'system'))
);

CREATE TABLE IF NOT EXISTS public.profile_access_audit (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
	actor_id UUID REFERENCES public.onto_actors(id) ON DELETE SET NULL,
	access_type TEXT NOT NULL,
	context_type TEXT,
	document_ids JSONB,
	reason TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT profile_access_audit_access_type_check
		CHECK (access_type IN ('prompt_injection', 'search', 'doc_read', 'doc_write'))
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_fragments_unique_idempotency
	ON public.profile_fragments(profile_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_profile_documents_profile_id
	ON public.profile_documents(profile_id)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_documents_type_key
	ON public.profile_documents(type_key)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_documents_search_vector
	ON public.profile_documents
	USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_profile_document_versions_document_id_created_at
	ON public.profile_document_versions(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_document_embeddings_document_id
	ON public.profile_document_embeddings(document_id);

CREATE INDEX IF NOT EXISTS idx_profile_fragments_profile_status_created
	ON public.profile_fragments(profile_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_fragments_source
	ON public.profile_fragments(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_profile_access_audit_profile_created
	ON public.profile_access_audit(profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.profile_documents_set_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.search_vector :=
		to_tsvector(
			'english',
			COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, '') || ' ' || COALESCE(NEW.summary, '')
		);
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_documents_search_vector ON public.profile_documents;
CREATE TRIGGER trg_profile_documents_search_vector
BEFORE INSERT OR UPDATE OF title, content, summary
ON public.profile_documents
FOR EACH ROW
EXECUTE FUNCTION public.profile_documents_set_search_vector();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profile_documents_updated_at ON public.profile_documents;
CREATE TRIGGER trg_profile_documents_updated_at
BEFORE UPDATE ON public.profile_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profile_document_embeddings_updated_at ON public.profile_document_embeddings;
CREATE TRIGGER trg_profile_document_embeddings_updated_at
BEFORE UPDATE ON public.profile_document_embeddings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prune_stale_profile_fragments(
	p_older_than_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
	v_deleted_count INTEGER := 0;
BEGIN
	DELETE FROM public.profile_fragments
	WHERE status = 'pending'
		AND created_at < NOW() - (GREATEST(p_older_than_days, 1)::text || ' days')::interval;

	GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
	RETURN v_deleted_count;
END;
$$;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_fragments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_document_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own profile root" ON public.user_profiles;
CREATE POLICY "Users manage own profile root"
	ON public.user_profiles
	FOR ALL
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own profile documents" ON public.profile_documents;
CREATE POLICY "Users manage own profile documents"
	ON public.profile_documents
	FOR ALL
	USING (
		EXISTS (
			SELECT 1
			FROM public.user_profiles up
			WHERE up.id = profile_documents.profile_id
				AND up.user_id = auth.uid()
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1
			FROM public.user_profiles up
			WHERE up.id = profile_documents.profile_id
				AND up.user_id = auth.uid()
		)
	);

DROP POLICY IF EXISTS "Users manage own profile document versions" ON public.profile_document_versions;
CREATE POLICY "Users manage own profile document versions"
	ON public.profile_document_versions
	FOR ALL
	USING (
		EXISTS (
			SELECT 1
			FROM public.profile_documents pd
			JOIN public.user_profiles up ON up.id = pd.profile_id
			WHERE pd.id = profile_document_versions.document_id
				AND up.user_id = auth.uid()
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1
			FROM public.profile_documents pd
			JOIN public.user_profiles up ON up.id = pd.profile_id
			WHERE pd.id = profile_document_versions.document_id
				AND up.user_id = auth.uid()
		)
	);

DROP POLICY IF EXISTS "Users manage own profile embeddings" ON public.profile_document_embeddings;
CREATE POLICY "Users manage own profile embeddings"
	ON public.profile_document_embeddings
	FOR ALL
	USING (
		EXISTS (
			SELECT 1
			FROM public.profile_documents pd
			JOIN public.user_profiles up ON up.id = pd.profile_id
			WHERE pd.id = profile_document_embeddings.document_id
				AND up.user_id = auth.uid()
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1
			FROM public.profile_documents pd
			JOIN public.user_profiles up ON up.id = pd.profile_id
			WHERE pd.id = profile_document_embeddings.document_id
				AND up.user_id = auth.uid()
		)
	);

DROP POLICY IF EXISTS "Users manage own profile fragments" ON public.profile_fragments;
CREATE POLICY "Users manage own profile fragments"
	ON public.profile_fragments
	FOR ALL
	USING (
		EXISTS (
			SELECT 1
			FROM public.user_profiles up
			WHERE up.id = profile_fragments.profile_id
				AND up.user_id = auth.uid()
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1
			FROM public.user_profiles up
			WHERE up.id = profile_fragments.profile_id
				AND up.user_id = auth.uid()
		)
	);

DROP POLICY IF EXISTS "Users manage own profile document sources" ON public.profile_document_sources;
CREATE POLICY "Users manage own profile document sources"
	ON public.profile_document_sources
	FOR ALL
	USING (
		EXISTS (
			SELECT 1
			FROM public.profile_document_versions pdv
			JOIN public.profile_documents pd ON pd.id = pdv.document_id
			JOIN public.user_profiles up ON up.id = pd.profile_id
			WHERE pdv.id = profile_document_sources.document_version_id
				AND up.user_id = auth.uid()
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1
			FROM public.profile_document_versions pdv
			JOIN public.profile_documents pd ON pd.id = pdv.document_id
			JOIN public.user_profiles up ON up.id = pd.profile_id
			WHERE pdv.id = profile_document_sources.document_version_id
				AND up.user_id = auth.uid()
		)
	);

DROP POLICY IF EXISTS "Users manage own profile access audit" ON public.profile_access_audit;
CREATE POLICY "Users manage own profile access audit"
	ON public.profile_access_audit
	FOR ALL
	USING (
		EXISTS (
			SELECT 1
			FROM public.user_profiles up
			WHERE up.id = profile_access_audit.profile_id
				AND up.user_id = auth.uid()
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1
			FROM public.user_profiles up
			WHERE up.id = profile_access_audit.profile_id
				AND up.user_id = auth.uid()
		)
	);
