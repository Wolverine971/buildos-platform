-- supabase/migrations/20260428000001_add_public_pages.sql
-- Public pages for document-level publishing with live sync.

CREATE TABLE IF NOT EXISTS public.onto_public_pages (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id UUID NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	document_id UUID NOT NULL REFERENCES public.onto_documents(id) ON DELETE CASCADE,
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	summary TEXT,
	status TEXT NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'published', 'unpublished', 'archived')),
	visibility TEXT NOT NULL DEFAULT 'public'
		CHECK (visibility IN ('public', 'unlisted')),
	noindex BOOLEAN NOT NULL DEFAULT FALSE,
	published_version_number INTEGER,
	published_content TEXT,
	published_description TEXT,
	published_props JSONB NOT NULL DEFAULT '{}'::jsonb,
	live_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
	public_status TEXT NOT NULL DEFAULT 'not_public'
		CHECK (public_status IN ('not_public', 'pending_confirmation', 'live', 'unpublished', 'archived')),
	last_live_sync_at TIMESTAMPTZ,
	last_live_sync_error TEXT,
	created_by UUID NOT NULL REFERENCES public.onto_actors(id),
	updated_by UUID NOT NULL REFERENCES public.onto_actors(id),
	published_by UUID REFERENCES public.onto_actors(id),
	published_at TIMESTAMPTZ,
	last_unpublished_at TIMESTAMPTZ,
	deleted_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT onto_public_pages_slug_format
		CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS public.onto_public_page_slug_history (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	public_page_id UUID NOT NULL REFERENCES public.onto_public_pages(id) ON DELETE CASCADE,
	project_id UUID NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	old_slug TEXT NOT NULL,
	new_slug TEXT NOT NULL,
	changed_by UUID REFERENCES public.onto_actors(id),
	changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onto_public_pages_slug_active
	ON public.onto_public_pages (lower(slug))
	WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_onto_public_pages_document_active
	ON public.onto_public_pages (document_id)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_public_pages_project
	ON public.onto_public_pages (project_id, created_at DESC)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_public_pages_live
	ON public.onto_public_pages (status, public_status, visibility)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_public_page_slug_history_lookup
	ON public.onto_public_page_slug_history (lower(old_slug), changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_onto_public_page_slug_history_page
	ON public.onto_public_page_slug_history (public_page_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.track_onto_public_page_slug_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
		INSERT INTO public.onto_public_page_slug_history (
			public_page_id,
			project_id,
			old_slug,
			new_slug,
			changed_by
		)
		VALUES (
			NEW.id,
			NEW.project_id,
			OLD.slug,
			NEW.slug,
			COALESCE(NEW.updated_by, OLD.updated_by)
		);
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onto_public_pages_updated_at ON public.onto_public_pages;
CREATE TRIGGER trg_onto_public_pages_updated_at
	BEFORE UPDATE ON public.onto_public_pages
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_onto_public_pages_slug_history ON public.onto_public_pages;
CREATE TRIGGER trg_onto_public_pages_slug_history
	AFTER UPDATE OF slug ON public.onto_public_pages
	FOR EACH ROW
	EXECUTE FUNCTION public.track_onto_public_page_slug_history();

ALTER TABLE public.onto_public_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onto_public_page_slug_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_page_select_public ON public.onto_public_pages;
CREATE POLICY public_page_select_public
	ON public.onto_public_pages
	FOR SELECT
	USING (
		status = 'published'
		AND public_status = 'live'
		AND visibility = 'public'
		AND deleted_at IS NULL
	);

DROP POLICY IF EXISTS public_page_select_member ON public.onto_public_pages;
CREATE POLICY public_page_select_member
	ON public.onto_public_pages
	FOR SELECT
	USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS public_page_insert_member ON public.onto_public_pages;
CREATE POLICY public_page_insert_member
	ON public.onto_public_pages
	FOR INSERT
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS public_page_update_member ON public.onto_public_pages;
CREATE POLICY public_page_update_member
	ON public.onto_public_pages
	FOR UPDATE
	USING (current_actor_has_project_access(project_id, 'write'))
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS public_page_delete_member ON public.onto_public_pages;
CREATE POLICY public_page_delete_member
	ON public.onto_public_pages
	FOR DELETE
	USING (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS public_page_select_admin ON public.onto_public_pages;
CREATE POLICY public_page_select_admin
	ON public.onto_public_pages
	FOR SELECT
	USING (is_admin());

DROP POLICY IF EXISTS public_page_insert_admin ON public.onto_public_pages;
CREATE POLICY public_page_insert_admin
	ON public.onto_public_pages
	FOR INSERT
	WITH CHECK (is_admin());

DROP POLICY IF EXISTS public_page_update_admin ON public.onto_public_pages;
CREATE POLICY public_page_update_admin
	ON public.onto_public_pages
	FOR UPDATE
	USING (is_admin());

DROP POLICY IF EXISTS public_page_delete_admin ON public.onto_public_pages;
CREATE POLICY public_page_delete_admin
	ON public.onto_public_pages
	FOR DELETE
	USING (is_admin());

DROP POLICY IF EXISTS public_page_slug_history_select_public ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_select_public
	ON public.onto_public_page_slug_history
	FOR SELECT
	USING (
		EXISTS (
			SELECT 1
			FROM public.onto_public_pages p
			WHERE p.id = public_page_id
				AND p.status = 'published'
				AND p.public_status = 'live'
				AND p.visibility = 'public'
				AND p.deleted_at IS NULL
		)
	);

DROP POLICY IF EXISTS public_page_slug_history_select_member ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_select_member
	ON public.onto_public_page_slug_history
	FOR SELECT
	USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS public_page_slug_history_insert_member ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_insert_member
	ON public.onto_public_page_slug_history
	FOR INSERT
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS public_page_slug_history_update_member ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_update_member
	ON public.onto_public_page_slug_history
	FOR UPDATE
	USING (current_actor_has_project_access(project_id, 'write'))
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS public_page_slug_history_delete_member ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_delete_member
	ON public.onto_public_page_slug_history
	FOR DELETE
	USING (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS public_page_slug_history_select_admin ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_select_admin
	ON public.onto_public_page_slug_history
	FOR SELECT
	USING (is_admin());

DROP POLICY IF EXISTS public_page_slug_history_insert_admin ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_insert_admin
	ON public.onto_public_page_slug_history
	FOR INSERT
	WITH CHECK (is_admin());

DROP POLICY IF EXISTS public_page_slug_history_update_admin ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_update_admin
	ON public.onto_public_page_slug_history
	FOR UPDATE
	USING (is_admin());

DROP POLICY IF EXISTS public_page_slug_history_delete_admin ON public.onto_public_page_slug_history;
CREATE POLICY public_page_slug_history_delete_admin
	ON public.onto_public_page_slug_history
	FOR DELETE
	USING (is_admin());

