-- supabase/migrations/20260529000000_deprecate_direct_project_edges.sql
-- Project membership is represented by each ontology entity's project_id column.
-- Direct project membership edges made the graph noisy and are now deprecated.
-- Keep non-project ontology edges intact; this only removes project endpoint
-- containment/document/source relationships.

-- Preserve the existing payload contract while moving the context document lookup
-- off project -> has_context_document edges. The previous function body is kept
-- under a legacy name and wrapped so the rest of the payload stays identical.
ALTER FUNCTION public.get_project_full(uuid, uuid)
RENAME TO get_project_full_with_project_edge_context;

REVOKE EXECUTE ON FUNCTION public.get_project_full_with_project_edge_context(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_project_full(p_project_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
	v_result jsonb;
	v_context_document jsonb;
BEGIN
	v_result := public.get_project_full_with_project_edge_context(p_project_id, p_actor_id);

	IF v_result IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT to_jsonb(d)
	INTO v_context_document
	FROM (
		SELECT
			d.archived_at,
			d.children,
			d.content,
			d.content IS NOT NULL AND length(btrim(d.content)) > 0 AS has_content,
			d.created_at,
			d.created_by,
			d.deleted_at,
			d.description,
			d.id,
			d.project_id,
			d.props,
			d.state_key,
			d.title,
			d.type_key,
			d.updated_at
		FROM public.onto_documents d
		WHERE d.project_id = p_project_id
			AND d.type_key = 'document.context.project'
			AND d.deleted_at IS NULL
		ORDER BY d.updated_at DESC
		LIMIT 1
	) d;

	RETURN jsonb_set(
		v_result,
		'{context_document}',
		COALESCE(v_context_document, 'null'::jsonb),
		true
	);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_project_full(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_full(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_project_full(uuid, uuid) TO anon;

DELETE FROM public.onto_edges
WHERE (src_kind = 'project' OR dst_kind = 'project')
	AND rel IN (
		'project_contains',
		'contains',
		'part_of',
		'has_goal',
		'has_milestone',
		'has_plan',
		'has_task',
		'has_risk',
		'has_requirement',
		'has_metric',
		'has_document',
		'has_context_document',
		'has_source'
	);
