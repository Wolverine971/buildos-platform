-- supabase/migrations/20260828120000_semantic_discovery_embeddings.sql
--
-- Semantic discovery search, phase 1 infrastructure
-- (docs/architecture/semantic-discovery/README.md, tasker/71).
--
-- 1. `onto_embeddings`: one embeddings table for every ontology entity type
--    (documents chunked), HNSW cosine index, RLS read via project membership,
--    writes reserved to the service-role pipeline.
-- 2. `embed_onto_entity` queue type + AFTER INSERT/UPDATE/DELETE triggers on the
--    ten source tables. Triggers enqueue through add_queue_job with a
--    content-digest dedup key so repeated saves of identical text collapse and
--    the queue stays quiet on non-text updates. A trigger failure must never
--    break the underlying write: the body is wrapped and demoted to a WARNING.
-- 3. `onto_search_semantic`: cosine KNN over onto_embeddings joined back to the
--    live entity tables. Access is scoped by project membership
--    (owner OR active onto_project_members row) — deliberately NOT the
--    created_by-only scoping onto_search_entities still has. Caller identity is
--    guarded with the same JWT-role pattern as 20260825181727.
--
-- The legacy vector stack (onto_document_versions.embedding,
-- profile_document_embeddings, search_similar_items) targets pre-ontology
-- tables and stays untouched; it is scheduled for separate cleanup.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'embed_onto_entity';

-- ============================================================================
-- 1. EMBEDDINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.onto_embeddings (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_type text NOT NULL,
	entity_id uuid NOT NULL,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	chunk_index integer NOT NULL DEFAULT 0,
	chunk_anchor text,
	content_hash text NOT NULL,
	content_text text NOT NULL,
	embedding vector(1536) NOT NULL,
	embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
	updated_at timestamptz NOT NULL DEFAULT now(),

	CONSTRAINT chk_onto_embeddings_entity_type CHECK (
		entity_type IN (
			'project', 'task', 'goal', 'plan', 'milestone',
			'document', 'risk', 'requirement', 'event', 'image'
		)
	),
	CONSTRAINT unique_onto_embedding_chunk UNIQUE (entity_type, entity_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_onto_embeddings_embedding_hnsw
	ON public.onto_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_onto_embeddings_project
	ON public.onto_embeddings(project_id);
CREATE INDEX IF NOT EXISTS idx_onto_embeddings_entity
	ON public.onto_embeddings(entity_type, entity_id);

ALTER TABLE public.onto_embeddings ENABLE ROW LEVEL SECURITY;

-- Reads follow project membership; the RPC below is the intended path but a
-- direct RLS-gated select must not leak other projects either. Writes have no
-- policy on purpose: only the service-role worker pipeline mutates embeddings.
DROP POLICY IF EXISTS "onto_embeddings_member_read" ON public.onto_embeddings;
CREATE POLICY "onto_embeddings_member_read" ON public.onto_embeddings
	FOR SELECT TO authenticated
	USING (public.current_actor_has_project_member_access(project_id, 'read'));

REVOKE ALL ON TABLE public.onto_embeddings FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.onto_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onto_embeddings TO service_role;

-- ============================================================================
-- 2. WRITE-PATH ENQUEUE TRIGGERS
-- ============================================================================

-- Generic AFTER trigger: TG_ARGV[0] = search entity type, TG_ARGV[1..] = the
-- text columns whose changes require re-embedding. Fires for every writer (web
-- routes, agent gateway, worker, braindumps) so the pipeline cannot drift out
-- of sync with new app write paths.
CREATE OR REPLACE FUNCTION public.enqueue_onto_entity_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
	v_entity_type text := TG_ARGV[0];
	v_fields text[] := TG_ARGV[1:TG_NARGS - 1];
	v_row jsonb;
	v_old jsonb;
	v_digest text;
	v_old_digest text;
	v_deleted boolean;
	v_was_deleted boolean;
	v_project_id uuid;
	v_user_id uuid;
BEGIN
	IF TG_OP = 'DELETE' THEN
		v_row := to_jsonb(OLD);
		v_deleted := true;
	ELSE
		v_row := to_jsonb(NEW);
		v_deleted := (v_row ->> 'deleted_at') IS NOT NULL;
	END IF;

	SELECT md5(string_agg(coalesce(v_row ->> f, ''), chr(31) ORDER BY ord))
	INTO v_digest
	FROM unnest(v_fields) WITH ORDINALITY AS t(f, ord);

	IF TG_OP = 'UPDATE' THEN
		v_old := to_jsonb(OLD);
		v_was_deleted := (v_old ->> 'deleted_at') IS NOT NULL;
		SELECT md5(string_agg(coalesce(v_old ->> f, ''), chr(31) ORDER BY ord))
		INTO v_old_digest
		FROM unnest(v_fields) WITH ORDINALITY AS t(f, ord);
		IF v_digest = v_old_digest AND v_deleted = v_was_deleted THEN
			RETURN NULL;
		END IF;
	END IF;

	v_project_id := coalesce(
		nullif(v_row ->> 'project_id', '')::uuid,
		CASE WHEN v_entity_type = 'project' THEN (v_row ->> 'id')::uuid END
	);
	IF v_project_id IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT a.user_id INTO v_user_id
	FROM public.onto_actors a
	WHERE a.id = nullif(v_row ->> 'created_by', '')::uuid;
	IF v_user_id IS NULL THEN
		SELECT a.user_id INTO v_user_id
		FROM public.onto_projects p
		JOIN public.onto_actors a ON a.id = p.created_by
		WHERE p.id = v_project_id;
	END IF;
	IF v_user_id IS NULL THEN
		RETURN NULL;
	END IF;

	PERFORM public.add_queue_job(
		v_user_id,
		'embed_onto_entity',
		jsonb_build_object(
			'entityType', v_entity_type,
			'entityId', v_row ->> 'id',
			'projectId', v_project_id,
			'userId', v_user_id,
			'deleted', v_deleted
		),
		10,
		now(),
		'embed_onto_entity:' || v_entity_type || ':' || (v_row ->> 'id') || ':'
			|| CASE WHEN v_deleted THEN 'deleted' ELSE coalesce(v_digest, '') END
	);

	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	-- Embedding freshness is best-effort; the entity write must always win.
	RAISE WARNING 'enqueue_onto_entity_embedding failed for % %: %',
		v_entity_type, v_row ->> 'id', SQLERRM;
	RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_onto_projects_embedding ON public.onto_projects;
CREATE TRIGGER trg_onto_projects_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_projects
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'project', 'name', 'description', 'next_step_short', 'next_step_long');

DROP TRIGGER IF EXISTS trg_onto_tasks_embedding ON public.onto_tasks;
CREATE TRIGGER trg_onto_tasks_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_tasks
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'task', 'title', 'description');

DROP TRIGGER IF EXISTS trg_onto_goals_embedding ON public.onto_goals;
CREATE TRIGGER trg_onto_goals_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_goals
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'goal', 'name', 'description', 'goal');

DROP TRIGGER IF EXISTS trg_onto_plans_embedding ON public.onto_plans;
CREATE TRIGGER trg_onto_plans_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_plans
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'plan', 'name', 'description', 'plan');

DROP TRIGGER IF EXISTS trg_onto_milestones_embedding ON public.onto_milestones;
CREATE TRIGGER trg_onto_milestones_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_milestones
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'milestone', 'title', 'description', 'milestone');

DROP TRIGGER IF EXISTS trg_onto_documents_embedding ON public.onto_documents;
CREATE TRIGGER trg_onto_documents_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_documents
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'document', 'title', 'description', 'content');

DROP TRIGGER IF EXISTS trg_onto_risks_embedding ON public.onto_risks;
CREATE TRIGGER trg_onto_risks_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_risks
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'risk', 'title', 'content');

DROP TRIGGER IF EXISTS trg_onto_requirements_embedding ON public.onto_requirements;
CREATE TRIGGER trg_onto_requirements_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_requirements
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'requirement', 'text');

DROP TRIGGER IF EXISTS trg_onto_events_embedding ON public.onto_events;
CREATE TRIGGER trg_onto_events_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_events
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'event', 'title', 'description', 'location');

DROP TRIGGER IF EXISTS trg_onto_assets_embedding ON public.onto_assets;
CREATE TRIGGER trg_onto_assets_embedding
	AFTER INSERT OR UPDATE OR DELETE ON public.onto_assets
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding(
		'image', 'caption', 'alt_text', 'extraction_summary', 'extracted_text');

-- ============================================================================
-- 3. SEMANTIC SEARCH RPC
-- ============================================================================

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

COMMENT ON FUNCTION public.onto_search_semantic(uuid, vector, uuid, text[], integer, double precision) IS
	'Semantic (pgvector cosine) discovery search over onto_embeddings, scoped by project membership. Query embeddings are produced app-side with text-embedding-3-small (1536 dims).';
