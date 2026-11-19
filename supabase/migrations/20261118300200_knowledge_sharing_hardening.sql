-- supabase/migrations/20261118300200_knowledge_sharing_hardening.sql
-- Tasker 168 review fixes (adversarial review 2026-11-18). Same feature, tighter rules:
--   1. One function decides what a viewer sees of one entry (knowledge_entity_visibility), used
--      by the lens and by Ask, so they can't disagree.
--   2. "From the public web" means research found it on a page: the fact was written by a
--      research run (created_via 'enrichment' with a run_id) AND has a web/youtube source. A URL
--      typed into chat, MCP, an import or a backfill no longer makes a fact public.
--   3. "From this project" means a live (not deleted) task/doc of the project that the owner's
--      entry is still linked to (links follow the text since tasker 167).
--   4. Every live grant counts (a project-wide grant plus a per-person pick both apply).
--   5. The entry's free-text summary is shown only when it equals a shown headline/description.
--   6. The owner's own "Me" entry never appears and can't be asked about.
--   7. Ask: "nothing_to_ask" when nothing is hidden; at most 2 asks about one entry and 5 to
--      one owner per day, counting withdrawn ones (no ask → cancel → ask email stream).
--
-- Rollback: re-run the knowledge_project_lens definition from 20261118300100 and the
-- knowledge_request_share definition from 20261118300000; DROP FUNCTION
-- public.knowledge_entity_visibility(uuid, uuid, uuid, uuid).

BEGIN;

SET LOCAL lock_timeout = '5s';

-- What p_viewer may see of p_owner's entry p_entity inside p_project. Server-only: called by
-- the SECURITY DEFINER lens and ask functions after they have checked the viewer.
--   level      shared | request | never | owner (knowledge_fact_share_level)
--   shown_via  'shared' (by the rules), 'grant' (a live grant covers it) or NULL (hidden)
CREATE OR REPLACE FUNCTION public.knowledge_entity_visibility(
	p_entity uuid,
	p_owner uuid,
	p_viewer uuid,
	p_project uuid
)
RETURNS TABLE (
	id uuid,
	predicate text,
	value_text text,
	qualifiers jsonb,
	object_name text,
	object_kind text,
	level text,
	shown_via text,
	source_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	WITH project_records AS (
		SELECT t.id FROM public.onto_tasks t WHERE t.project_id = p_project AND t.deleted_at IS NULL
		UNION ALL
		SELECT d.id FROM public.onto_documents d WHERE d.project_id = p_project AND d.deleted_at IS NULL
	),
	live_grants AS (
		SELECT s.what, s.predicates
		FROM public.knowledge_shares s
		WHERE s.entity_id = p_entity AND s.owner_user_id = p_owner
			AND public.knowledge_share_is_live(s.id, p_viewer)
	),
	facts AS (
		SELECT f.id, f.predicate, f.value_text, f.qualifiers, o.name AS object_name,
			o.kind AS object_kind,
			(f.created_via = 'enrichment' AND f.run_id IS NOT NULL) AS researched,
			public.knowledge_fact_share_level(
				f.predicate, e.kind, f.status, f.qualifiers,
				f.created_via = 'enrichment' AND f.run_id IS NOT NULL AND EXISTS (
					SELECT 1 FROM public.knowledge_fact_sources fs
					JOIN public.knowledge_sources src ON src.id = fs.source_id
					WHERE fs.fact_id = f.id AND src.source_type IN ('web', 'youtube') AND src.url IS NOT NULL
				),
				EXISTS (
					SELECT 1 FROM public.knowledge_fact_sources fs
					JOIN public.knowledge_sources src ON src.id = fs.source_id
					WHERE fs.fact_id = f.id AND src.source_type IN ('task', 'document')
						AND src.record_id IN (SELECT pr.id FROM project_records pr)
						AND EXISTS (
							SELECT 1 FROM public.knowledge_record_links l
							WHERE l.entity_id = p_entity AND l.owner_user_id = p_owner
								AND l.record_id = src.record_id
						)
				)
			) AS level
		FROM public.knowledge_facts f
		JOIN public.knowledge_entities e ON e.id = f.entity_id
		LEFT JOIN public.knowledge_entities o ON o.id = f.object_entity_id
		WHERE f.entity_id = p_entity AND f.owner_user_id = p_owner
			AND (o.id IS NULL OR NOT o.is_self)
	)
	SELECT f.id, f.predicate, f.value_text, f.qualifiers, f.object_name, f.object_kind, f.level,
		CASE
			WHEN f.level = 'shared' THEN 'shared'
			WHEN f.level = 'request' AND EXISTS (
				SELECT 1 FROM live_grants g
				WHERE g.what = 'all'
					OR (g.what = 'contact' AND f.predicate IN ('email', 'phone', 'address'))
					OR f.predicate = ANY (g.predicates)
			) THEN 'grant'
			ELSE NULL
		END AS shown_via,
		CASE WHEN f.researched THEN (
			SELECT src.url FROM public.knowledge_fact_sources fs
			JOIN public.knowledge_sources src ON src.id = fs.source_id
			WHERE fs.fact_id = f.id AND src.source_type IN ('web', 'youtube') AND src.url IS NOT NULL
			ORDER BY src.created_at
			LIMIT 1
		) END AS source_url
	FROM facts f
$$;

REVOKE ALL ON FUNCTION public.knowledge_entity_visibility(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_entity_visibility(uuid, uuid, uuid, uuid) TO service_role;

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
	records AS (
		SELECT t.id FROM public.onto_tasks t
		WHERE p_record_kind = 'task' AND t.id = ANY (p_record_ids[1:100])
			AND t.project_id = p_project AND t.deleted_at IS NULL
		UNION
		SELECT d.id FROM public.onto_documents d
		WHERE p_record_kind = 'document' AND d.id = ANY (p_record_ids[1:100])
			AND d.project_id = p_project AND d.deleted_at IS NULL
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
			AND NOT e.is_self
	),
	vis AS (
		SELECT en.entity_id, v.*
		FROM entries en
		CROSS JOIN LATERAL public.knowledge_entity_visibility(
			en.entity_id, en.owner_user_id, v_viewer, p_project
		) AS v
	),
	grants AS (
		SELECT DISTINCT ON (s.entity_id) s.entity_id, s.id, s.what, s.duration, s.expires_at
		FROM public.knowledge_shares s
		WHERE s.entity_id IN (SELECT entity_id FROM entries)
			AND public.knowledge_share_is_live(s.id, v_viewer)
		ORDER BY s.entity_id, (s.what = 'all') DESC, (s.duration = 'always') DESC,
			s.decided_at DESC NULLS LAST
	),
	asks AS (
		SELECT DISTINCT ON (s.entity_id) s.entity_id, s.id, s.status, s.created_at
		FROM public.knowledge_shares s
		WHERE s.entity_id IN (SELECT entity_id FROM entries)
			AND s.requested_by_user_id = v_viewer
			AND s.status IN ('requested', 'declined')
			AND (s.status <> 'requested' OR s.created_at > now() - interval '14 days')
		ORDER BY s.entity_id, s.created_at DESC
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
			'entity', jsonb_build_object(
				'id', en.entity_id, 'kind', en.kind, 'name', en.name,
				-- The owner's free-text summary only when it is a detail already shown.
				'summary', CASE WHEN EXISTS (
					SELECT 1 FROM vis v
					WHERE v.entity_id = en.entity_id AND v.shown_via IS NOT NULL
						AND v.predicate IN ('headline', 'description')
						AND lower(btrim(v.value_text)) = lower(btrim(en.summary))
				) THEN en.summary END
			),
			'record_ids', to_jsonb(en.record_ids),
			'quotes', to_jsonb(en.quotes[1:5]),
			'facts', coalesce((
				SELECT jsonb_agg(jsonb_build_object(
					'id', v.id, 'predicate', v.predicate, 'value', v.value_text,
					'object_name', v.object_name, 'object_kind', v.object_kind,
					'qualifiers', v.qualifiers, 'source_url', v.source_url,
					'via', v.shown_via
				) ORDER BY v.predicate)
				FROM vis v WHERE v.entity_id = en.entity_id AND v.shown_via IS NOT NULL
			), '[]'::jsonb),
			'hidden', jsonb_build_object(
				'contact', (SELECT count(*) FROM vis v WHERE v.entity_id = en.entity_id
					AND v.level = 'request' AND v.shown_via IS NULL
					AND v.predicate IN ('email', 'phone', 'address')),
				'other', (SELECT count(*) FROM vis v WHERE v.entity_id = en.entity_id
					AND v.level = 'request' AND v.shown_via IS NULL
					AND v.predicate NOT IN ('email', 'phone', 'address'))
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

CREATE OR REPLACE FUNCTION public.knowledge_request_share(
	p_entity uuid,
	p_project uuid,
	p_what text DEFAULT 'contact',
	p_viewer uuid DEFAULT NULL,
	p_via text DEFAULT 'web'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
	v_owner uuid;
	v_open public.knowledge_shares%ROWTYPE;
	v_id uuid;
	v_hidden_contact integer;
	v_hidden_all integer;
BEGIN
	IF p_what NOT IN ('contact', 'all') THEN
		RAISE EXCEPTION 'Ask for contact details or everything' USING ERRCODE = '22023';
	END IF;
	IF p_via NOT IN ('web', 'agent') THEN
		RAISE EXCEPTION 'Invalid via' USING ERRCODE = '22023';
	END IF;
	IF NOT v_viewer IN (SELECT public.knowledge_project_member_users(p_project)) THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	-- Only an entry another current member linked to this project's tasks or docs: you can ask
	-- about names you can see in the project, never probe arbitrary entries.
	SELECT e.owner_user_id INTO v_owner
	FROM public.knowledge_entities e
	WHERE e.id = p_entity AND e.scope = 'private' AND e.status = 'active'
		AND e.owner_user_id <> v_viewer AND NOT e.is_self
		AND e.owner_user_id IN (SELECT public.knowledge_project_member_users(p_project))
		AND EXISTS (
			SELECT 1 FROM public.knowledge_record_links l
			WHERE l.entity_id = e.id AND l.owner_user_id = e.owner_user_id
				AND (
					(l.record_kind = 'task' AND l.record_id IN (
						SELECT id FROM public.onto_tasks WHERE project_id = p_project AND deleted_at IS NULL))
					OR (l.record_kind = 'document' AND l.record_id IN (
						SELECT id FROM public.onto_documents WHERE project_id = p_project AND deleted_at IS NULL))
				)
		);
	IF v_owner IS NULL THEN
		RETURN jsonb_build_object('status', 'not_found');
	END IF;

	-- Nothing left to ask for (everything is already shown, or there is nothing private).
	SELECT
		count(*) FILTER (WHERE v.level = 'request' AND v.shown_via IS NULL
			AND v.predicate IN ('email', 'phone', 'address')),
		count(*) FILTER (WHERE v.level = 'request' AND v.shown_via IS NULL)
	INTO v_hidden_contact, v_hidden_all
	FROM public.knowledge_entity_visibility(p_entity, v_owner, v_viewer, p_project) AS v;
	IF (p_what = 'contact' AND v_hidden_contact = 0) OR (p_what = 'all' AND v_hidden_all = 0) THEN
		RETURN jsonb_build_object('status', CASE WHEN EXISTS (
			SELECT 1 FROM public.knowledge_shares s
			WHERE s.entity_id = p_entity AND public.knowledge_share_is_live(s.id, v_viewer)
		) THEN 'already_shared' ELSE 'nothing_to_ask' END);
	END IF;

	-- The owner said no in the last 30 days: stay quiet, don't nag.
	IF EXISTS (
		SELECT 1 FROM public.knowledge_shares s
		WHERE s.entity_id = p_entity AND s.requested_by_user_id = v_viewer
			AND s.status = 'declined' AND s.decided_at > now() - interval '30 days'
	) THEN
		RETURN jsonb_build_object('status', 'declined');
	END IF;

	-- Merge into the open ask (widening contact → all), or expire a stale one and start fresh.
	SELECT * INTO v_open FROM public.knowledge_shares s
	WHERE s.entity_id = p_entity AND s.requested_by_user_id = v_viewer AND s.status = 'requested'
	FOR UPDATE;
	IF FOUND AND v_open.created_at > now() - interval '14 days' THEN
		IF p_what = 'all' AND v_open.what <> 'all' THEN
			UPDATE public.knowledge_shares SET what = 'all', updated_at = now() WHERE id = v_open.id;
		END IF;
		RETURN jsonb_build_object('status', 'requested', 'id', v_open.id, 'merged', true);
	ELSIF FOUND THEN
		UPDATE public.knowledge_shares SET status = 'canceled', updated_at = now() WHERE id = v_open.id;
	END IF;

	-- Ask → cancel → ask can't become a stream of emails: at most 2 asks about one entry and 5
	-- to one owner per day, counting withdrawn ones.
	IF (SELECT count(*) FROM public.knowledge_shares s
		WHERE s.requested_by_user_id = v_viewer AND s.entity_id = p_entity
			AND s.created_at > now() - interval '1 day') >= 2
		OR (SELECT count(*) FROM public.knowledge_shares s
		WHERE s.requested_by_user_id = v_viewer AND s.owner_user_id = v_owner
			AND s.created_at > now() - interval '1 day') >= 5 THEN
		RETURN jsonb_build_object('status', 'rate_limited');
	END IF;

	-- Rate limit: 30 open asks per person.
	IF (SELECT count(*) FROM public.knowledge_shares s
		WHERE s.requested_by_user_id = v_viewer AND s.status = 'requested'
			AND s.created_at > now() - interval '14 days') >= 30 THEN
		RETURN jsonb_build_object('status', 'rate_limited');
	END IF;

	INSERT INTO public.knowledge_shares (
		owner_user_id, entity_id, project_id, grantee_user_id, requested_by_user_id,
		status, what, duration, via
	) VALUES (
		v_owner, p_entity, p_project, v_viewer, v_viewer, 'requested', p_what, 'membership', p_via
	) RETURNING id INTO v_id;
	RETURN jsonb_build_object('status', 'requested', 'id', v_id, 'merged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_request_share(uuid, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_request_share(uuid, uuid, text, uuid, text) TO authenticated, service_role;

COMMIT;
