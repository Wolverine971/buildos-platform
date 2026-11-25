-- supabase/migrations/20261124200000_knowledge_list_sources.sql
-- The knowledge page tells entries apart by where they came from, and filters on it.
--
-- knowledge_list gains p_source and returns, for each of the viewer's own entries, `sources`:
--   work      a task, doc, project or chat names it, or a reader of those made it
--   linkedin  it carries a LinkedIn identity (a company or profile from the export)
--   contacts  another contact import made it (phone, Google)
--   research  a web search made it
--   manual    typed in, or saved by a connected agent (none of the above)
-- An entry can have more than one (a LinkedIn company a task also names). The result also
-- carries `sources`: how many entries each source has among the current view, kind and research
-- filter, whatever p_source is.
--
-- p_source NULL keeps the list as it was, so callers that don't send it behave as before. The
-- old 11-argument function is dropped in the same transaction so PostgREST never sees two
-- candidates. No table changes; nothing is rewritten.
--
-- Rollback: DROP FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid,
--   text, text, text, uuid, text, text); then re-run knowledge_list from 20261122004500.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.knowledge_list(text[], text, text, integer, integer, uuid, text, text, text, uuid, text);

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
	p_place uuid DEFAULT NULL,
	p_dir text DEFAULT NULL,
	p_source text DEFAULT NULL
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
	-- Name reads A–Z by default; every other sort leads with the newest or the most.
	v_desc boolean := coalesce(p_dir, CASE WHEN coalesce(p_sort, 'recent') = 'name' THEN 'asc' ELSE 'desc' END) = 'desc';
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
	IF v_sort NOT IN ('recent', 'name', 'researched', 'connected', 'projects', 'tasks', 'documents') THEN
		RAISE EXCEPTION 'sort must be recent, name, researched, connected, projects, tasks or documents'
			USING ERRCODE = '22023';
	END IF;
	IF p_dir IS NOT NULL AND p_dir NOT IN ('asc', 'desc') THEN
		RAISE EXCEPTION 'dir must be asc or desc' USING ERRCODE = '22023';
	END IF;
	IF p_source IS NOT NULL AND p_source NOT IN ('work', 'linkedin', 'contacts', 'research', 'manual') THEN
		RAISE EXCEPTION 'source must be work, linkedin, contacts, research or manual' USING ERRCODE = '22023';
	END IF;
	IF v_view NOT IN ('all', 'world', 'reference', 'dropped') THEN
		RAISE EXCEPTION 'view must be all, world, reference or dropped' USING ERRCODE = '22023';
	END IF;

	SELECT id INTO v_self FROM public.knowledge_entities
	WHERE owner_user_id = v_viewer AND is_self;

	WITH known AS (
		SELECT f.object_entity_id AS id, max(CASE WHEN f.qualifiers->>'via' = 'linkedin'
			AND f.qualifiers->>'since' ~ '^\d{4}-\d{2}-\d{2}$' THEN f.qualifiers->>'since' END) AS legacy_date
		FROM public.knowledge_facts f
		WHERE v_self IS NOT NULL AND f.entity_id = v_self AND f.predicate = 'knows'
			AND f.owner_user_id = v_viewer AND f.status IN ('active', 'suggested', 'disputed')
		GROUP BY f.object_entity_id
	),
	connection_dates AS (
		SELECT k.id, coalesce(max(d.value_text), k.legacy_date) AS connected_on
		FROM known k LEFT JOIN public.knowledge_facts d ON d.entity_id = k.id
			AND d.owner_user_id = v_viewer AND d.status = 'active' AND d.predicate = 'connected_on'
		WHERE v_sort = 'connected'
		GROUP BY k.id, k.legacy_date
	),
	-- How many tasks, docs and projects name each entry (the page's three columns). Read only
	-- for those sorts. The joins run as the caller, so a record they can't open doesn't count.
	link_counts AS (
		SELECT l.entity_id AS id,
			count(DISTINCT t.id) AS tasks,
			count(DISTINCT dc.id) AS documents,
			count(DISTINCT pr.id) AS projects
		FROM public.knowledge_record_links l
		LEFT JOIN public.onto_tasks t ON l.record_kind = 'task' AND t.id = l.record_id
			AND t.deleted_at IS NULL
		LEFT JOIN public.onto_documents dc ON l.record_kind = 'document' AND dc.id = l.record_id
			AND dc.deleted_at IS NULL
		LEFT JOIN public.onto_projects pr ON pr.deleted_at IS NULL AND pr.id = CASE l.record_kind
			WHEN 'project' THEN l.record_id WHEN 'task' THEN t.project_id ELSE dc.project_id END
		WHERE v_sort IN ('projects', 'tasks', 'documents')
			AND l.owner_user_id = v_viewer AND l.record_kind IN ('task', 'document', 'project')
		GROUP BY l.entity_id
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
	-- Where each of the viewer's entries came from (see knowledgeSourcesOf in
	-- packages/shared-agent-ops/src/knowledge/cleanup.ts: change both together).
	from_linkedin AS (
		SELECT DISTINCT k.entity_id AS id
		FROM public.knowledge_entity_keys k
		WHERE k.owner_user_id = v_viewer
			AND (k.key_type = 'linkedin'
				OR (k.key_type = 'external' AND k.key_value LIKE 'linkedin-%'))
	),
	recorded AS (
		SELECT DISTINCT l.entity_id AS id
		FROM public.knowledge_record_links l
		WHERE l.owner_user_id = v_viewer
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
				AS researched_at,
			-- The viewer's own entries only; a shared entry has no source of theirs.
			CASE WHEN e.owner_user_id = v_viewer THEN coalesce(nullif(array_remove(ARRAY[
				CASE WHEN rec.id IS NOT NULL
					OR e.created_via IN ('task', 'backfill', 'chat', 'system') THEN 'work' END,
				CASE WHEN li.id IS NOT NULL THEN 'linkedin' END,
				CASE WHEN e.created_via = 'import' AND li.id IS NULL THEN 'contacts' END,
				CASE WHEN e.created_via = 'enrichment' THEN 'research' END
			], NULL), '{}'), ARRAY['manual']) END AS sources
		FROM visible e
		LEFT JOIN researched r ON r.id = e.id
		LEFT JOIN from_linkedin li ON li.id = e.id
		LEFT JOIN recorded rec ON rec.id = e.id
		WHERE (CASE WHEN v_view = 'dropped'
				THEN e.status = 'hidden' AND e.hidden_reason = 'not_a_name'
					AND e.owner_user_id = v_viewer
				ELSE e.status = 'active' END)
			AND (v_view IN ('all', 'dropped') OR e.kind <> 'place')
			AND (v_view <> 'world' OR v_searching OR e.owner_user_id IS DISTINCT FROM v_viewer
				OR e.circle <> 'public' OR p_filter = 'known')
			AND (v_view <> 'reference'
				OR (e.owner_user_id = v_viewer AND e.circle = 'public'))
			AND (p_place IS NULL OR e.id IN (SELECT id FROM located))
			AND (coalesce(p_filter, 'all') <> 'known' OR e.id IN (SELECT id FROM known))
			AND (coalesce(p_filter, 'all') <> 'owned' OR e.id IN (SELECT id FROM owned))
			AND (NOT v_searching OR e.id IN (SELECT id FROM matched))
	),
	sourced AS (
		SELECT * FROM base WHERE p_source IS NULL OR p_source = ANY (sources)
	),
	kinded AS (
		SELECT * FROM sourced WHERE p_kinds IS NULL OR kind = ANY (p_kinds)
	),
	-- Per source among the current view, kind and research filter, whatever p_source is, so
	-- the source chips keep their numbers while one is picked.
	by_source AS (
		SELECT s.source, count(*) AS n
		FROM base b CROSS JOIN LATERAL unnest(b.sources) AS s(source)
		WHERE (p_kinds IS NULL OR b.kind = ANY (p_kinds))
			AND (v_researched = 'any'
				OR (v_researched = 'yes' AND b.researched_at IS NOT NULL)
				OR (v_researched = 'no' AND b.researched_at IS NULL))
		GROUP BY s.source
	),
	pool AS (
		SELECT * FROM sourced
		WHERE v_researched = 'any'
			OR (v_researched = 'yes' AND researched_at IS NOT NULL)
			OR (v_researched = 'no' AND researched_at IS NULL)
	),
	filtered AS (
		SELECT * FROM pool WHERE p_kinds IS NULL OR kind = ANY (p_kinds)
	),
	keyed AS (
		SELECT f.*, d.connected_on,
			-- NULL unless sorting by one of the three columns.
			CASE v_sort WHEN 'projects' THEN coalesce(c.projects, 0)
				WHEN 'tasks' THEN coalesce(c.tasks, 0)
				WHEN 'documents' THEN coalesce(c.documents, 0) END AS link_count
		FROM filtered f
		LEFT JOIN connection_dates d ON d.id = f.id
		LEFT JOIN link_counts c ON c.id = f.id
	),
	page AS (
		SELECT k.*,
			-- One key per sort and direction; the keys for the other sorts are NULL and tie.
			-- Entries with no date stay last either way.
			row_number() OVER (ORDER BY
				CASE WHEN v_desc THEN k.connected_on END DESC NULLS LAST,
				CASE WHEN NOT v_desc THEN k.connected_on END ASC NULLS LAST,
				CASE WHEN v_sort = 'name' AND NOT v_desc THEN k.normalized_name END ASC,
				CASE WHEN v_sort = 'name' AND v_desc THEN k.normalized_name END DESC,
				CASE WHEN v_sort = 'researched' AND v_desc THEN k.researched_at END DESC NULLS LAST,
				CASE WHEN v_sort = 'researched' AND NOT v_desc THEN k.researched_at END ASC NULLS LAST,
				CASE WHEN v_desc THEN k.link_count END DESC NULLS LAST,
				CASE WHEN NOT v_desc THEN k.link_count END ASC NULLS LAST,
				-- Same count: A–Z, so a long run of ties is still easy to scan.
				CASE WHEN k.link_count IS NOT NULL THEN k.normalized_name END ASC,
				CASE WHEN v_sort = 'recent' AND NOT v_desc THEN k.updated_at END ASC,
				k.updated_at DESC, k.id) AS pos
		FROM keyed k
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
				'circle', p.circle, 'sources', coalesce(to_jsonb(p.sources), '[]'::jsonb)
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
		'sources', coalesce((SELECT jsonb_object_agg(source, n) FROM by_source), '{}'::jsonb),
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

REVOKE ALL ON FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid, text, text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_list(text[], text, text, integer, integer, uuid, text, text, text, uuid, text, text) TO authenticated, service_role;

COMMIT;
