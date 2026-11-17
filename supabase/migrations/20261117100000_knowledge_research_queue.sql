-- supabase/migrations/20261117100000_knowledge_research_queue.sql
-- Find more at scale, phase 1 (tasker 164).
--
-- 1. Research targets carry their own instructions ("look for their podcast appearances") and a
--    live phase (searching → reading → extracting → saving) for the research tray.
-- 2. knowledge_list can filter to researched / not researched entries and sort by recent, name
--    or last researched. "Researched" is per viewer: the private entry's enriched_at, or a
--    finished research target of the viewer's own (public entries have no owner to stamp).
--    The new parameters are trailing with defaults, so existing callers keep working; the old
--    six-argument function is dropped so PostgREST never sees two overloads.
-- 3. Indexes for the tray (the user's recent runs' targets) and the researched lookup.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Per-target instructions and progress

ALTER TABLE public.knowledge_run_targets
	ADD COLUMN IF NOT EXISTS instructions text,
	ADD COLUMN IF NOT EXISTS phase text,
	ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.knowledge_run_targets
	DROP CONSTRAINT IF EXISTS knowledge_run_targets_instructions_length,
	ADD CONSTRAINT knowledge_run_targets_instructions_length
		CHECK (instructions IS NULL OR char_length(instructions) <= 1200),
	DROP CONSTRAINT IF EXISTS knowledge_run_targets_phase_check,
	ADD CONSTRAINT knowledge_run_targets_phase_check
		CHECK (phase IS NULL OR phase IN ('searching', 'reading', 'extracting', 'saving'));

COMMENT ON COLUMN public.knowledge_run_targets.instructions IS
	'What the user asked research to look for on this entry (batch + per-entry text). Falls back to knowledge_runs.input.instructions when NULL.';
COMMENT ON COLUMN public.knowledge_run_targets.phase IS
	'While running: searching, reading, extracting or saving. Written by the research worker.';

-- "Researched" lookups: the viewer's finished targets for an entry.
CREATE INDEX IF NOT EXISTS knowledge_run_targets_owner_entity_done
	ON public.knowledge_run_targets (owner_user_id, entity_id, finished_at DESC)
	WHERE status = 'done';

-- ---------------------------------------------------------------------------
-- 2. knowledge_list with a researched filter and a sort

DROP FUNCTION IF EXISTS public.knowledge_list(text[], text, text, integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.knowledge_list(
	p_kinds text[] DEFAULT NULL,
	p_filter text DEFAULT 'all',
	p_query text DEFAULT NULL,
	p_limit integer DEFAULT 50,
	p_offset integer DEFAULT 0,
	p_viewer uuid DEFAULT NULL,
	p_researched text DEFAULT 'any',
	p_sort text DEFAULT 'recent'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
	v_self uuid;
	v_limit integer := LEAST(GREATEST(coalesce(p_limit, 50), 1), 500);
	v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
	v_researched text := coalesce(p_researched, 'any');
	v_sort text := coalesce(p_sort, 'recent');
	v_result jsonb;
BEGIN
	IF p_filter IS NOT NULL AND p_filter NOT IN ('all', 'known', 'owned') THEN
		RAISE EXCEPTION 'filter must be all, known or owned' USING ERRCODE = '22023';
	END IF;
	IF v_researched NOT IN ('any', 'yes', 'no') THEN
		RAISE EXCEPTION 'researched must be any, yes or no' USING ERRCODE = '22023';
	END IF;
	IF v_sort NOT IN ('recent', 'name', 'researched') THEN
		RAISE EXCEPTION 'sort must be recent, name or researched' USING ERRCODE = '22023';
	END IF;

	SELECT id INTO v_self FROM public.knowledge_entities
	WHERE owner_user_id = v_viewer AND is_self;

	WITH known AS (
		SELECT DISTINCT f.object_entity_id AS id
		FROM public.knowledge_facts f
		WHERE v_self IS NOT NULL AND f.entity_id = v_self AND f.predicate = 'knows'
			AND f.owner_user_id = v_viewer AND f.status IN ('active', 'suggested', 'disputed')
	),
	owned AS (
		SELECT DISTINCT f.object_entity_id AS id
		FROM public.knowledge_facts f
		WHERE v_self IS NOT NULL AND f.entity_id = v_self AND f.predicate = 'owns'
			AND f.owner_user_id = v_viewer AND f.status IN ('active', 'suggested', 'disputed')
	),
	-- Public entries count as "mine" once the viewer has recorded something about them.
	touched AS (
		SELECT f.entity_id AS id FROM public.knowledge_facts f WHERE f.owner_user_id = v_viewer
		UNION
		SELECT f.object_entity_id FROM public.knowledge_facts f
		WHERE f.owner_user_id = v_viewer AND f.object_entity_id IS NOT NULL
	),
	matched AS (
		SELECT s.entity_id AS id
		FROM public.knowledge_search(p_query, NULL, 100, v_viewer) s
		WHERE p_query IS NOT NULL AND btrim(p_query) <> ''
	),
	-- The viewer's own finished research, newest per entry.
	researched AS (
		SELECT t.entity_id AS id, max(t.finished_at) AS at
		FROM public.knowledge_run_targets t
		WHERE t.owner_user_id = v_viewer AND t.status = 'done'
		GROUP BY t.entity_id
	),
	base AS (
		SELECT e.id, e.kind, e.name, e.normalized_name, e.summary, e.scope, e.image_url,
			e.updated_at,
			-- GREATEST skips NULLs: NULL only when neither says researched.
			GREATEST(CASE WHEN e.owner_user_id = v_viewer THEN e.enriched_at END, r.at)
				AS researched_at
		FROM public.knowledge_entities e
		LEFT JOIN researched r ON r.id = e.id
		WHERE e.status = 'active' AND NOT e.is_self
			AND (e.owner_user_id = v_viewer
				OR (e.scope = 'public' AND e.id IN (SELECT id FROM touched)))
			AND (coalesce(p_filter, 'all') <> 'known' OR e.id IN (SELECT id FROM known))
			AND (coalesce(p_filter, 'all') <> 'owned' OR e.id IN (SELECT id FROM owned))
			AND (p_query IS NULL OR btrim(p_query) = '' OR e.id IN (SELECT id FROM matched))
	),
	kinded AS (
		SELECT * FROM base WHERE p_kinds IS NULL OR kind = ANY (p_kinds)
	),
	pool AS (
		SELECT * FROM base
		WHERE v_researched = 'any'
			OR (v_researched = 'yes' AND researched_at IS NOT NULL)
			OR (v_researched = 'no' AND researched_at IS NULL)
	),
	filtered AS (
		SELECT * FROM pool WHERE p_kinds IS NULL OR kind = ANY (p_kinds)
	),
	page AS (
		SELECT f.*,
			row_number() OVER (ORDER BY
				CASE WHEN v_sort = 'name' THEN f.normalized_name END ASC,
				CASE WHEN v_sort = 'researched' THEN f.researched_at END DESC NULLS LAST,
				f.updated_at DESC, f.id) AS pos
		FROM filtered f
		ORDER BY pos
		LIMIT v_limit OFFSET v_offset
	)
	SELECT jsonb_build_object(
		'entities', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'id', p.id, 'kind', p.kind, 'name', p.name, 'summary', p.summary,
				'scope', p.scope, 'is_self', false, 'image_url', p.image_url,
				'updated_at', p.updated_at, 'researched_at', p.researched_at
			) ORDER BY p.pos)
			FROM page p
		), '[]'::jsonb),
		'total', (SELECT count(*) FROM filtered),
		'counts', coalesce((
			SELECT jsonb_object_agg(kind, n)
			FROM (SELECT kind, count(*) AS n FROM pool GROUP BY kind) c
		), '{}'::jsonb),
		-- Researched / not researched among the current kind and filter, whatever p_researched is.
		'researched', jsonb_build_object(
			'yes', (SELECT count(*) FROM kinded WHERE researched_at IS NOT NULL),
			'no', (SELECT count(*) FROM kinded WHERE researched_at IS NULL)
		),
		'known_count', (
			SELECT count(*) FROM public.knowledge_entities e
			WHERE e.id IN (SELECT id FROM known) AND e.status = 'active'
				AND (e.scope = 'public' OR e.owner_user_id = v_viewer)
		)
	) INTO v_result;

	RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid, text, text) TO authenticated, service_role;

COMMIT;
