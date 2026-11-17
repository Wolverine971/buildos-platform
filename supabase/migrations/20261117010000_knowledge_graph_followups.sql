-- supabase/migrations/20261117010000_knowledge_graph_followups.sql
-- Knowledge graph follow-ups after review (tasker 160).
--
-- 1. knowledge_list: the browse page's list, per-kind counts and "people I know" count in one
--    call. Before, the store paged through every entity and every fact the user owns (about 60
--    requests per page load after a 10k-contact import).
-- 2. Merge candidates store each pair in a fixed order (entity_a < entity_b) under a plain
--    unique constraint, so writers can upsert a batch instead of inserting one row at a time.
-- 3. knowledge_search: 1–2 character terms only prefix-match names (a trigram index cannot serve
--    LIKE '%xy%', so short substring searches scanned every row of every user).
-- 4. Research spend caps: signed-in users could insert runs with a negative cost or mark a running
--    run finished, defeating the daily cap. Runs are now written only by the server, costs can't be
--    negative, and starting a research run checks the caps and inserts under a per-user lock.
-- 5. Deleting an entry that others were merged into failed (merged_into_id went NULL while status
--    stayed 'merged'). The merged-away tombstones now go with it.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. knowledge_list

CREATE OR REPLACE FUNCTION public.knowledge_list(
	p_kinds text[] DEFAULT NULL,
	p_filter text DEFAULT 'all',
	p_query text DEFAULT NULL,
	p_limit integer DEFAULT 50,
	p_offset integer DEFAULT 0,
	p_viewer uuid DEFAULT NULL
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
	v_result jsonb;
BEGIN
	IF p_filter IS NOT NULL AND p_filter NOT IN ('all', 'known', 'owned') THEN
		RAISE EXCEPTION 'filter must be all, known or owned' USING ERRCODE = '22023';
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
	pool AS (
		SELECT e.id, e.kind, e.name, e.summary, e.scope, e.image_url, e.updated_at
		FROM public.knowledge_entities e
		WHERE e.status = 'active' AND NOT e.is_self
			AND (e.owner_user_id = v_viewer
				OR (e.scope = 'public' AND e.id IN (SELECT id FROM touched)))
			AND (coalesce(p_filter, 'all') <> 'known' OR e.id IN (SELECT id FROM known))
			AND (coalesce(p_filter, 'all') <> 'owned' OR e.id IN (SELECT id FROM owned))
			AND (p_query IS NULL OR btrim(p_query) = '' OR e.id IN (SELECT id FROM matched))
	),
	filtered AS (
		SELECT * FROM pool WHERE p_kinds IS NULL OR kind = ANY (p_kinds)
	),
	page AS (
		SELECT * FROM filtered
		ORDER BY updated_at DESC, id
		LIMIT v_limit OFFSET v_offset
	)
	SELECT jsonb_build_object(
		'entities', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'id', p.id, 'kind', p.kind, 'name', p.name, 'summary', p.summary,
				'scope', p.scope, 'is_self', false, 'image_url', p.image_url,
				'updated_at', p.updated_at
			) ORDER BY p.updated_at DESC, p.id)
			FROM page p
		), '[]'::jsonb),
		'total', (SELECT count(*) FROM filtered),
		'counts', coalesce((
			SELECT jsonb_object_agg(kind, n)
			FROM (SELECT kind, count(*) AS n FROM pool GROUP BY kind) c
		), '{}'::jsonb),
		'known_count', (
			SELECT count(*) FROM public.knowledge_entities e
			WHERE e.id IN (SELECT id FROM known) AND e.status = 'active'
				AND (e.scope = 'public' OR e.owner_user_id = v_viewer)
		)
	) INTO v_result;

	RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Merge candidate pairs in a fixed order

DROP INDEX IF EXISTS public.knowledge_merge_candidates_pair;
ALTER TABLE public.knowledge_merge_candidates
	DROP CONSTRAINT IF EXISTS knowledge_merge_candidates_distinct,
	ADD CONSTRAINT knowledge_merge_candidates_ordered CHECK (entity_a < entity_b),
	ADD CONSTRAINT knowledge_merge_candidates_pair UNIQUE (owner_user_id, entity_a, entity_b);

-- ---------------------------------------------------------------------------
-- 3. knowledge_search: short terms prefix-match names only

CREATE OR REPLACE FUNCTION public.knowledge_search(
	p_query text,
	p_kinds text[] DEFAULT NULL,
	p_limit integer DEFAULT 20,
	p_viewer uuid DEFAULT NULL
) RETURNS TABLE (
	entity_id uuid,
	kind text,
	name text,
	summary text,
	scope text,
	is_self boolean,
	matched_on text,
	score real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
	v_term text := lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'));
	v_short boolean;
	v_like text;
BEGIN
	IF char_length(v_term) < 1 THEN
		RETURN;
	END IF;
	v_short := char_length(v_term) < 3;
	-- LIKE wildcards in the user's text are literal characters.
	v_like := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');
	RETURN QUERY
	WITH hits AS (
		SELECT e.id, 'name'::text AS matched_on,
			GREATEST(
				CASE WHEN v_short THEN 0 ELSE similarity(e.normalized_name, v_term) END,
				CASE WHEN e.normalized_name = v_term THEN 1.0
					WHEN e.normalized_name LIKE v_like || '%' THEN 0.9
					WHEN NOT v_short AND e.normalized_name LIKE '%' || v_like || '%' THEN 0.7
					ELSE 0 END)::real AS score
		FROM public.knowledge_entities e
		WHERE e.status = 'active'
			AND (e.scope = 'public' OR e.owner_user_id = v_viewer)
			AND (CASE WHEN v_short THEN e.normalized_name LIKE v_like || '%'
				ELSE (e.normalized_name % v_term OR e.normalized_name LIKE '%' || v_like || '%') END)
		UNION ALL
		SELECT f.entity_id, f.predicate,
			(GREATEST(similarity(lower(f.value_text), v_term),
				CASE WHEN lower(f.value_text) LIKE '%' || v_like || '%' THEN 0.75 ELSE 0 END) * 0.95)::real
		FROM public.knowledge_facts f
		WHERE NOT v_short
			AND f.predicate IN ('alias', 'email', 'headline', 'homepage', 'url')
			AND f.status IN ('active', 'suggested')
			AND (f.scope = 'public' OR f.owner_user_id = v_viewer)
			AND (lower(f.value_text) % v_term OR lower(f.value_text) LIKE '%' || v_like || '%')
	),
	best AS (
		SELECT DISTINCT ON (h.id) h.id, h.matched_on, h.score
		FROM hits h
		ORDER BY h.id, h.score DESC
	)
	SELECT e.id, e.kind, e.name, e.summary, e.scope, e.is_self, b.matched_on, b.score
	FROM best b
	JOIN public.knowledge_entities e ON e.id = b.id
	WHERE e.status = 'active'
		AND (e.scope = 'public' OR e.owner_user_id = v_viewer)
		AND (p_kinds IS NULL OR e.kind = ANY (p_kinds))
	ORDER BY b.score DESC, e.name
	LIMIT LEAST(GREATEST(coalesce(p_limit, 20), 1), 100);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Runs are server-written; research starts atomically

DROP POLICY IF EXISTS knowledge_runs_insert ON public.knowledge_runs;
DROP POLICY IF EXISTS knowledge_runs_cancel ON public.knowledge_runs;
REVOKE INSERT, UPDATE ON TABLE public.knowledge_runs FROM authenticated;

ALTER TABLE public.knowledge_runs
	ADD CONSTRAINT knowledge_runs_cost_nonnegative CHECK (cost_usd >= 0),
	ADD CONSTRAINT knowledge_runs_budget_nonnegative CHECK (budget_usd IS NULL OR budget_usd >= 0);
ALTER TABLE public.knowledge_run_targets
	ADD CONSTRAINT knowledge_run_targets_cost_nonnegative CHECK (cost_usd >= 0);

-- Checks the research caps and creates the run under a per-user lock, so parallel requests
-- cannot all pass the checks. A queued/running run that hasn't moved for 30 minutes no longer
-- counts as active (its worker died); it still counts at its budget toward today's spend.
-- Server-only (service role): the caller passes the user it acts for.
CREATE OR REPLACE FUNCTION public.knowledge_reserve_enrichment_run(
	p_user uuid,
	p_title text,
	p_input jsonb,
	p_stats jsonb,
	p_requested_budget numeric,
	p_run_max numeric,
	p_daily_max numeric,
	p_active_max integer
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_active integer;
	v_committed numeric;
	v_budget numeric;
	v_id uuid;
BEGIN
	IF p_user IS NULL THEN
		RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
	END IF;
	PERFORM pg_advisory_xact_lock(hashtextextended('knowledge_enrich:' || p_user::text, 0));

	SELECT count(*) INTO v_active
	FROM public.knowledge_runs
	WHERE owner_user_id = p_user AND run_type = 'enrichment'
		AND status IN ('queued', 'running')
		AND updated_at > now() - interval '30 minutes';
	IF v_active >= p_active_max THEN
		RETURN jsonb_build_object('error', 'busy', 'active', v_active);
	END IF;

	SELECT coalesce(sum(CASE WHEN status IN ('queued', 'running')
			THEN GREATEST(coalesce(budget_usd, 0), cost_usd) ELSE cost_usd END), 0)
	INTO v_committed
	FROM public.knowledge_runs
	WHERE owner_user_id = p_user AND run_type = 'enrichment'
		AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

	v_budget := LEAST(p_requested_budget, p_run_max, p_daily_max - v_committed);
	IF v_budget IS NULL OR v_budget < 0.005 THEN
		RETURN jsonb_build_object('error', 'spent', 'committed', v_committed);
	END IF;

	INSERT INTO public.knowledge_runs(owner_user_id, run_type, status, title, input, stats, budget_usd)
	VALUES (p_user, 'enrichment', 'queued', left(p_title, 200), coalesce(p_input, '{}'::jsonb),
		coalesce(p_stats, '{}'::jsonb), round(v_budget, 4))
	RETURNING id INTO v_id;

	RETURN jsonb_build_object('id', v_id, 'budget', round(v_budget, 4));
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_reserve_enrichment_run(uuid, text, jsonb, jsonb, numeric, numeric, numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_reserve_enrichment_run(uuid, text, jsonb, jsonb, numeric, numeric, numeric, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Deleting a merge survivor takes its tombstones with it

ALTER TABLE public.knowledge_entities
	DROP CONSTRAINT IF EXISTS knowledge_entities_merged_into_id_fkey,
	ADD CONSTRAINT knowledge_entities_merged_into_id_fkey
		FOREIGN KEY (merged_into_id) REFERENCES public.knowledge_entities(id) ON DELETE CASCADE;

COMMIT;
