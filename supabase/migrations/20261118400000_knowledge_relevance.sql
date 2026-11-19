-- supabase/migrations/20261118400000_knowledge_relevance.sql
-- What matters to you (tasker 169). The knowledge page shows the entries that are part of the
-- user's world; names that only come up in passing (DoorDash in a research brief, a city from a
-- person's research) stay searchable but leave the default list.
--
-- 1. hidden_reason gains 'not_a_name': the sorter hid an entry that isn't a person or
--    organization at all ("Desk", "GPU", "Q3 renewal"). Reversible from the page. Readers treat it
--    like a user hide (only 'orphan' is revived), so the same name is not recreated.
-- 2. knowledge_list gains p_view and p_place (trailing, with defaults; the old eight-argument
--    function is dropped so PostgREST never sees two overloads):
--      all        everything active, as before (chat and other callers keep this default)
--      world      active entries except places and names marked "just mentioned"
--                 (circle = 'public'); a search also finds those, so nothing is lost
--      reference  the viewer's "just mentioned" entries
--      dropped    entries the sorter hid as not a name
--    p_place keeps entries located in that place (people and orgs in Annapolis): places are a
--    filter, not list entries. The result adds each row's circle (the viewer's own rows only),
--    per-view totals and the places the viewer's world is located in.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Not a name

ALTER TABLE public.knowledge_entities
	DROP CONSTRAINT IF EXISTS knowledge_entities_hidden_reason_check,
	ADD CONSTRAINT knowledge_entities_hidden_reason_check
		CHECK (hidden_reason IS NULL OR hidden_reason IN ('orphan', 'not_a_name'));

COMMENT ON COLUMN public.knowledge_entities.hidden_reason IS
	'Read only while status = hidden. orphan = hidden automatically: a reader made it and its last mention was deleted (revived when the name shows up again). not_a_name = the sorter found it is not a person or organization (the user can restore it). NULL = hidden by the user.';

-- ---------------------------------------------------------------------------
-- 2. knowledge_list with views and a place filter

DROP FUNCTION IF EXISTS public.knowledge_list(text[], text, text, integer, integer, uuid, text, text);

CREATE OR REPLACE FUNCTION public.knowledge_list(
	p_kinds text[] DEFAULT NULL,
	p_filter text DEFAULT 'all',
	p_query text DEFAULT NULL,
	p_limit integer DEFAULT 50,
	p_offset integer DEFAULT 0,
	p_viewer uuid DEFAULT NULL,
	p_researched text DEFAULT 'any',
	p_sort text DEFAULT 'recent',
	p_view text DEFAULT 'all',
	p_place uuid DEFAULT NULL
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
	v_view text := coalesce(p_view, 'all');
	v_searching boolean := p_query IS NOT NULL AND btrim(p_query) <> '';
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
	IF v_view NOT IN ('all', 'world', 'reference', 'dropped') THEN
		RAISE EXCEPTION 'view must be all, world, reference or dropped' USING ERRCODE = '22023';
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
		WHERE v_searching
	),
	located AS (
		SELECT DISTINCT f.entity_id AS id
		FROM public.knowledge_facts f
		WHERE p_place IS NOT NULL AND f.predicate = 'located_in' AND f.object_entity_id = p_place
			AND f.status IN ('active', 'suggested', 'disputed')
			AND (f.owner_user_id = v_viewer OR f.scope = 'public')
	),
	-- The viewer's own finished research, newest per entry.
	researched AS (
		SELECT t.entity_id AS id, max(t.finished_at) AS at
		FROM public.knowledge_run_targets t
		WHERE t.owner_user_id = v_viewer AND t.status = 'done'
		GROUP BY t.entity_id
	),
	visible AS (
		SELECT e.*
		FROM public.knowledge_entities e
		WHERE NOT e.is_self
			AND (e.owner_user_id = v_viewer
				OR (e.scope = 'public' AND e.id IN (SELECT id FROM touched)))
	),
	base AS (
		SELECT e.id, e.kind, e.name, e.normalized_name, e.summary, e.scope, e.image_url,
			e.updated_at,
			CASE WHEN e.owner_user_id = v_viewer THEN e.circle END AS circle,
			-- GREATEST skips NULLs: NULL only when neither says researched.
			GREATEST(CASE WHEN e.owner_user_id = v_viewer THEN e.enriched_at END, r.at)
				AS researched_at
		FROM visible e
		LEFT JOIN researched r ON r.id = e.id
		WHERE (CASE WHEN v_view = 'dropped'
				THEN e.status = 'hidden' AND e.hidden_reason = 'not_a_name'
					AND e.owner_user_id = v_viewer
				ELSE e.status = 'active' END)
			AND (v_view IN ('all', 'dropped') OR e.kind <> 'place')
			AND (v_view <> 'world' OR v_searching OR e.owner_user_id IS DISTINCT FROM v_viewer
				OR e.circle <> 'public')
			AND (v_view <> 'reference'
				OR (e.owner_user_id = v_viewer AND e.circle = 'public'))
			AND (p_place IS NULL OR e.id IN (SELECT id FROM located))
			AND (coalesce(p_filter, 'all') <> 'known' OR e.id IN (SELECT id FROM known))
			AND (coalesce(p_filter, 'all') <> 'owned' OR e.id IN (SELECT id FROM owned))
			AND (NOT v_searching OR e.id IN (SELECT id FROM matched))
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
	),
	-- Places the viewer's people and orgs are in, most first (the place filter's choices).
	places AS (
		SELECT p.id, p.name, count(DISTINCT f.entity_id) AS n
		FROM public.knowledge_facts f
		JOIN visible e ON e.id = f.entity_id AND e.status = 'active'
		JOIN public.knowledge_entities p ON p.id = f.object_entity_id AND p.status = 'active'
		WHERE f.predicate = 'located_in' AND f.status IN ('active', 'suggested', 'disputed')
			AND (f.owner_user_id = v_viewer OR f.scope = 'public')
		GROUP BY p.id, p.name
		ORDER BY n DESC, p.name
		LIMIT 40
	)
	SELECT jsonb_build_object(
		'entities', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'id', p.id, 'kind', p.kind, 'name', p.name, 'summary', p.summary,
				'scope', p.scope, 'is_self', false, 'image_url', p.image_url,
				'updated_at', p.updated_at, 'researched_at', p.researched_at,
				'circle', p.circle
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
		),
		-- Whole-graph totals per view, whatever the other filters are.
		'views', jsonb_build_object(
			'world', (SELECT count(*) FROM visible e WHERE e.status = 'active'
				AND e.kind <> 'place'
				AND (e.owner_user_id IS DISTINCT FROM v_viewer OR e.circle <> 'public')),
			'reference', (SELECT count(*) FROM visible e WHERE e.status = 'active'
				AND e.kind <> 'place' AND e.owner_user_id = v_viewer AND e.circle = 'public'),
			'dropped', (SELECT count(*) FROM visible e WHERE e.status = 'hidden'
				AND e.hidden_reason = 'not_a_name' AND e.owner_user_id = v_viewer)
		),
		'places', coalesce((
			SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n)
				ORDER BY n DESC, name)
			FROM places
		), '[]'::jsonb)
	) INTO v_result;

	RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid, text, text, text, uuid) TO authenticated, service_role;

COMMIT;
