-- supabase/migrations/20261121231933_knowledge_linkedin_import.sql
-- Tasker 161. One signed-in owner's LinkedIn batch commits together, including its citations.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.knowledge_fold_org_name(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
	SELECT nullif(regexp_replace(regexp_replace(lower(btrim(p_name)), '^the[[:space:][:punct:]]+', ''),
		'[[:space:][:punct:]]+', '', 'g'), '')
$$;
REVOKE ALL ON FUNCTION public.knowledge_fold_org_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_fold_org_name(text) TO authenticated, service_role;

ALTER TABLE public.knowledge_entities ADD COLUMN normalized_org_name text
	GENERATED ALWAYS AS (CASE WHEN kind = 'org' THEN public.knowledge_fold_org_name(name) END) STORED;
CREATE INDEX knowledge_entities_owner_org_name ON public.knowledge_entities(owner_user_id, normalized_org_name)
	WHERE kind = 'org' AND status = 'active';

INSERT INTO public.knowledge_predicates
	(key, label, inverse_label, description, value_type, subject_kinds, object_kinds, cardinality, shareable_subject_kinds, qualifier_keys, sort_order)
VALUES
	('connected_on', 'Connected on LinkedIn', NULL, 'The date the owner connected with this person on LinkedIn.', 'date', '{person}', '{}', 'one', '{}', '{}', 215)
ON CONFLICT (key) DO NOTHING;

-- A connection date reveals the same private relationship as the knows edge.
CREATE OR REPLACE FUNCTION public.knowledge_fact_share_level(
	p_predicate text,
	p_subject_kind text,
	p_status text,
	p_qualifiers jsonb,
	p_has_public_source boolean,
	p_has_project_source boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
	SELECT CASE
		WHEN p_predicate IN ('note', 'knows', 'birthday', 'connected_on') THEN 'never'
		WHEN p_status IS DISTINCT FROM 'active' THEN 'owner'
		WHEN p_has_project_source THEN 'shared'
		WHEN (
			-- People: their professional, public face only.
			(p_subject_kind = 'person' AND p_predicate IN (
				'alias', 'description', 'headline', 'homepage', 'profile_url', 'url', 'thumbnail_url', 'owns'
			))
			OR (p_subject_kind = 'person' AND p_predicate = 'works_at'
				AND coalesce(p_qualifiers ->> 'current', 'true') <> 'false'
				AND NOT (coalesce(p_qualifiers, '{}'::jsonb) ? 'end'))
			-- Everything else (orgs, places, websites, media): all but loose links.
			OR (p_subject_kind <> 'person' AND p_predicate <> 'related_to')
		) THEN CASE WHEN p_has_public_source THEN 'shared' ELSE 'request' END
		ELSE 'request'
	END
$$;

REVOKE ALL ON FUNCTION public.knowledge_fact_share_level(text, text, text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_fact_share_level(text, text, text, jsonb, boolean, boolean) TO authenticated, service_role;

CREATE FUNCTION public.knowledge_import_linkedin(p_rows jsonb, p_file_name text, p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
	viewer uuid := auth.uid();
	me uuid;
	src uuid;
	source_hash text := 'linkedin:' || md5(p_rows::text);
	c record;
	f record;
	person uuid;
	org uuid;
	orgs uuid[] := '{}';
	name_matches uuid[];
	org_matches uuid[];
	full_name text;
	first_name text;
	company_key text;
	company_source_key text;
	profile_key text;
	contact_key text;
	headline text;
	fact_id uuid;
	created integer := 0;
	matched integer := 0;
	added integer := 0;
	existing integer := 0;
	reviews integer := 0;
	n integer;
BEGIN
	IF viewer IS NULL OR NOT EXISTS (SELECT FROM public.knowledge_runs
		WHERE id = p_run_id AND owner_user_id = viewer AND run_type = 'import') THEN
		RAISE EXCEPTION 'An import run owned by the caller is required' USING ERRCODE = '42501';
	END IF;
	IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1500 THEN
		RAISE EXCEPTION 'A batch must contain 1 to 1500 connections' USING ERRCODE = '22023';
	END IF;

	-- A reconnect or two tabs can submit the same file to different web instances.
	PERFORM pg_advisory_xact_lock(hashtextextended('linkedin-import:' || viewer, 0));
	SELECT id INTO me FROM public.knowledge_entities WHERE owner_user_id = viewer AND is_self;
	IF me IS NULL THEN
		INSERT INTO public.knowledge_entities(kind, name, scope, owner_user_id, is_self, created_via)
		SELECT 'person', coalesce(nullif(left(btrim(name), 300), ''), 'Me'), 'private', viewer, true, 'system'
		FROM public.users WHERE id = viewer ON CONFLICT (owner_user_id) WHERE is_self DO NOTHING;
		SELECT id INTO STRICT me FROM public.knowledge_entities WHERE owner_user_id = viewer AND is_self;
	END IF;
	SELECT id INTO src FROM public.knowledge_sources WHERE owner_user_id = viewer
		AND source_type = 'import' AND content_hash = source_hash LIMIT 1;
	IF src IS NULL THEN
		INSERT INTO public.knowledge_sources(scope, owner_user_id, source_type, title, content_hash, meta)
		VALUES ('private', viewer, 'import', left(p_file_name, 200), source_hash,
			jsonb_build_object('format', 'linkedin_csv', 'contacts', jsonb_array_length(p_rows)))
		RETURNING id INTO src;
	END IF;

	FOR c IN SELECT * FROM jsonb_to_recordset(p_rows) AS x(name text, given_name text,
		profile_url text, linkedin_key text, email text, company text, title text, connected_on date)
	LOOP
		full_name := lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g'));
		first_name := lower(btrim(c.given_name));
		profile_key := nullif(c.linkedin_key, '');
		-- A row without a profile still needs a stable identity on an exact replay.
		contact_key := coalesce(profile_key, 'linkedin-row:' || md5(to_jsonb(c)::text));
		headline := CASE WHEN c.title IS NOT NULL THEN concat_ws(' at ', c.title, c.company) END;
		org := NULL;
		company_key := public.knowledge_fold_org_name(c.company);
		IF c.company IS NOT NULL THEN
			SELECT array_agg(e.id ORDER BY (e.normalized_name = lower(c.company)) DESC, e.created_at, e.id)
			INTO org_matches FROM public.knowledge_entities e
			WHERE e.owner_user_id = viewer AND e.kind = 'org' AND e.status = 'active'
				AND (e.normalized_org_name = company_key OR e.normalized_name = lower(c.company));
			-- The key follows an explicit merge even when the survivor has a different name.
			company_source_key := 'linkedin-company:' || md5(lower(c.company));
			SELECT e.id INTO org FROM public.knowledge_entity_keys k
			JOIN public.knowledge_entities e ON e.id = k.entity_id
			WHERE k.owner_user_id = viewer AND k.key_type = 'external' AND k.key_value = company_source_key
				AND e.kind = 'org' AND e.status = 'active';
			org := coalesce(org, org_matches[1]);
			IF org IS NULL THEN
				SELECT e.id INTO org FROM public.knowledge_facts a JOIN public.knowledge_entities e ON e.id = a.entity_id
				WHERE a.owner_user_id = viewer AND a.predicate = 'alias' AND a.status = 'active'
					AND lower(btrim(a.value_text)) = lower(c.company) AND e.kind = 'org' AND e.status = 'active'
				ORDER BY e.created_at, e.id LIMIT 1;
			END IF;
			IF org IS NULL THEN
				INSERT INTO public.knowledge_entities(kind, name, scope, owner_user_id, created_via)
				VALUES ('org', c.company, 'private', viewer, 'import') RETURNING id INTO org;
			END IF;
			INSERT INTO public.knowledge_entity_keys(entity_id, key_type, key_value, scope, owner_user_id)
			VALUES (org, 'external', company_source_key, 'private', viewer) ON CONFLICT DO NOTHING;
			orgs := array_append(orgs, org);
			-- "thecadre" could be "The Cadre". A joined prefix alone is ambiguous
			-- (as in "Theater"), so offer the pair for review without merging either record.
			INSERT INTO public.knowledge_merge_candidates(owner_user_id, entity_a, entity_b, reason)
			SELECT viewer, least(org, e.id), greatest(org, e.id), 'Company names have a similar spelling'
			FROM public.knowledge_entities e WHERE e.owner_user_id = viewer AND e.kind = 'org'
				AND e.status = 'active' AND e.id <> org AND (e.id = ANY(org_matches)
					OR e.normalized_org_name = 'the' || company_key
					OR (left(company_key, 3) = 'the' AND e.normalized_org_name = substr(company_key, 4)))
			ON CONFLICT (owner_user_id, entity_a, entity_b) DO NOTHING;
			GET DIAGNOSTICS n = ROW_COUNT;
			reviews := reviews + n;
		END IF;

		-- A LinkedIn ID outranks email and spelling. An email can be a shared inbox.
		SELECT e.id INTO person FROM public.knowledge_entity_keys k
		JOIN public.knowledge_entities e ON e.id = k.entity_id
		WHERE k.key_type = CASE WHEN profile_key IS NULL THEN 'external' ELSE 'linkedin' END
			AND k.key_value = contact_key AND (k.owner_user_id = viewer OR k.scope = 'public')
			AND e.kind = 'person' AND NOT e.is_self AND e.status <> 'merged'
		ORDER BY (k.scope = 'private') DESC LIMIT 1;
		IF person IS NULL AND c.email IS NOT NULL THEN
			SELECT e.id INTO person FROM public.knowledge_entity_keys k
			JOIN public.knowledge_entities e ON e.id = k.entity_id
			WHERE k.key_type = 'email' AND k.key_value = c.email AND k.owner_user_id = viewer
				AND e.kind = 'person' AND NOT e.is_self AND e.status = 'active'
				AND (e.normalized_name = full_name OR split_part(e.normalized_name, ' ', 1) = first_name)
				AND NOT EXISTS (SELECT FROM public.knowledge_entity_keys other WHERE other.entity_id = e.id
					AND other.key_type = 'linkedin' AND other.key_value <> profile_key)
			LIMIT 1;
		END IF;

		name_matches := NULL;
		IF person IS NULL AND strpos(full_name, ' ') > 0 THEN
			SELECT array_agg(e.id) INTO name_matches FROM public.knowledge_entities e
			WHERE e.owner_user_id = viewer AND e.kind = 'person' AND e.status = 'active'
				AND NOT e.is_self AND e.normalized_name = full_name
				AND NOT EXISTS (SELECT FROM public.knowledge_entity_keys k WHERE k.entity_id = e.id
					AND k.key_type = 'linkedin' AND k.key_value <> profile_key);
			IF name_matches IS NULL THEN
				-- A prior manual merge leaves the old full name on the survivor as a private alias.
				SELECT array_agg(DISTINCT e.id) INTO name_matches FROM public.knowledge_facts a
				JOIN public.knowledge_entities e ON e.id = a.entity_id
				WHERE a.owner_user_id = viewer AND a.predicate = 'alias' AND a.status = 'active'
					AND lower(btrim(a.value_text)) = full_name AND e.kind = 'person' AND e.status = 'active'
					AND NOT e.is_self AND NOT EXISTS (SELECT FROM public.knowledge_entity_keys k
						WHERE k.entity_id = e.id AND k.key_type = 'linkedin' AND k.key_value <> profile_key);
			END IF;
			IF cardinality(name_matches) = 1 THEN person := name_matches[1]; END IF;
		END IF;
		IF person IS NULL THEN
			INSERT INTO public.knowledge_entities(kind, name, summary, scope, owner_user_id, created_via)
			VALUES ('person', c.name, left(coalesce(headline, c.company), 300), 'private', viewer, 'import')
			RETURNING id INTO person;
			created := created + 1;
		ELSE
			matched := matched + 1;
			UPDATE public.knowledge_entities SET summary = left(coalesce(headline, c.company), 300)
			WHERE id = person AND owner_user_id = viewer AND coalesce(headline, c.company) IS NOT NULL
				AND (summary IS NULL OR (headline IS NOT NULL AND summary IS DISTINCT FROM left(headline, 300)));
		END IF;
		INSERT INTO public.knowledge_entity_keys(entity_id, key_type, key_value, scope, owner_user_id)
		SELECT person, k.kind, k.val, 'private', viewer FROM (VALUES
			(CASE WHEN profile_key IS NULL THEN 'external' ELSE 'linkedin' END, contact_key), ('email', c.email)
		) k(kind, val) WHERE k.val IS NOT NULL ON CONFLICT DO NOTHING;

		-- The export's structured given name + a current works_at on the same employer
		-- can suggest a task's one-word person. Neither clue alone is enough.
		INSERT INTO public.knowledge_merge_candidates(owner_user_id, entity_a, entity_b, reason)
		SELECT viewer, least(person, e.id), greatest(person, e.id),
			CASE WHEN e.id = ANY(name_matches) THEN 'Same full name' ELSE 'Same given name and employer' END
		FROM public.knowledge_entities e WHERE e.id <> person AND e.owner_user_id = viewer
			AND e.kind = 'person' AND e.status = 'active' AND NOT e.is_self
			AND (e.id = ANY(name_matches) OR (e.normalized_name = first_name
				AND strpos(first_name, ' ') = 0 AND org IS NOT NULL
				AND (e.created_via IN ('task','backfill') OR EXISTS (SELECT FROM public.knowledge_record_links l
					WHERE l.entity_id = e.id AND l.owner_user_id = viewer AND l.record_kind = 'task'))
				AND EXISTS (SELECT FROM public.knowledge_facts w JOIN public.knowledge_entities employer
					ON employer.id = w.object_entity_id WHERE w.entity_id = e.id AND w.owner_user_id = viewer
					AND w.predicate = 'works_at' AND w.status = 'active' AND w.valid_to IS NULL
					AND (w.qualifiers->>'current') IS DISTINCT FROM 'false' AND NOT (w.qualifiers ? 'end')
					AND (employer.id = org OR employer.normalized_org_name = company_key))))
			AND NOT EXISTS (SELECT FROM public.knowledge_entity_keys k WHERE k.entity_id = e.id
				AND k.key_type = 'linkedin' AND k.key_value <> profile_key)
		ON CONFLICT (owner_user_id, entity_a, entity_b) DO NOTHING;
		GET DIAGNOSTICS n = ROW_COUNT;
		reviews := reviews + n;

		FOR f IN SELECT * FROM (VALUES
			(me, 'knows', person, NULL::text, jsonb_strip_nulls(jsonb_build_object('via', 'linkedin', 'since', c.connected_on))),
			(person, 'works_at', org, NULL, jsonb_strip_nulls(jsonb_build_object('title', c.title, 'current', true))),
			(person, 'connected_on', NULL, c.connected_on::text, '{}'::jsonb),
			(person, 'email', NULL, c.email, '{}'::jsonb),
			(person, 'profile_url', NULL, c.profile_url, '{"platform":"linkedin"}'::jsonb),
			(person, 'headline', NULL, headline, '{}'::jsonb)
		) facts(subject_id, pred, object_id, val, qual) WHERE object_id IS NOT NULL OR val IS NOT NULL
		LOOP
			SELECT id INTO fact_id FROM public.knowledge_facts WHERE owner_user_id = viewer
				AND entity_id = f.subject_id AND predicate = f.pred
				AND dedupe_key = md5(f.subject_id::text || '|' || f.pred || '|' || coalesce(f.object_id::text, lower(btrim(f.val))));
			IF fact_id IS NULL THEN
				INSERT INTO public.knowledge_facts(entity_id, predicate, object_entity_id, value_text,
					qualifiers, scope, owner_user_id, created_via, run_id)
				VALUES (f.subject_id, f.pred, f.object_id, f.val, f.qual, 'private', viewer, 'import', p_run_id)
				RETURNING id INTO fact_id;
				added := added + 1;
			ELSE
				-- Preserve how the user originally met someone. LinkedIn's date has its own fact.
				UPDATE public.knowledge_facts SET qualifiers = CASE WHEN f.pred = 'knows' AND qualifiers ? 'via'
					THEN qualifiers ELSE qualifiers || f.qual END, status = 'active'
				WHERE id = fact_id AND (status IN ('superseded','retracted') OR qualifiers IS DISTINCT FROM
					CASE WHEN f.pred = 'knows' AND qualifiers ? 'via' THEN qualifiers ELSE qualifiers || f.qual END);
				existing := existing + 1;
			END IF;
			IF f.pred IN ('headline','connected_on') THEN
				UPDATE public.knowledge_facts SET status = 'superseded' WHERE entity_id = person
					AND predicate = f.pred AND owner_user_id = viewer AND status = 'active' AND id <> fact_id;
			END IF;
			INSERT INTO public.knowledge_fact_sources(fact_id, source_id) VALUES (fact_id, src) ON CONFLICT DO NOTHING;
		END LOOP;
	END LOOP;
	RETURN jsonb_build_object('people_created', created, 'people_matched', matched, 'possible_duplicates', reviews,
		'org_ids', to_jsonb(ARRAY(SELECT DISTINCT id FROM unnest(orgs) AS o(id))), 'facts_added', added, 'facts_existing', existing);
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_import_linkedin(jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_import_linkedin(jsonb, text, uuid) TO authenticated;

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
	IF v_sort NOT IN ('recent', 'name', 'researched', 'connected') THEN
		RAISE EXCEPTION 'sort must be recent, name, researched or connected' USING ERRCODE = '22023';
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
				OR e.circle <> 'public' OR p_filter = 'known')
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
				d.connected_on DESC NULLS LAST,
				CASE WHEN v_sort = 'name' THEN f.normalized_name END ASC,
				CASE WHEN v_sort = 'researched' THEN f.researched_at END DESC NULLS LAST,
				f.updated_at DESC, f.id) AS pos
		FROM filtered f LEFT JOIN connection_dates d ON d.id = f.id
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
