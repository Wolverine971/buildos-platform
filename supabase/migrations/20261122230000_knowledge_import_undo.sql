-- supabase/migrations/20261122230000_knowledge_import_undo.sql
-- Undo a contact import. An import stamps what it creates (people, organizations, identity
-- keys; facts already carry run_id), so one call can take it all back: new entries go, and
-- details it added to people who were already there come off their cards. Anything the owner
-- has used since (edited, researched, linked to work, merged into) stays.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.knowledge_entities
	ADD COLUMN run_id uuid REFERENCES public.knowledge_runs(id) ON DELETE SET NULL;
ALTER TABLE public.knowledge_entity_keys
	ADD COLUMN run_id uuid REFERENCES public.knowledge_runs(id) ON DELETE SET NULL;

CREATE INDEX knowledge_entities_run ON public.knowledge_entities (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX knowledge_entity_keys_run ON public.knowledge_entity_keys (run_id) WHERE run_id IS NOT NULL;

COMMENT ON COLUMN public.knowledge_entities.run_id IS
	'The import run that created this entry (NULL for everything else). Lets the import be undone.';
COMMENT ON COLUMN public.knowledge_entity_keys.run_id IS
	'The import run that added this identity key. Lets the import be undone.';

-- Runs as the caller: row security already limits every delete to the caller's own private rows.
CREATE FUNCTION public.knowledge_undo_import(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
	viewer uuid := auth.uid();
	me uuid;
	made uuid[];
	kept uuid[];
	doomed uuid[];
	n_people integer := 0;
	n_orgs integer := 0;
	n_facts integer := 0;
BEGIN
	IF viewer IS NULL OR NOT EXISTS (SELECT FROM public.knowledge_runs
		WHERE id = p_run_id AND owner_user_id = viewer AND run_type = 'import') THEN
		RAISE EXCEPTION 'An import run owned by the caller is required' USING ERRCODE = '42501';
	END IF;
	-- Two taps on Undo, or an undo racing a re-import of the same file.
	PERFORM pg_advisory_xact_lock(hashtextextended('knowledge-import-undo:' || viewer, 0));

	SELECT id INTO me FROM public.knowledge_entities WHERE owner_user_id = viewer AND is_self;
	SELECT coalesce(array_agg(id), '{}') INTO made FROM public.knowledge_entities
	WHERE run_id = p_run_id AND owner_user_id = viewer AND NOT is_self;

	-- Entries the owner has done something with since the import stay, with their details.
	SELECT coalesce(array_agg(e.id), '{}') INTO kept FROM public.knowledge_entities e
	WHERE e.id = ANY(made) AND (
		e.circle_source = 'user'
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

	-- Details the import added: on entries that are going, and on people who were already here.
	-- "I know them" about a kept person stays.
	DELETE FROM public.knowledge_facts f
	WHERE f.run_id = p_run_id AND f.owner_user_id = viewer
		AND NOT (f.entity_id = ANY(kept))
		AND NOT (f.entity_id IS NOT DISTINCT FROM me AND f.object_entity_id = ANY(kept));
	GET DIAGNOSTICS n_facts = ROW_COUNT;

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
