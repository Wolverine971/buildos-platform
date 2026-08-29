-- packages/shared-types/src/functions/onto_search_semantic.sql
-- Source of truth for the semantic (pgvector) discovery search RPC used by explore_project.
-- Mirrors supabase/migrations/20260828120000_semantic_discovery_embeddings.sql — update both together.

CREATE OR REPLACE FUNCTION public.onto_search_semantic(
	p_actor_id uuid,
	p_query_embedding vector(1536),
	p_project_id uuid DEFAULT NULL,
	p_types text[] DEFAULT NULL,
	p_limit integer DEFAULT 20,
	p_min_similarity double precision DEFAULT 0.15
)
RETURNS TABLE(
	type text,
	id uuid,
	project_id uuid,
	project_name text,
	title text,
	snippet text,
	score double precision,
	state_key text,
	type_key text,
	chunk_anchor text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
	v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
	v_claims_text text;
	v_jwt_role text;
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

	-- The HNSW index scan returns candidates in distance order; widen its
	-- horizon so membership/type filters applied after the scan cannot starve
	-- results.
	PERFORM set_config('hnsw.ef_search', '200', true);

	RETURN QUERY
	WITH accessible AS (
		SELECT p.id AS accessible_project_id, p.name AS accessible_project_name
		FROM public.onto_projects p
		WHERE p.deleted_at IS NULL
			AND (p_project_id IS NULL OR p.id = p_project_id)
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
			)
	),
	candidates AS (
		SELECT
			e.entity_type,
			e.entity_id,
			e.project_id AS candidate_project_id,
			e.chunk_anchor,
			e.content_text,
			1 - (e.embedding <=> p_query_embedding) AS similarity
		FROM public.onto_embeddings e
		ORDER BY e.embedding <=> p_query_embedding
		LIMIT 400
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
		JOIN public.onto_tasks t ON t.id = m.entity_id AND t.deleted_at IS NULL
		WHERE m.entity_type = 'task'

		UNION ALL

		SELECT
			'goal', g.id, g.project_id, m.accessible_project_name, g.name,
			left(m.content_text, 280), m.similarity,
			g.state_key::text, g.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_goals g ON g.id = m.entity_id AND g.deleted_at IS NULL
		WHERE m.entity_type = 'goal'

		UNION ALL

		SELECT
			'plan', pl.id, pl.project_id, m.accessible_project_name, pl.name,
			left(m.content_text, 280), m.similarity,
			pl.state_key::text, pl.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_plans pl ON pl.id = m.entity_id AND pl.deleted_at IS NULL
		WHERE m.entity_type = 'plan'

		UNION ALL

		SELECT
			'milestone', ms.id, ms.project_id, m.accessible_project_name, ms.title,
			left(m.content_text, 280), m.similarity,
			ms.state_key::text, ms.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_milestones ms ON ms.id = m.entity_id AND ms.deleted_at IS NULL
		WHERE m.entity_type = 'milestone'

		UNION ALL

		SELECT
			'document', d.id, d.project_id, m.accessible_project_name, d.title,
			left(m.content_text, 280), m.similarity,
			d.state_key::text, d.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_documents d ON d.id = m.entity_id AND d.deleted_at IS NULL
		WHERE m.entity_type = 'document'

		UNION ALL

		SELECT
			'risk', rk.id, rk.project_id, m.accessible_project_name, rk.title,
			left(m.content_text, 280), m.similarity,
			rk.state_key::text, rk.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_risks rk ON rk.id = m.entity_id AND rk.deleted_at IS NULL
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

REVOKE ALL ON FUNCTION public.onto_search_semantic(uuid, vector, uuid, text[], integer, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_search_semantic(uuid, vector, uuid, text[], integer, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_search_semantic(uuid, vector, uuid, text[], integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_search_semantic(uuid, vector, uuid, text[], integer, double precision) TO service_role;

