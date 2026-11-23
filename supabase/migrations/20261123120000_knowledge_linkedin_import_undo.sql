-- supabase/migrations/20261123120000_knowledge_linkedin_import_undo.sql
-- LinkedIn imports can be undone, like phone and Google ones (20261122230000).
--   1. The LinkedIn import stamps the people, organizations and identity keys it creates with
--      its run, so knowledge_undo_import can take them back.
--   2. A re-import fills an empty summary or refreshes one an earlier import wrote; a summary
--      the owner wrote stays.
--   3. Imports and undos share one per-owner lock, so an undo can't race a batch.
--   4. An entry the owner edited by hand (edited_at) survives an undo.
--   5. Undo puts back the headline and connection date an import replaced on someone who was
--      already here, and the summary that went with them.
--   6. Name lookups for large files use an index instead of scanning every person.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.knowledge_entities ADD COLUMN edited_at timestamptz;
COMMENT ON COLUMN public.knowledge_entities.edited_at IS
	'When the owner last edited the name, summary or kind by hand. An import undo keeps edited entries.';

CREATE INDEX knowledge_entities_owner_person_name ON public.knowledge_entities (owner_user_id, normalized_name)
	WHERE kind = 'person' AND status = 'active';

CREATE OR REPLACE FUNCTION public.knowledge_import_linkedin(p_rows jsonb, p_file_name text, p_run_id uuid)
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

	-- One lock for every import write and every undo: a reconnect or two tabs can submit the
	-- same file to different web instances, and an undo must not race a batch it would orphan.
	PERFORM pg_advisory_xact_lock(hashtextextended('knowledge-import:' || viewer, 0));
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
			jsonb_build_object('format', 'linkedin_csv', 'contacts', jsonb_array_length(p_rows), 'run_id', p_run_id))
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
				INSERT INTO public.knowledge_entities(kind, name, scope, owner_user_id, created_via, run_id)
				VALUES ('org', c.company, 'private', viewer, 'import', p_run_id) RETURNING id INTO org;
			END IF;
			INSERT INTO public.knowledge_entity_keys(entity_id, key_type, key_value, scope, owner_user_id, run_id)
			VALUES (org, 'external', company_source_key, 'private', viewer, p_run_id) ON CONFLICT DO NOTHING;
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
			INSERT INTO public.knowledge_entities(kind, name, summary, scope, owner_user_id, created_via, run_id)
			VALUES ('person', c.name, left(coalesce(headline, c.company), 300), 'private', viewer, 'import', p_run_id)
			RETURNING id INTO person;
			created := created + 1;
		ELSE
			matched := matched + 1;
			-- Fill an empty summary, or refresh one an earlier import wrote (a LinkedIn headline or
			-- the bare company name). A summary the owner wrote is never replaced.
			UPDATE public.knowledge_entities e SET summary = left(coalesce(headline, c.company), 300)
			WHERE e.id = person AND e.owner_user_id = viewer AND coalesce(headline, c.company) IS NOT NULL
				AND e.summary IS DISTINCT FROM left(coalesce(headline, c.company), 300)
				AND (e.summary IS NULL OR (e.edited_at IS NULL AND (e.summary = left(c.company, 300)
					OR EXISTS (SELECT FROM public.knowledge_facts h WHERE h.entity_id = e.id
						AND h.owner_user_id = viewer AND h.predicate = 'headline' AND h.created_via = 'import'
						AND left(h.value_text, 300) = e.summary))));
		END IF;
		INSERT INTO public.knowledge_entity_keys(entity_id, key_type, key_value, scope, owner_user_id, run_id)
		SELECT person, k.kind, k.val, 'private', viewer, p_run_id FROM (VALUES
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

-- Runs as the caller: row security already limits every write to the caller's own private rows.
CREATE OR REPLACE FUNCTION public.knowledge_undo_import(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
	viewer uuid := auth.uid();
	me uuid;
	made uuid[];
	kept uuid[];
	doomed uuid[];
	restored uuid[];
	resummarize uuid[];
	n_people integer := 0;
	n_orgs integer := 0;
	n_facts integer := 0;
BEGIN
	IF viewer IS NULL OR NOT EXISTS (SELECT FROM public.knowledge_runs
		WHERE id = p_run_id AND owner_user_id = viewer AND run_type = 'import') THEN
		RAISE EXCEPTION 'An import run owned by the caller is required' USING ERRCODE = '42501';
	END IF;
	-- Two taps on Undo, or an undo racing an import batch: the same lock every import takes.
	PERFORM pg_advisory_xact_lock(hashtextextended('knowledge-import:' || viewer, 0));

	SELECT id INTO me FROM public.knowledge_entities WHERE owner_user_id = viewer AND is_self;
	SELECT coalesce(array_agg(id), '{}') INTO made FROM public.knowledge_entities
	WHERE run_id = p_run_id AND owner_user_id = viewer AND NOT is_self;

	-- Entries the owner has done something with since the import stay, with their details.
	SELECT coalesce(array_agg(e.id), '{}') INTO kept FROM public.knowledge_entities e
	WHERE e.id = ANY(made) AND (
		e.circle_source = 'user'
		OR e.edited_at IS NOT NULL
		OR e.enriched_at IS NOT NULL
		OR EXISTS (SELECT FROM public.knowledge_entities m WHERE m.merged_into_id = e.id)
		OR EXISTS (SELECT FROM public.knowledge_record_links l WHERE l.entity_id = e.id)
		OR EXISTS (SELECT FROM public.knowledge_mentions m WHERE m.entity_id = e.id)
		OR EXISTS (SELECT FROM public.knowledge_run_targets t WHERE t.entity_id = e.id)
		OR EXISTS (SELECT FROM public.knowledge_shares s WHERE s.entity_id = e.id)
		OR EXISTS (SELECT FROM public.knowledge_research_hints h WHERE h.entity_id = e.id)
		OR EXISTS (SELECT FROM public.knowledge_facts f WHERE f.entity_id = e.id
			AND f.run_id IS DISTINCT FROM p_run_id)
		OR EXISTS (SELECT FROM public.knowledge_facts f WHERE f.object_entity_id = e.id
			AND f.run_id IS DISTINCT FROM p_run_id)
	);
	-- A kept person's employer stays with them.
	SELECT kept || coalesce(array_agg(DISTINCT f.object_entity_id), '{}') INTO kept
	FROM public.knowledge_facts f
	WHERE f.run_id = p_run_id AND f.owner_user_id = viewer AND f.entity_id = ANY(kept)
		AND f.object_entity_id = ANY(made) AND NOT (f.object_entity_id = ANY(kept));
	SELECT coalesce(array_agg(id), '{}') INTO doomed FROM unnest(made) AS m(id) WHERE NOT (id = ANY(kept));

	SELECT count(*) FILTER (WHERE kind = 'person'), count(*) FILTER (WHERE kind = 'org')
	INTO n_people, n_orgs FROM public.knowledge_entities
	WHERE id = ANY(doomed) AND status <> 'merged';

	-- People who were already here: the import may have replaced their headline and connection
	-- date (superseding the old ones) and refreshed a summary an earlier import wrote.
	SELECT coalesce(array_agg(DISTINCT f.entity_id), '{}') INTO restored FROM public.knowledge_facts f
	WHERE f.run_id = p_run_id AND f.owner_user_id = viewer
		AND f.predicate IN ('headline', 'connected_on') AND NOT (f.entity_id = ANY(made));
	SELECT coalesce(array_agg(e.id), '{}') INTO resummarize FROM public.knowledge_entities e
	WHERE e.id = ANY(restored) AND e.owner_user_id = viewer AND e.edited_at IS NULL
		AND EXISTS (SELECT FROM public.knowledge_facts f WHERE f.run_id = p_run_id
			AND f.entity_id = e.id AND f.predicate = 'headline' AND left(f.value_text, 300) = e.summary);

	-- Details the import added: on entries that are going, and on people who were already here.
	-- "I know them" about a kept person stays.
	DELETE FROM public.knowledge_facts f
	WHERE f.run_id = p_run_id AND f.owner_user_id = viewer
		AND NOT (f.entity_id = ANY(kept))
		AND NOT (f.entity_id IS NOT DISTINCT FROM me AND f.object_entity_id = ANY(kept));
	GET DIAGNOSTICS n_facts = ROW_COUNT;

	-- The newest headline and connection date the import superseded are current again.
	UPDATE public.knowledge_facts f SET status = 'active'
	WHERE f.id IN (
		SELECT DISTINCT ON (s.entity_id, s.predicate) s.id FROM public.knowledge_facts s
		WHERE s.owner_user_id = viewer AND s.entity_id = ANY(restored)
			AND s.predicate IN ('headline', 'connected_on') AND s.status = 'superseded'
		ORDER BY s.entity_id, s.predicate, s.created_at DESC, s.id DESC)
	AND NOT EXISTS (SELECT FROM public.knowledge_facts a WHERE a.entity_id = f.entity_id
		AND a.predicate = f.predicate AND a.owner_user_id = viewer AND a.status = 'active');
	UPDATE public.knowledge_entities e SET summary = (
		SELECT left(h.value_text, 300) FROM public.knowledge_facts h
		WHERE h.entity_id = e.id AND h.owner_user_id = viewer AND h.predicate = 'headline'
			AND h.status = 'active'
		ORDER BY h.created_at DESC LIMIT 1)
	WHERE e.id = ANY(resummarize) AND e.owner_user_id = viewer;

	DELETE FROM public.knowledge_entity_keys k
	WHERE k.run_id = p_run_id AND k.owner_user_id = viewer AND NOT (k.entity_id = ANY(kept));

	-- Their remaining rows (duplicate questions, keys) go with them.
	DELETE FROM public.knowledge_entities e WHERE e.id = ANY(doomed) AND e.owner_user_id = viewer;

	DELETE FROM public.knowledge_sources s
	WHERE s.owner_user_id = viewer AND s.source_type = 'import' AND s.meta ->> 'run_id' = p_run_id::text
		AND NOT EXISTS (SELECT FROM public.knowledge_fact_sources c WHERE c.source_id = s.id);

	RETURN jsonb_build_object('people_removed', n_people, 'orgs_removed', n_orgs,
		'details_removed', n_facts, 'kept', cardinality(kept));
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_undo_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_undo_import(uuid) TO authenticated;

COMMIT;
