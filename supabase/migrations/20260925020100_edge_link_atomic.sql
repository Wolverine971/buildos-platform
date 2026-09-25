-- supabase/migrations/20260925020100_edge_link_atomic.sql
-- Tasker 105: one-round-trip, duplicate-proof edge link for the gateway.
--
-- link_onto_entities (and the gateway's other createEdge callers) checked for
-- an existing edge and then inserted it as two requests, and onto_edges has no
-- unique key on (project, src, rel, dst). Two identical links at once both
-- insert: a local probe on production's schema made 5 edges from 5 identical
-- concurrent links. The chat worker runs links one at a time for that reason.
--
-- This function takes the project lock first (onto_lock_project_for_write,
-- 20260925020000), then checks and inserts in one transaction, so identical
-- links and relationship plans in the same project serialize for a few
-- milliseconds instead of duplicating. A unique index was the alternative; it
-- was not chosen because about 16 other edge writers insert without
-- ON CONFLICT, including the task-create RPC, and a race with any of them would
-- turn a would-be duplicate into a failed write. Production had no duplicate
-- edges on 2026-09-25 (read-only check), so nothing needs cleaning up.
--
-- Callers still validate the edge (kinds, direction, both entities in the
-- project) before calling; this only makes the write idempotent. Server only.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.onto_edge_link_atomic(
	p_project_id uuid,
	p_src_kind text,
	p_src_id uuid,
	p_rel text,
	p_dst_kind text,
	p_dst_id uuid,
	p_props jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
	v_edge public.onto_edges;
BEGIN
	IF p_project_id IS NULL
		OR nullif(p_src_kind, '') IS NULL
		OR p_src_id IS NULL
		OR nullif(p_rel, '') IS NULL
		OR nullif(p_dst_kind, '') IS NULL
		OR p_dst_id IS NULL
		OR jsonb_typeof(coalesce(p_props, '{}'::jsonb)) <> 'object' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'edge_link_invalid_arguments';
	END IF;

	IF NOT public.onto_lock_project_for_write(p_project_id) THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'edge_link_project_not_found';
	END IF;

	SELECT edge.* INTO v_edge
	FROM public.onto_edges AS edge
	WHERE edge.project_id = p_project_id
		AND edge.src_kind = p_src_kind
		AND edge.src_id = p_src_id
		AND edge.rel = p_rel
		AND edge.dst_kind = p_dst_kind
		AND edge.dst_id = p_dst_id
	ORDER BY edge.created_at, edge.id
	LIMIT 1;

	IF FOUND THEN
		RETURN jsonb_build_object('created', false, 'edge', to_jsonb(v_edge));
	END IF;

	INSERT INTO public.onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id, props)
	VALUES (p_project_id, p_src_kind, p_src_id, p_rel, p_dst_kind, p_dst_id, coalesce(p_props, '{}'::jsonb))
	RETURNING * INTO v_edge;

	RETURN jsonb_build_object('created', true, 'edge', to_jsonb(v_edge));
END;
$$;

REVOKE ALL ON FUNCTION public.onto_edge_link_atomic(uuid, text, uuid, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_edge_link_atomic(uuid, text, uuid, text, text, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.onto_edge_link_atomic(uuid, text, uuid, text, text, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.onto_edge_link_atomic(uuid, text, uuid, text, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.onto_edge_link_atomic(uuid, text, uuid, text, text, uuid, jsonb) IS
	'Returns the existing edge or inserts it, under the project write lock, so concurrent identical links cannot duplicate (Tasker 105). Server only; callers validate the edge first.';

COMMIT;
