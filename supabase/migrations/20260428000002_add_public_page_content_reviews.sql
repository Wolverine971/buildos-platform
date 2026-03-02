-- supabase/migrations/20260428000002_add_public_page_content_reviews.sql
-- Content review attempts for public page publish + live sync moderation

CREATE TABLE IF NOT EXISTS public.onto_public_page_review_attempts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id UUID NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	document_id UUID NOT NULL REFERENCES public.onto_documents(id) ON DELETE CASCADE,
	public_page_id UUID REFERENCES public.onto_public_pages(id) ON DELETE SET NULL,
	source TEXT NOT NULL
		CHECK (source IN ('publish_confirm', 'live_sync', 'manual_retry')),
	status TEXT NOT NULL
		CHECK (status IN ('passed', 'flagged', 'error')),
	policy_version TEXT NOT NULL DEFAULT 'public_page_policy_v1',
	summary TEXT,
	reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
	text_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
	image_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
	review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_by UUID NOT NULL REFERENCES public.onto_actors(id),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onto_public_page_reviews_project_created
	ON public.onto_public_page_review_attempts (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onto_public_page_reviews_document_created
	ON public.onto_public_page_review_attempts (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onto_public_page_reviews_status_created
	ON public.onto_public_page_review_attempts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onto_public_page_reviews_page_created
	ON public.onto_public_page_review_attempts (public_page_id, created_at DESC);

ALTER TABLE public.onto_public_page_review_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_page_reviews_select_member ON public.onto_public_page_review_attempts;
CREATE POLICY public_page_reviews_select_member
	ON public.onto_public_page_review_attempts
	FOR SELECT
	USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS public_page_reviews_insert_member ON public.onto_public_page_review_attempts;
CREATE POLICY public_page_reviews_insert_member
	ON public.onto_public_page_review_attempts
	FOR INSERT
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS public_page_reviews_select_admin ON public.onto_public_page_review_attempts;
CREATE POLICY public_page_reviews_select_admin
	ON public.onto_public_page_review_attempts
	FOR SELECT
	USING (is_admin());

DROP POLICY IF EXISTS public_page_reviews_insert_admin ON public.onto_public_page_review_attempts;
CREATE POLICY public_page_reviews_insert_admin
	ON public.onto_public_page_review_attempts
	FOR INSERT
	WITH CHECK (is_admin());
