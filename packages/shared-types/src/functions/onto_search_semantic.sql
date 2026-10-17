-- packages/shared-types/src/functions/onto_search_semantic.sql
-- Source of truth for the semantic (pgvector) discovery search RPC used by explore_project.
-- Mirrors the latest migration that replaces it (20261017180000_search_rpcs_project_scope.sql) — update both together.
-- That migration also creates the server-only large-scope helper it calls, mirrored first here.

CREATE OR REPLACE FUNCTION private.onto_search_semantic_index_candidates(
	p_query_embedding vector,
	p_project_ids uuid[],
	p_types text[],
	p_limit integer
)
 RETURNS TABLE(embedding_id uuid, distance double precision)
 LANGUAGE plpgsql
 VOLATILE
 SET search_path TO 'public', 'extensions', 'pg_temp'
 -- The only sort-free plan for this ORDER BY is the HNSW walk. Without this, a generic
 -- plan's row estimate for ANY(p_project_ids) picks "detoast every in-scope vector, then
 -- sort", which is the cost this path exists to avoid.
 SET enable_sort TO 'off'
AS $function$
DECLARE
	v_prev_ef_search text := coalesce(current_setting('hnsw.ef_search', true), '40');
	v_prev_iterative_scan text := coalesce(current_setting('hnsw.iterative_scan', true), 'off');
	v_prev_max_scan_tuples text := coalesce(current_setting('hnsw.max_scan_tuples', true), '20000');
BEGIN
	-- Iterative scan (pgvector >= 0.8): when the project/type filter rejects chunks, keep
	-- walking the graph instead of returning fewer than p_limit; max_scan_tuples bounds it.
	-- relaxed_order may return candidates slightly out of distance order; the caller
	-- re-ranks by similarity. Set at run time, not as function SET clauses: hosted roles
	-- may not attach extension (placeholder) parameters to a function definition.
	PERFORM set_config('hnsw.ef_search', '200', true);
	PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
	PERFORM set_config('hnsw.max_scan_tuples', '20000', true);
	RETURN QUERY
	SELECT e.id, e.embedding <=> p_query_embedding
	FROM public.onto_embeddings e
	WHERE e.project_id = ANY (p_project_ids)
		AND (p_types IS NULL OR e.entity_type = ANY (p_types))
	ORDER BY e.embedding <=> p_query_embedding
	LIMIT p_limit;
	-- Restore so the rest of the caller's transaction keeps its own settings.
	PERFORM set_config('hnsw.ef_search', v_prev_ef_search, true);
	PERFORM set_config('hnsw.iterative_scan', v_prev_iterative_scan, true);
	PERFORM set_config('hnsw.max_scan_tuples', v_prev_max_scan_tuples, true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.onto_search_semantic(p_actor_id uuid, p_query_embedding vector, p_project_id uuid DEFAULT NULL::uuid, p_types text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20, p_min_similarity double precision DEFAULT 0.15)
 RETURNS TABLE(type text, id uuid, project_id uuid, project_name text, title text, snippet text, score double precision, state_key text, type_key text, chunk_anchor text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
	v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
	v_claims_text text;
	v_jwt_role text;
	-- Ranked chunks handed to the live-record joins and similarity floor below. Same depth
	-- as before; it now counts only chunks the caller can read.
	v_candidate_limit constant integer := 400;
	-- Exact ranking reads every in-scope vector (~3.5 buffers each); the HNSW walk reads
	-- graph nodes until 400 in-scope chunks pass, ~3.1k buffers / selectivity on prod's
	-- 2026-10-17 data, and its 35 MB index is rarely cache-warm. Exact wins up to here.
	v_exact_scope_max_rows constant integer := 5000;
	v_project_ids uuid[];
	v_scope_rows integer;
	v_candidate_ids uuid[];
	v_candidate_distances double precision[];
BEGIN
	IF p_actor_id IS NULL OR p_query_embedding IS NULL THEN
		RETURN;
	END IF;

	-- Caller-identity guard, mirroring 20260825181727: service_role may search
	-- as any actor; an authenticated caller only as itself.
	v_claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
	IF v_claims_text IS NOT NULL THEN
		v_jwt_role := NULLIF((v_claims_text::jsonb) ->> 'role', '');
	END IF;
	v_jwt_role := COALESCE(
		v_jwt_role,
		NULLIF(current_setting('request.jwt.claim.role', true), '')
	);

	IF v_jwt_role = 'service_role' THEN
		NULL;
	ELSIF v_jwt_role = 'authenticated' THEN
		IF public.current_actor_id() IS NULL
			OR public.current_actor_id() IS DISTINCT FROM p_actor_id THEN
			RAISE EXCEPTION 'onto_search_semantic may only search as the authenticated actor'
				USING ERRCODE = '42501';
		END IF;
	ELSIF v_jwt_role IS NOT NULL THEN
		RAISE EXCEPTION 'onto_search_semantic requires authentication'
			USING ERRCODE = '42501';
	ELSIF session_user NOT IN ('postgres', 'supabase_admin') THEN
		RAISE EXCEPTION 'onto_search_semantic requires a trusted database session'
			USING ERRCODE = '42501';
	END IF;

	-- 1. Readable projects first: the accessible CTE's owner/member rule, plus the
	--    archived/merged project rule.
	SELECT coalesce(array_agg(p.id), ARRAY[]::uuid[])
	INTO v_project_ids
	FROM public.onto_projects p
	WHERE p.deleted_at IS NULL
		AND (p_project_id IS NULL OR p.id = p_project_id)
		-- Same archived/merged rule as onto_search_entities' accessible CTE.
		AND (p.archived_at IS NULL
			OR (p_project_id IS NOT NULL AND p.merged_into_project_id IS NULL))
		AND (
			p.created_by = p_actor_id
			OR EXISTS (
				SELECT 1
				FROM public.onto_project_members m
				WHERE m.project_id = p.id
					AND m.actor_id = p_actor_id
					AND m.removed_at IS NULL
					AND m.access IN ('read', 'write', 'admin')
			)
		);

	IF cardinality(v_project_ids) = 0 THEN
		RETURN;
	END IF;

	-- 2. Size the scope (index-only, stops counting past the exact-ranking limit).
	SELECT count(*)::integer
	INTO v_scope_rows
	FROM (
		SELECT 1
		FROM public.onto_embeddings e
		WHERE e.project_id = ANY (v_project_ids)
			AND (p_types IS NULL OR e.entity_type = ANY (p_types))
		LIMIT v_exact_scope_max_rows + 1
	) AS scope_rows;

	IF v_scope_rows = 0 THEN
		RETURN;
	END IF;

	-- 3. Nearest in-scope chunks.
	IF v_scope_rows <= v_exact_scope_max_rows THEN
		-- Exact: distance for every in-scope chunk, ordered outside the MATERIALIZED CTE so
		-- the planner cannot substitute the global HNSW index (whose ef_search horizon
		-- truncated filtered results, B12).
		WITH scoped AS MATERIALIZED (
			SELECT e.id AS embedding_id, e.embedding <=> p_query_embedding AS distance
			FROM public.onto_embeddings e
			WHERE e.project_id = ANY (v_project_ids)
				AND (p_types IS NULL OR e.entity_type = ANY (p_types))
		),
		nearest AS (
			SELECT s.embedding_id, s.distance
			FROM scoped s
			ORDER BY s.distance
			LIMIT v_candidate_limit
		)
		SELECT array_agg(n.embedding_id), array_agg(n.distance)
		INTO v_candidate_ids, v_candidate_distances
		FROM nearest n;
	ELSE
		SELECT array_agg(c.embedding_id), array_agg(c.distance)
		INTO v_candidate_ids, v_candidate_distances
		FROM private.onto_search_semantic_index_candidates(
			p_query_embedding, v_project_ids, p_types, v_candidate_limit
		) AS c;
	END IF;

	IF v_candidate_ids IS NULL THEN
		RETURN;
	END IF;

	-- 4. Unchanged from the live definition below the candidates CTE.
	RETURN QUERY
	WITH accessible AS (
		SELECT p.id AS accessible_project_id, p.name AS accessible_project_name
		FROM public.onto_projects p
		WHERE p.id = ANY (v_project_ids)
			AND p.deleted_at IS NULL
	),
	candidates AS (
		SELECT
			e.entity_type,
			e.entity_id,
			e.project_id AS candidate_project_id,
			e.chunk_anchor,
			e.content_text,
			1 - c.distance AS similarity
		FROM unnest(v_candidate_ids, v_candidate_distances) AS c(embedding_id, distance)
		JOIN public.onto_embeddings e ON e.id = c.embedding_id
	),
	matches AS (
		SELECT DISTINCT ON (c.entity_type, c.entity_id)
			c.entity_type,
			c.entity_id,
			c.candidate_project_id,
			a.accessible_project_name,
			c.chunk_anchor,
			c.content_text,
			c.similarity
		FROM candidates c
		JOIN accessible a ON a.accessible_project_id = c.candidate_project_id
		WHERE (p_types IS NULL OR c.entity_type = ANY (p_types))
			AND c.similarity >= coalesce(p_min_similarity, 0.15)
		ORDER BY c.entity_type, c.entity_id, c.similarity DESC
	)
	SELECT * FROM (
		SELECT
			'project'::text AS type, p.id, p.id AS project_id,
			m.accessible_project_name AS project_name, p.name AS title,
			left(m.content_text, 280) AS snippet, m.similarity AS score,
			p.state_key::text AS state_key, p.type_key::text AS type_key,
			m.chunk_anchor
		FROM matches m
		JOIN public.onto_projects p ON p.id = m.entity_id AND p.deleted_at IS NULL
		WHERE m.entity_type = 'project'

		UNION ALL

		SELECT
			'task', t.id, t.project_id, m.accessible_project_name, t.title,
			left(m.content_text, 280), m.similarity,
			t.state_key::text, t.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_tasks t ON t.id = m.entity_id AND t.deleted_at IS NULL AND t.archived_at IS NULL
		WHERE m.entity_type = 'task'

		UNION ALL

		SELECT
			'goal', g.id, g.project_id, m.accessible_project_name, g.name,
			left(m.content_text, 280), m.similarity,
			g.state_key::text, g.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_goals g ON g.id = m.entity_id AND g.deleted_at IS NULL AND g.archived_at IS NULL
		WHERE m.entity_type = 'goal'

		UNION ALL

		SELECT
			'plan', pl.id, pl.project_id, m.accessible_project_name, pl.name,
			left(m.content_text, 280), m.similarity,
			pl.state_key::text, pl.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_plans pl ON pl.id = m.entity_id AND pl.deleted_at IS NULL AND pl.archived_at IS NULL
		WHERE m.entity_type = 'plan'

		UNION ALL

		SELECT
			'milestone', ms.id, ms.project_id, m.accessible_project_name, ms.title,
			left(m.content_text, 280), m.similarity,
			ms.state_key::text, ms.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_milestones ms ON ms.id = m.entity_id AND ms.deleted_at IS NULL AND ms.archived_at IS NULL
		WHERE m.entity_type = 'milestone'

		UNION ALL

		SELECT
			'document', d.id, d.project_id, m.accessible_project_name, d.title,
			left(m.content_text, 280), m.similarity,
			d.state_key::text, d.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_documents d ON d.id = m.entity_id AND d.deleted_at IS NULL AND d.archived_at IS NULL
			AND COALESCE(d.state_key::text, '') <> 'archived'
		WHERE m.entity_type = 'document'

		UNION ALL

		SELECT
			'risk', rk.id, rk.project_id, m.accessible_project_name, rk.title,
			left(m.content_text, 280), m.similarity,
			rk.state_key::text, rk.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_risks rk ON rk.id = m.entity_id AND rk.deleted_at IS NULL AND rk.archived_at IS NULL
		WHERE m.entity_type = 'risk'

		UNION ALL

		SELECT
			'requirement', r.id, r.project_id, m.accessible_project_name, r."text",
			left(m.content_text, 280), m.similarity,
			NULL::text, r.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_requirements r ON r.id = m.entity_id AND r.deleted_at IS NULL
		WHERE m.entity_type = 'requirement'

		UNION ALL

		SELECT
			'event', ev.id, ev.project_id, m.accessible_project_name, ev.title,
			left(m.content_text, 280), m.similarity,
			ev.state_key::text, ev.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_events ev ON ev.id = m.entity_id AND ev.deleted_at IS NULL
			AND NOT EXISTS (
			  SELECT 1 FROM onto_tasks owner_task
			  WHERE ev.owner_entity_type = 'task'
			    AND owner_task.id = ev.owner_entity_id
			    AND (owner_task.deleted_at IS NOT NULL OR owner_task.archived_at IS NOT NULL)
			)
		WHERE m.entity_type = 'event'

		UNION ALL

		SELECT
			'image', a.id, a.project_id, m.accessible_project_name,
			coalesce(a.caption, a.alt_text, a.original_filename, 'Image'),
			left(m.content_text, 280), m.similarity,
			a.ocr_status::text, a.kind::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_assets a ON a.id = m.entity_id AND a.deleted_at IS NULL
		WHERE m.entity_type = 'image'
	) AS results
	ORDER BY results.score DESC, results.title ASC NULLS LAST
	LIMIT v_limit;
END;
$function$;
