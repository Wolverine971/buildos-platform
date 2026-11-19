-- supabase/migrations/20261118300100_knowledge_lens_source_url.sql
-- Tasker 168: the project lens also returns each fact's first public web source (source_url), so
-- a card can cite it and "Add to my People" can copy a public fact with its real source (never
-- a granted contact detail). Same rules as 20261118300000 otherwise.
--
-- Rollback: re-run the knowledge_project_lens definition from 20261118300000.

BEGIN;

CREATE OR REPLACE FUNCTION public.knowledge_project_lens(
	p_project uuid,
	p_record_kind text,
	p_record_ids uuid[],
	p_viewer uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
	v_result jsonb;
BEGIN
	IF p_record_kind NOT IN ('task', 'document') THEN
		RAISE EXCEPTION 'Unsupported record kind' USING ERRCODE = '22023';
	END IF;
	IF NOT v_viewer IN (SELECT public.knowledge_project_member_users(p_project)) THEN
		RAISE EXCEPTION 'Not a member of this project' USING ERRCODE = '42501';
	END IF;

	WITH members AS (
		SELECT public.knowledge_project_member_users(p_project) AS user_id
	),
	-- Only this project's records (never trust the ids the caller sent).
	records AS (
		SELECT t.id FROM public.onto_tasks t
		WHERE p_record_kind = 'task' AND t.id = ANY (p_record_ids[1:100])
			AND t.project_id = p_project AND t.deleted_at IS NULL
		UNION
		SELECT d.id FROM public.onto_documents d
		WHERE p_record_kind = 'document' AND d.id = ANY (p_record_ids[1:100])
			AND d.project_id = p_project AND d.deleted_at IS NULL
	),
	project_records AS (
		SELECT t.id FROM public.onto_tasks t WHERE t.project_id = p_project
		UNION ALL
		SELECT d.id FROM public.onto_documents d WHERE d.project_id = p_project
	),
	links AS (
		SELECT l.owner_user_id, l.entity_id,
			array_agg(DISTINCT l.record_id) AS record_ids,
			array_remove(array_agg(DISTINCT l.quote), NULL) AS quotes
		FROM public.knowledge_record_links l
		JOIN records r ON r.id = l.record_id
		WHERE l.record_kind = p_record_kind
			AND l.owner_user_id <> v_viewer
			AND l.owner_user_id IN (SELECT user_id FROM members)
		GROUP BY l.owner_user_id, l.entity_id
	),
	entries AS (
		SELECT k.*, e.kind, e.name, e.summary
		FROM links k
		JOIN public.knowledge_entities e ON e.id = k.entity_id
		WHERE e.scope = 'private' AND e.owner_user_id = k.owner_user_id AND e.status = 'active'
	),
	grants AS (
		SELECT DISTINCT ON (s.entity_id) s.entity_id, s.id, s.what, s.predicates, s.duration, s.expires_at
		FROM public.knowledge_shares s
		WHERE s.entity_id IN (SELECT entity_id FROM entries)
			AND public.knowledge_share_is_live(s.id, v_viewer)
		ORDER BY s.entity_id, (s.what = 'all') DESC, s.decided_at DESC NULLS LAST
	),
	asks AS (
		SELECT DISTINCT ON (s.entity_id) s.entity_id, s.id, s.status, s.created_at
		FROM public.knowledge_shares s
		WHERE s.entity_id IN (SELECT entity_id FROM entries)
			AND s.requested_by_user_id = v_viewer
			AND s.status IN ('requested', 'declined')
			AND (s.status <> 'requested' OR s.created_at > now() - interval '14 days')
		ORDER BY s.entity_id, s.created_at DESC
	),
	facts AS (
		SELECT f.id, f.entity_id, f.predicate, f.value_text, f.qualifiers, o.name AS object_name,
			o.kind AS object_kind, en.kind AS subject_kind,
			public.knowledge_fact_share_level(
				f.predicate, en.kind, f.status, f.qualifiers,
				EXISTS (
					SELECT 1 FROM public.knowledge_fact_sources fs
					JOIN public.knowledge_sources src ON src.id = fs.source_id
					WHERE fs.fact_id = f.id AND src.source_type IN ('web', 'youtube') AND src.url IS NOT NULL
				),
				EXISTS (
					SELECT 1 FROM public.knowledge_fact_sources fs
					JOIN public.knowledge_sources src ON src.id = fs.source_id
					WHERE fs.fact_id = f.id AND src.source_type IN ('task', 'document')
						AND src.record_id IN (SELECT id FROM project_records)
				)
			) AS level,
			(
				SELECT src.url FROM public.knowledge_fact_sources fs
				JOIN public.knowledge_sources src ON src.id = fs.source_id
				WHERE fs.fact_id = f.id AND src.source_type IN ('web', 'youtube') AND src.url IS NOT NULL
				ORDER BY src.created_at
				LIMIT 1
			) AS source_url
		FROM public.knowledge_facts f
		JOIN entries en ON en.entity_id = f.entity_id
		LEFT JOIN public.knowledge_entities o ON o.id = f.object_entity_id
		WHERE f.owner_user_id = en.owner_user_id
			-- A link to the owner's own person entry ("Me") says nothing about the name.
			AND (o.id IS NULL OR NOT o.is_self)
	),
	judged AS (
		SELECT f.*,
			CASE
				WHEN f.level = 'shared' THEN 'project_or_web'
				WHEN f.level = 'request' AND g.id IS NOT NULL AND (
					g.what = 'all'
					OR (g.what = 'contact' AND f.predicate IN ('email', 'phone', 'address'))
					OR f.predicate = ANY (g.predicates)
				) THEN 'grant'
				ELSE NULL
			END AS shown_via
		FROM facts f
		LEFT JOIN grants g ON g.entity_id = f.entity_id
	)
	SELECT jsonb_build_object('entries', coalesce(jsonb_agg(entry ORDER BY entry ->> 'sort'), '[]'::jsonb))
	INTO v_result
	FROM (
		SELECT jsonb_build_object(
			'sort', en.name,
			'owner', jsonb_build_object(
				'user_id', en.owner_user_id,
				'name', public.people_layer_display_name(en.owner_user_id)
			),
			'entity', jsonb_build_object('id', en.entity_id, 'kind', en.kind, 'name', en.name, 'summary', en.summary),
			'record_ids', to_jsonb(en.record_ids),
			'quotes', to_jsonb(en.quotes[1:5]),
			'facts', coalesce((
				SELECT jsonb_agg(jsonb_build_object(
					'id', j.id, 'predicate', j.predicate, 'value', j.value_text,
					'object_name', j.object_name, 'object_kind', j.object_kind,
					'qualifiers', j.qualifiers, 'source_url', j.source_url,
					'via', CASE WHEN j.shown_via = 'grant' THEN 'grant' ELSE 'shared' END
				) ORDER BY j.predicate)
				FROM judged j WHERE j.entity_id = en.entity_id AND j.shown_via IS NOT NULL
			), '[]'::jsonb),
			'hidden', jsonb_build_object(
				'contact', (SELECT count(*) FROM judged j WHERE j.entity_id = en.entity_id
					AND j.level = 'request' AND j.shown_via IS NULL
					AND j.predicate IN ('email', 'phone', 'address')),
				'other', (SELECT count(*) FROM judged j WHERE j.entity_id = en.entity_id
					AND j.level = 'request' AND j.shown_via IS NULL
					AND j.predicate NOT IN ('email', 'phone', 'address'))
			),
			'ask', (SELECT jsonb_build_object('id', a.id, 'status', a.status, 'created_at', a.created_at)
				FROM asks a WHERE a.entity_id = en.entity_id),
			'grant', (SELECT jsonb_build_object('id', g.id, 'what', g.what, 'duration', g.duration, 'expires_at', g.expires_at)
				FROM grants g WHERE g.entity_id = en.entity_id)
		) AS entry
		FROM entries en
	) rows_;

	RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_project_lens(uuid, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_project_lens(uuid, text, uuid[], uuid) TO authenticated, service_role;

COMMIT;
