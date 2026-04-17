-- supabase/migrations/20260430000000_add_public_page_views.sql
-- apps/web/docs/features/public-pages/phase-1-ui-brief.md §Views
--
-- View tracking for public pages. Privacy notes:
--   * No raw IP stored. `viewer_hash` is a salted SHA256 of ip+user_agent.
--     The salt is a stable application-layer constant (see
--     apps/web/src/routes/api/public/pages/[slug]/view/+server.ts) so the
--     24-hour dedup query against `viewed_at` can match the same viewer
--     across UTC midnight. Rotating the salt daily was considered; we use a
--     stable salt + 24h viewed_at window instead.
--   * Author's own views are logged but flagged via `is_author` and excluded
--     from the public-facing counters.
--   * Known crawler user-agents are filtered at the application layer and
--     never reach this table.

CREATE TABLE IF NOT EXISTS public.onto_public_page_views (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	public_page_id UUID NOT NULL REFERENCES public.onto_public_pages(id) ON DELETE CASCADE,
	viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	viewer_hash TEXT,
	referrer TEXT,
	is_author BOOLEAN NOT NULL DEFAULT false,
	session_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onto_public_page_views_page_viewed_at
	ON public.onto_public_page_views (public_page_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_onto_public_page_views_page_viewer_hash
	ON public.onto_public_page_views (public_page_id, viewer_hash)
	WHERE viewer_hash IS NOT NULL;

-- Counter columns on the denormalized view-count fields. `view_count_all`
-- updates transactionally; `view_count_30d` is refreshed by a nightly worker.
ALTER TABLE public.onto_public_pages
	ADD COLUMN IF NOT EXISTS view_count_all INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS view_count_30d INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS view_count_30d_updated_at TIMESTAMPTZ;

-- RLS: same posture as the parent table — admins read all, everyone else via
-- the service layer. No direct inserts from anon role.
ALTER TABLE public.onto_public_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages public page views"
	ON public.onto_public_page_views
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- Atomic increment RPC. Called from the view-log endpoint after dedup has
-- already been resolved upstream. Splits the non-author count cleanly.
CREATE OR REPLACE FUNCTION public.increment_onto_public_page_view_count(
	p_public_page_id UUID,
	p_is_author BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	new_count INTEGER;
BEGIN
	IF p_is_author THEN
		-- Author views are recorded in the detail table (for the author's own
		-- analytics) but do not bump the public counter.
		SELECT view_count_all INTO new_count
		FROM public.onto_public_pages
		WHERE id = p_public_page_id;
		RETURN COALESCE(new_count, 0);
	END IF;

	UPDATE public.onto_public_pages
	SET view_count_all = view_count_all + 1
	WHERE id = p_public_page_id
	RETURNING view_count_all INTO new_count;

	RETURN COALESCE(new_count, 0);
END;
$$;

-- 30-day rollup. Runs from the worker; recomputes from the detail table so
-- we can be loose with the `view_count_all` counter if an insert ever races.
CREATE OR REPLACE FUNCTION public.refresh_onto_public_page_30d_counts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	pages_updated INTEGER;
BEGIN
	WITH counts AS (
		SELECT
			public_page_id,
			count(*) FILTER (WHERE NOT is_author AND viewed_at >= now() - INTERVAL '30 days') AS c30
		FROM public.onto_public_page_views
		GROUP BY public_page_id
	)
	UPDATE public.onto_public_pages p
	SET view_count_30d = COALESCE(c.c30, 0),
		view_count_30d_updated_at = now()
	FROM counts c
	WHERE c.public_page_id = p.id;

	GET DIAGNOSTICS pages_updated = ROW_COUNT;
	RETURN pages_updated;
END;
$$;
