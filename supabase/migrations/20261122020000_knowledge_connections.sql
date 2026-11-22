-- supabase/migrations/20261122020000_knowledge_connections.sql
-- Tasker 166: find connections. One read answers "who do I know at / near / in the same kind
-- of company as …" from the graph as it is, and says what is missing instead of guessing.
--
--   knowledge_connections(filters, facets, …) returns the viewer's people that pass the
--   filters, the groups they fall into (company, place, region, industry, title), how much of
--   the pool has the data a filter needs (coverage), and the biggest employers still missing
--   it (gaps), so the caller can offer research instead of an empty answer.
--
-- Everything is a structured filter: the chat model or the page supplies names and words as
-- arguments; nothing here reads meaning out of a sentence. Free: plain SQL over the graph.
--
-- Rollback: DROP FUNCTION public.knowledge_connections(jsonb, text[], integer, integer, integer, uuid);
--   DROP FUNCTION public.knowledge_filter_texts(jsonb);
--   DROP FUNCTION public.knowledge_text_has_term(text, text, boolean);
--   DROP FUNCTION public.knowledge_place_parts(text);
BEGIN;
SET LOCAL lock_timeout = '5s';

-- A place name as comparable parts: "Annapolis, MD", "Annapolis, Maryland" and
-- "Annapolis, Maryland, United States" all read {annapolis, maryland}. Structured-format
-- handling only: comma segments, a trailing ZIP, US state codes, the country suffix.
CREATE FUNCTION public.knowledge_place_parts(p_name text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
	SELECT coalesce(array_agg(coalesce(s.name, x.seg) ORDER BY x.ord), '{}'::text[])
	FROM (
		SELECT u.ord, btrim(regexp_replace(regexp_replace(
			replace(lower(u.raw), '.', ''), '\s+\d{5}(-\d{4})?\s*$', ''), '\s+', ' ', 'g')) AS seg
		FROM unnest(string_to_array(coalesce(p_name, ''), ',')) WITH ORDINALITY AS u(raw, ord)
	) x
	LEFT JOIN (VALUES
		('al', 'alabama'), ('ak', 'alaska'), ('az', 'arizona'), ('ar', 'arkansas'),
		('ca', 'california'), ('co', 'colorado'), ('ct', 'connecticut'), ('de', 'delaware'),
		('dc', 'district of columbia'), ('fl', 'florida'), ('ga', 'georgia'), ('hi', 'hawaii'),
		('id', 'idaho'), ('il', 'illinois'), ('in', 'indiana'), ('ia', 'iowa'), ('ks', 'kansas'),
		('ky', 'kentucky'), ('la', 'louisiana'), ('me', 'maine'), ('md', 'maryland'),
		('ma', 'massachusetts'), ('mi', 'michigan'), ('mn', 'minnesota'), ('ms', 'mississippi'),
		('mo', 'missouri'), ('mt', 'montana'), ('ne', 'nebraska'), ('nv', 'nevada'),
		('nh', 'new hampshire'), ('nj', 'new jersey'), ('nm', 'new mexico'), ('ny', 'new york'),
		('nc', 'north carolina'), ('nd', 'north dakota'), ('oh', 'ohio'), ('ok', 'oklahoma'),
		('or', 'oregon'), ('pa', 'pennsylvania'), ('ri', 'rhode island'), ('sc', 'south carolina'),
		('sd', 'south dakota'), ('tn', 'tennessee'), ('tx', 'texas'), ('ut', 'utah'),
		('vt', 'vermont'), ('va', 'virginia'), ('wa', 'washington'), ('wv', 'west virginia'),
		('wi', 'wisconsin'), ('wy', 'wyoming'), ('washington dc', 'district of columbia')
	) AS s(code, name) ON s.code = x.seg
	WHERE x.seg <> ''
		AND x.seg NOT IN ('united states', 'united states of america', 'usa', 'us')
$$;
REVOKE ALL ON FUNCTION public.knowledge_place_parts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_place_parts(text) TO authenticated, service_role;

-- Does a name or title contain this word (or phrase) at a word start? p_whole also requires
-- the word to end there ("Meta" is not "Metabase"); without it "engineer" finds "Engineering".
-- The term is a caller-supplied filter value, escaped, never a pattern.
CREATE FUNCTION public.knowledge_text_has_term(p_text text, p_term text, p_whole boolean DEFAULT true)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
	SELECT btrim(coalesce(p_term, '')) <> '' AND coalesce(p_text, '') ~* (
		'(^|[^[:alnum:]])'
		|| regexp_replace(btrim(p_term), '([^[:alnum:][:space:]])', '\\\1', 'g')
		|| CASE WHEN p_whole THEN '($|[^[:alnum:]])' ELSE '' END)
$$;
REVOKE ALL ON FUNCTION public.knowledge_text_has_term(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_text_has_term(text, text, boolean) TO authenticated, service_role;

-- A filter value as a list of non-empty strings: accepts "x" or ["x", "y"]; NULL when empty.
CREATE FUNCTION public.knowledge_filter_texts(p_value jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
	SELECT nullif(ARRAY(
		SELECT btrim(t)
		FROM jsonb_array_elements_text(CASE jsonb_typeof(p_value)
			WHEN 'array' THEN p_value
			WHEN 'string' THEN jsonb_build_array(p_value)
			ELSE '[]'::jsonb END) AS t
		WHERE btrim(t) <> ''
	), '{}'::text[])
$$;
REVOKE ALL ON FUNCTION public.knowledge_filter_texts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_filter_texts(jsonb) TO authenticated, service_role;

-- p_filters (all optional):
--   scope        known = people the viewer knows; world (default) = those plus the viewer's own
--                people who aren't "just mentioned"; all = every person the viewer can see
--   person_ids   only these people
--   via          how the viewer knows them (the knows fact's via: "linkedin")
--   employment   current (default) | former | any: which jobs count for every company test
--   company / company_ids     works at an org with this name (whole word, or the same folded
--                             name) or one of these org ids
--   title        a job title, headline or summary has a word starting with one of these
--   industry     an employer's industry has a word starting with one of these
--   place / place_ids         located there: a term matches a place whose parts contain the
--                             term's parts ("Maryland", "MD", "Baltimore, MD")
--   place_of     any (default) | person | company: whose location counts
--   in_records   named in at least one of each listed kind (task, document, project)
--   related_to   a person id: people sharing an employer or a place with them
--   bridge_to / bridge_to_ids people not at that company now who lead to it: used to work
--                             there, share another employer with someone there, or are named
--                             in the same task, doc or project as someone there
--   addresses    false keeps people's street addresses out of the place data (callers that may
--                not see contact details)
--   contacts     true adds email and phone values to each person
-- p_facets: which groupings to return (company, place, region, industry, title); NULL = none.
CREATE FUNCTION public.knowledge_connections(
	p_filters jsonb DEFAULT '{}'::jsonb,
	p_facets text[] DEFAULT NULL,
	p_limit integer DEFAULT 50,
	p_offset integer DEFAULT 0,
	p_facet_limit integer DEFAULT 12,
	p_viewer uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
	f jsonb := coalesce(p_filters, '{}'::jsonb);
	v_self uuid;
	v_limit integer := LEAST(GREATEST(coalesce(p_limit, 50), 0), 200);
	v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
	v_facet_limit integer := LEAST(GREATEST(coalesce(p_facet_limit, 12), 1), 100);
	v_facets text[] := coalesce(p_facets, '{}'::text[]);
	v_scope text := coalesce(f->>'scope', 'world');
	v_employment text := coalesce(f->>'employment', 'current');
	v_place_of text := coalesce(f->>'place_of', 'any');
	v_via text := nullif(btrim(f->>'via'), '');
	v_people uuid[] := public.knowledge_filter_texts(f->'person_ids')::uuid[];
	v_company text[] := public.knowledge_filter_texts(f->'company');
	v_company_ids uuid[] := public.knowledge_filter_texts(f->'company_ids')::uuid[];
	v_title text[] := public.knowledge_filter_texts(f->'title');
	v_industry text[] := public.knowledge_filter_texts(f->'industry');
	v_place text[] := public.knowledge_filter_texts(f->'place');
	v_place_ids uuid[] := public.knowledge_filter_texts(f->'place_ids')::uuid[];
	v_records text[] := public.knowledge_filter_texts(f->'in_records');
	v_bridge text[] := public.knowledge_filter_texts(f->'bridge_to');
	v_bridge_ids uuid[] := public.knowledge_filter_texts(f->'bridge_to_ids')::uuid[];
	v_related uuid := nullif(f->>'related_to', '')::uuid;
	v_addresses boolean := coalesce((f->>'addresses')::boolean, true);
	v_contacts boolean := coalesce((f->>'contacts')::boolean, false);
	v_has_company boolean;
	v_has_place boolean;
	v_has_bridge boolean;
	v_result jsonb;
BEGIN
	IF v_scope NOT IN ('known', 'world', 'all') THEN
		RAISE EXCEPTION 'scope must be known, world or all' USING ERRCODE = '22023';
	END IF;
	IF v_employment NOT IN ('current', 'former', 'any') THEN
		RAISE EXCEPTION 'employment must be current, former or any' USING ERRCODE = '22023';
	END IF;
	IF v_place_of NOT IN ('any', 'person', 'company') THEN
		RAISE EXCEPTION 'place_of must be any, person or company' USING ERRCODE = '22023';
	END IF;
	IF NOT (v_facets <@ ARRAY['company', 'place', 'region', 'industry', 'title']) THEN
		RAISE EXCEPTION 'facets must be company, place, region, industry or title' USING ERRCODE = '22023';
	END IF;
	IF v_records IS NOT NULL AND NOT (v_records <@ ARRAY['task', 'document', 'project']) THEN
		RAISE EXCEPTION 'in_records must be task, document or project' USING ERRCODE = '22023';
	END IF;
	v_has_company := v_company IS NOT NULL OR v_company_ids IS NOT NULL;
	v_has_place := v_place IS NOT NULL OR v_place_ids IS NOT NULL;
	v_has_bridge := v_bridge IS NOT NULL OR v_bridge_ids IS NOT NULL;

	SELECT id INTO v_self FROM public.knowledge_entities
	WHERE owner_user_id = v_viewer AND is_self;

	WITH known AS (
		SELECT k.object_entity_id AS id, max(k.qualifiers->>'via') AS via,
			max(CASE WHEN k.qualifiers->>'since' ~ '^\d{4}-\d{2}-\d{2}$'
				THEN k.qualifiers->>'since' END) AS since
		FROM public.knowledge_facts k
		WHERE v_self IS NOT NULL AND k.entity_id = v_self AND k.predicate = 'knows'
			AND k.owner_user_id = v_viewer AND k.status IN ('active', 'suggested', 'disputed')
		GROUP BY k.object_entity_id
	),
	-- Every person the viewer can see: their own entries, and public ones they know.
	seen AS MATERIALIZED (
		SELECT e.id, e.name, e.summary, e.owner_user_id, e.circle,
			k.id IS NOT NULL AS known, k.via, k.since
		FROM public.knowledge_entities e
		LEFT JOIN known k ON k.id = e.id
		WHERE e.kind = 'person' AND e.status = 'active' AND NOT e.is_self
			AND (e.owner_user_id = v_viewer OR (e.scope = 'public' AND k.id IS NOT NULL))
	),
	jobs AS MATERIALIZED (
		SELECT w.entity_id AS person_id, o.id AS org_id, o.name AS org_name,
			nullif(btrim(w.qualifiers->>'title'), '') AS title,
			(w.valid_to IS NULL AND (w.qualifiers->>'current') IS DISTINCT FROM 'false'
				AND NOT (w.qualifiers ? 'end')) AS is_current
		FROM seen s
		JOIN public.knowledge_facts w ON w.entity_id = s.id AND w.predicate = 'works_at'
			AND w.status IN ('active', 'suggested', 'disputed')
			AND (w.owner_user_id = v_viewer OR w.scope = 'public')
		JOIN public.knowledge_entities o ON o.id = w.object_entity_id AND o.kind = 'org'
			AND o.status = 'active' AND (o.owner_user_id = v_viewer OR o.scope = 'public')
	),
	-- The jobs every company test reads (current unless the caller asked otherwise).
	emp AS MATERIALIZED (
		SELECT * FROM jobs j WHERE v_employment = 'any' OR j.is_current = (v_employment = 'current')
	),
	orgs AS MATERIALIZED (SELECT DISTINCT org_id FROM jobs),
	org_industry AS MATERIALIZED (
		SELECT DISTINCT i.entity_id AS org_id, btrim(i.value_text) AS industry
		FROM orgs o
		JOIN public.knowledge_facts i ON i.entity_id = o.org_id AND i.predicate = 'industry'
			AND i.status IN ('active', 'suggested', 'disputed')
			AND (i.owner_user_id = v_viewer OR i.scope = 'public')
	),
	-- Where each person and employer is: located_in places, plus the town and state of a
	-- street address (its last two parts).
	located AS MATERIALIZED (
		SELECT l.entity_id, public.knowledge_place_parts(pl.name) AS parts, pl.id AS place_id
		FROM public.knowledge_facts l
		JOIN public.knowledge_entities pl ON pl.id = l.object_entity_id AND pl.kind = 'place'
			AND pl.status = 'active'
		WHERE l.predicate = 'located_in' AND l.status IN ('active', 'suggested', 'disputed')
			AND (l.owner_user_id = v_viewer OR l.scope = 'public')
			AND (l.entity_id IN (SELECT id FROM seen) OR l.entity_id IN (SELECT org_id FROM orgs))
		UNION ALL
		SELECT a.entity_id, a.parts[GREATEST(array_length(a.parts, 1) - 1, 1):], NULL::uuid
		FROM (
			SELECT x.entity_id, public.knowledge_place_parts(x.value_text) AS parts
			FROM public.knowledge_facts x
			WHERE x.predicate = 'address' AND x.status IN ('active', 'suggested', 'disputed')
				AND (x.owner_user_id = v_viewer OR x.scope = 'public')
				AND (x.entity_id IN (SELECT org_id FROM orgs)
					OR (v_addresses AND x.entity_id IN (SELECT id FROM seen)))
		) a
		WHERE array_length(a.parts, 1) >= 2
	),
	-- One row per place an entity is in: parts, a group key (town + state/country) and region.
	spots AS MATERIALIZED (
		SELECT l.entity_id, l.parts, l.place_id,
			CASE WHEN array_length(l.parts, 1) > 1
				THEN l.parts[1] || ', ' || l.parts[array_length(l.parts, 1)]
				ELSE l.parts[1] END AS place_key,
			l.parts[array_length(l.parts, 1)] AS region
		FROM located l
		WHERE array_length(l.parts, 1) >= 1
	),
	links AS MATERIALIZED (
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
		WHERE l.owner_user_id = v_viewer AND l.record_kind IN ('task', 'document', 'project')
		GROUP BY l.entity_id
	),
	-- related_to: the anchor person's employers and places. Employers match by folded name,
	-- so a second entry for the same company ("The Cadre") still counts as the same place.
	anchor_orgs AS MATERIALIZED (
		SELECT DISTINCT e.org_id, e.org_name,
			coalesce(public.knowledge_fold_org_name(e.org_name), e.org_id::text) AS org_key
		FROM emp e WHERE e.person_id = v_related
	),
	anchor_spots AS MATERIALIZED (
		SELECT DISTINCT s.place_key FROM spots s
		WHERE v_related IS NOT NULL AND (s.entity_id = v_related
			OR s.entity_id IN (SELECT org_id FROM anchor_orgs))
	),
	-- bridge_to: the target company, who is there now, and who leads to them.
	target_orgs AS MATERIALIZED (
		SELECT DISTINCT j.org_id FROM jobs j
		WHERE v_has_bridge AND (j.org_id = ANY (v_bridge_ids) OR EXISTS (
			SELECT 1 FROM unnest(v_bridge) t
			WHERE public.knowledge_fold_org_name(j.org_name) = public.knowledge_fold_org_name(t)
				OR public.knowledge_text_has_term(j.org_name, t)))
	),
	target_people AS MATERIALIZED (
		SELECT DISTINCT j.person_id FROM jobs j
		WHERE j.is_current AND j.org_id IN (SELECT org_id FROM target_orgs)
	),
	bridges AS MATERIALIZED (
		SELECT j.person_id AS id, 'worked_there' AS how, NULL::uuid AS other_id, j.org_name AS through
		FROM jobs j
		WHERE NOT j.is_current AND j.org_id IN (SELECT org_id FROM target_orgs)
		UNION
		SELECT a.person_id, 'same_company', b.person_id, a.org_name
		FROM jobs a
		JOIN jobs b ON b.org_id = a.org_id AND b.person_id <> a.person_id
		WHERE b.person_id IN (SELECT person_id FROM target_people)
			AND a.org_id NOT IN (SELECT org_id FROM target_orgs)
		UNION
		SELECT la.entity_id, 'same_' || la.record_kind, lb.entity_id, NULL
		FROM public.knowledge_record_links la
		JOIN public.knowledge_record_links lb ON lb.owner_user_id = la.owner_user_id
			AND lb.record_kind = la.record_kind AND lb.record_id = la.record_id
			AND lb.entity_id <> la.entity_id
		WHERE v_has_bridge AND la.owner_user_id = v_viewer
			AND la.record_kind IN ('task', 'document', 'project')
			AND lb.entity_id IN (SELECT person_id FROM target_people)
	),
	place_terms AS MATERIALIZED (
		SELECT public.knowledge_place_parts(t) AS parts FROM unnest(v_place) t
	),
	-- A person's places: their own, and their employers' (the jobs that count).
	person_spots AS MATERIALIZED (
		SELECT s.entity_id AS person_id, s.parts, s.place_id, s.place_key, s.region, false AS via_company
		FROM spots s WHERE s.entity_id IN (SELECT id FROM seen)
		UNION ALL
		SELECT e.person_id, s.parts, s.place_id, s.place_key, s.region, true
		FROM emp e JOIN spots s ON s.entity_id = e.org_id
	),
	-- The pool: everyone who passes the filters that don't depend on place or industry data.
	-- Coverage is measured here, so a thin answer can say how much of the pool is unknown.
	pool AS MATERIALIZED (
		SELECT s.*, coalesce(l.tasks, 0) AS tasks, coalesce(l.documents, 0) AS documents,
			coalesce(l.projects, 0) AS projects
		FROM seen s
		LEFT JOIN links l ON l.id = s.id
		WHERE (v_scope = 'all' OR s.known
				OR (v_scope = 'world' AND s.owner_user_id = v_viewer AND s.circle <> 'public'))
			AND (v_people IS NULL OR s.id = ANY (v_people))
			AND (v_via IS NULL OR s.via = v_via)
			AND (NOT v_has_company OR EXISTS (
				SELECT 1 FROM emp e
				WHERE e.person_id = s.id AND (e.org_id = ANY (v_company_ids) OR EXISTS (
					SELECT 1 FROM unnest(v_company) t
					WHERE public.knowledge_fold_org_name(e.org_name) = public.knowledge_fold_org_name(t)
						OR public.knowledge_text_has_term(e.org_name, t)))))
			AND (v_title IS NULL OR EXISTS (
				SELECT 1 FROM unnest(v_title) t
				WHERE public.knowledge_text_has_term(s.summary, t, false)
					OR EXISTS (SELECT 1 FROM emp e WHERE e.person_id = s.id
						AND public.knowledge_text_has_term(e.title, t, false))
					OR EXISTS (SELECT 1 FROM public.knowledge_facts h
						WHERE h.entity_id = s.id AND h.predicate = 'headline'
							AND h.status IN ('active', 'suggested', 'disputed')
							AND (h.owner_user_id = v_viewer OR h.scope = 'public')
							AND public.knowledge_text_has_term(h.value_text, t, false))))
			AND (v_records IS NULL OR (
				('task' <> ALL (v_records) OR coalesce(l.tasks, 0) > 0)
				AND ('document' <> ALL (v_records) OR coalesce(l.documents, 0) > 0)
				AND ('project' <> ALL (v_records) OR coalesce(l.projects, 0) > 0)))
			AND (v_related IS NULL OR (s.id <> v_related AND (
				EXISTS (SELECT 1 FROM emp e WHERE e.person_id = s.id
					AND coalesce(public.knowledge_fold_org_name(e.org_name), e.org_id::text)
						IN (SELECT org_key FROM anchor_orgs))
				OR EXISTS (SELECT 1 FROM person_spots ps WHERE ps.person_id = s.id
					AND ps.place_key IN (SELECT place_key FROM anchor_spots)))))
			AND (NOT v_has_bridge OR (s.id IN (SELECT id FROM bridges)
				AND s.id NOT IN (SELECT person_id FROM target_people)))
	),
	final AS MATERIALIZED (
		SELECT p.* FROM pool p
		WHERE (NOT v_has_place OR EXISTS (
				SELECT 1 FROM person_spots ps
				WHERE ps.person_id = p.id
					AND (v_place_of = 'any' OR ps.via_company = (v_place_of = 'company'))
					AND (ps.place_id = ANY (v_place_ids)
						OR EXISTS (SELECT 1 FROM place_terms pt WHERE ps.parts @> pt.parts))))
			AND (v_industry IS NULL OR EXISTS (
				SELECT 1 FROM emp e JOIN org_industry i ON i.org_id = e.org_id
				CROSS JOIN unnest(v_industry) t
				WHERE e.person_id = p.id AND public.knowledge_text_has_term(i.industry, t, false)))
	),
	page AS MATERIALIZED (
		SELECT p.*, row_number() OVER (ORDER BY
			CASE WHEN v_records IS NOT NULL THEN p.tasks + p.documents + p.projects END DESC NULLS LAST,
			p.known DESC, p.since DESC NULLS LAST, lower(p.name), p.id) AS pos
		FROM final p
		ORDER BY pos
		LIMIT v_limit OFFSET v_offset
	),
	-- The filtered people's jobs and places, for the facets.
	final_jobs AS MATERIALIZED (
		SELECT e.*, p.name AS person_name FROM emp e JOIN final p ON p.id = e.person_id
	),
	final_spots AS MATERIALIZED (
		SELECT ps.*, p.name AS person_name FROM person_spots ps JOIN final p ON p.id = ps.person_id
		WHERE v_place_of = 'any' OR ps.via_company = (v_place_of = 'company')
	),
	-- Companies group by folded name, so "Cadre" and "The Cadre" entries count as one.
	company_groups AS (
		SELECT coalesce(public.knowledge_fold_org_name(j.org_name), j.org_id::text) AS key,
			(array_agg(j.org_id ORDER BY j.org_name, j.org_id))[1] AS id,
			mode() WITHIN GROUP (ORDER BY j.org_name) AS name,
			count(DISTINCT j.person_id) AS people,
			(array_agg(DISTINCT j.person_name))[1:3] AS sample
		FROM final_jobs j WHERE 'company' = ANY (v_facets)
		GROUP BY 1
	),
	region_groups AS (
		SELECT s.region AS key, NULL::uuid AS id, replace(initcap(s.region), ' Of ', ' of ') AS name,
			count(DISTINCT s.person_id) AS people,
			(array_agg(DISTINCT s.person_name))[1:3] AS sample
		FROM final_spots s WHERE 'region' = ANY (v_facets)
		GROUP BY s.region
	),
	place_groups AS (
		SELECT s.place_key AS key, NULL::uuid AS id, replace(initcap(s.place_key), ' Of ', ' of ') AS name,
			count(DISTINCT s.person_id) AS people,
			(array_agg(DISTINCT s.person_name))[1:3] AS sample
		FROM final_spots s WHERE 'place' = ANY (v_facets)
		GROUP BY s.place_key
	),
	industry_groups AS (
		SELECT lower(i.industry) AS key, NULL::uuid AS id, min(i.industry) AS name,
			count(DISTINCT j.person_id) AS people,
			(array_agg(DISTINCT j.person_name))[1:3] AS sample
		FROM final_jobs j JOIN org_industry i ON i.org_id = j.org_id
		WHERE 'industry' = ANY (v_facets)
		GROUP BY lower(i.industry)
	),
	title_groups AS (
		SELECT lower(j.title) AS key, NULL::uuid AS id, min(j.title) AS name,
			count(DISTINCT j.person_id) AS people,
			(array_agg(DISTINCT j.person_name))[1:3] AS sample
		FROM final_jobs j WHERE 'title' = ANY (v_facets) AND j.title IS NOT NULL
		GROUP BY lower(j.title)
	),
	all_groups AS (
		SELECT 'company' AS facet, * FROM company_groups
		UNION ALL SELECT 'region', * FROM region_groups
		UNION ALL SELECT 'place', * FROM place_groups
		UNION ALL SELECT 'industry', * FROM industry_groups
		UNION ALL SELECT 'title', * FROM title_groups
	),
	ranked_groups AS (
		SELECT g.*, row_number() OVER (PARTITION BY g.facet ORDER BY g.people DESC, g.name) AS pos,
			count(*) OVER (PARTITION BY g.facet) AS facet_total
		FROM all_groups g
	),
	-- Employers of the pool (before place and industry filters) and what is known of them.
	pool_orgs AS MATERIALIZED (
		SELECT e.org_id, min(e.org_name) AS org_name, count(DISTINCT e.person_id) AS people,
			EXISTS (SELECT 1 FROM spots s WHERE s.entity_id = e.org_id) AS has_place,
			EXISTS (SELECT 1 FROM org_industry i WHERE i.org_id = e.org_id) AS has_industry
		FROM emp e JOIN pool p ON p.id = e.person_id
		GROUP BY e.org_id
	)
	SELECT jsonb_build_object(
		'people', coalesce((
			SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
				'id', p.id, 'name', p.name, 'summary', p.summary, 'known', p.known,
				'connected_on', coalesce((
					SELECT max(c.value_text) FROM public.knowledge_facts c
					WHERE c.entity_id = p.id AND c.predicate = 'connected_on'
						AND c.owner_user_id = v_viewer AND c.status = 'active'), p.since),
				'jobs', (
					SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
						'org_id', j.org_id, 'org', j.org_name, 'title', j.title,
						'current', j.is_current)) ORDER BY j.is_current DESC, j.org_name)
					FROM (SELECT e.* FROM emp e WHERE e.person_id = p.id
						ORDER BY e.is_current DESC, e.org_name LIMIT 4) j),
				'places', (
					SELECT jsonb_agg(DISTINCT replace(initcap(ps.place_key), ' Of ', ' of '))
					FROM person_spots ps WHERE ps.person_id = p.id
						AND (v_place_of = 'any' OR ps.via_company = (v_place_of = 'company'))),
				'industries', (
					SELECT jsonb_agg(DISTINCT i.industry)
					FROM emp e JOIN org_industry i ON i.org_id = e.org_id WHERE e.person_id = p.id),
				'tasks', nullif(p.tasks, 0), 'documents', nullif(p.documents, 0),
				'projects', nullif(p.projects, 0),
				'email', CASE WHEN v_contacts THEN (
					SELECT jsonb_agg(DISTINCT c.value_text) FROM public.knowledge_facts c
					WHERE c.entity_id = p.id AND c.predicate = 'email' AND c.status = 'active'
						AND (c.owner_user_id = v_viewer OR c.scope = 'public')) END,
				'phone', CASE WHEN v_contacts THEN (
					SELECT jsonb_agg(DISTINCT c.value_text) FROM public.knowledge_facts c
					WHERE c.entity_id = p.id AND c.predicate = 'phone' AND c.status = 'active'
						AND (c.owner_user_id = v_viewer OR c.scope = 'public')) END,
				'bridge', CASE WHEN v_has_bridge THEN (
					SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
						'how', b.how, 'person_id', b.other_id, 'person', o.name, 'through', b.through)))
					FROM (SELECT * FROM bridges x WHERE x.id = p.id ORDER BY x.how, x.other_id LIMIT 4) b
					LEFT JOIN seen o ON o.id = b.other_id) END
			)) ORDER BY p.pos)
			FROM page p
		), '[]'::jsonb),
		'total', (SELECT count(*) FROM final),
		'facets', coalesce((
			SELECT jsonb_object_agg(x.facet, x.body)
			FROM (
				SELECT g.facet, jsonb_build_object(
					'total', max(g.facet_total),
					'groups', jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
						'key', g.key, 'id', g.id, 'name', g.name, 'people', g.people,
						'sample', to_jsonb(g.sample))) ORDER BY g.pos)) AS body
				FROM ranked_groups g WHERE g.pos <= v_facet_limit
				GROUP BY g.facet
			) x
		), '{}'::jsonb),
		'coverage', jsonb_build_object(
			'people', (SELECT count(*) FROM pool),
			'known', (SELECT count(*) FROM pool WHERE known),
			'with_company', (SELECT count(*) FROM pool p
				WHERE EXISTS (SELECT 1 FROM emp e WHERE e.person_id = p.id)),
			'with_title', (SELECT count(*) FROM pool p
				WHERE EXISTS (SELECT 1 FROM emp e WHERE e.person_id = p.id AND e.title IS NOT NULL)),
			'with_place', (SELECT count(*) FROM pool p
				WHERE EXISTS (SELECT 1 FROM person_spots ps WHERE ps.person_id = p.id
					AND (v_place_of = 'any' OR ps.via_company = (v_place_of = 'company')))),
			'with_industry', (SELECT count(*) FROM pool p
				WHERE EXISTS (SELECT 1 FROM emp e JOIN org_industry i ON i.org_id = e.org_id
					WHERE e.person_id = p.id)),
			'companies', (SELECT count(*) FROM pool_orgs),
			'companies_with_place', (SELECT count(*) FROM pool_orgs WHERE has_place),
			'companies_with_industry', (SELECT count(*) FROM pool_orgs WHERE has_industry)
		),
		-- The employers with the most of these people that still lack a place or an industry:
		-- what research would fill first.
		'gaps', jsonb_build_object(
			'companies_without_place', coalesce((
				SELECT jsonb_agg(jsonb_build_object('id', g.org_id, 'name', g.org_name, 'people', g.people)
					ORDER BY g.people DESC, g.org_name)
				FROM (SELECT * FROM pool_orgs WHERE NOT has_place
					ORDER BY people DESC, org_name LIMIT 10) g), '[]'::jsonb),
			'companies_without_industry', coalesce((
				SELECT jsonb_agg(jsonb_build_object('id', g.org_id, 'name', g.org_name, 'people', g.people)
					ORDER BY g.people DESC, g.org_name)
				FROM (SELECT * FROM pool_orgs WHERE NOT has_industry
					ORDER BY people DESC, org_name LIMIT 10) g), '[]'::jsonb)
		),
		'anchor', CASE WHEN v_related IS NOT NULL THEN jsonb_build_object(
			'companies', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.org_id, 'name', a.org_name,
				'key', a.org_key) ORDER BY a.org_name) FROM anchor_orgs a), '[]'::jsonb),
			'places', coalesce((SELECT jsonb_agg(jsonb_build_object('key', a.place_key,
				'name', replace(initcap(a.place_key), ' Of ', ' of ')) ORDER BY a.place_key)
				FROM anchor_spots a), '[]'::jsonb)
		) END
	) INTO v_result;

	RETURN jsonb_strip_nulls(v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_connections(jsonb, text[], integer, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_connections(jsonb, text[], integer, integer, integer, uuid) TO authenticated, service_role;

COMMIT;
