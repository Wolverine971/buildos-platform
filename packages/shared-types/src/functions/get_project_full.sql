-- packages/shared-types/src/functions/get_project_full.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_project_full(p_project_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_project jsonb;
  v_result jsonb;
BEGIN
  IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
    RETURN NULL;
  END IF;

  -- Verify the project exists (exclude soft-deleted projects)
  SELECT to_jsonb(p.*)
  INTO v_project
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.deleted_at IS NULL;

  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'project', v_project,

    'goals', COALESCE((
      SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created_at)
      FROM onto_goals g
      WHERE g.project_id = p_project_id
        AND g.deleted_at IS NULL
    ), '[]'::jsonb),

    'requirements', COALESCE((
      SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
      FROM onto_requirements r
      WHERE r.project_id = p_project_id
        AND r.deleted_at IS NULL
    ), '[]'::jsonb),

    'plans', COALESCE((
      SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created_at)
      FROM onto_plans pl
      WHERE pl.project_id = p_project_id
        AND pl.deleted_at IS NULL
    ), '[]'::jsonb),

    'tasks', COALESCE((
      SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.created_at)
      FROM onto_tasks t
      WHERE t.project_id = p_project_id
        AND t.deleted_at IS NULL
    ), '[]'::jsonb),

    'outputs', COALESCE((
      SELECT jsonb_agg(to_jsonb(o.*) ORDER BY o.created_at)
      FROM onto_outputs o
      WHERE o.project_id = p_project_id
        AND o.deleted_at IS NULL
    ), '[]'::jsonb),

    'documents', COALESCE((
      SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created_at)
      FROM onto_documents d
      WHERE d.project_id = p_project_id
        AND d.deleted_at IS NULL
    ), '[]'::jsonb),

    'sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.created_at)
      FROM onto_sources s
      WHERE s.project_id = p_project_id
    ), '[]'::jsonb),

    'milestones', COALESCE((
      SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.due_at)
      FROM onto_milestones m
      WHERE m.project_id = p_project_id
        AND m.deleted_at IS NULL
    ), '[]'::jsonb),

    'risks', COALESCE((
      SELECT jsonb_agg(to_jsonb(rk.*) ORDER BY rk.created_at)
      FROM onto_risks rk
      WHERE rk.project_id = p_project_id
        AND rk.deleted_at IS NULL
    ), '[]'::jsonb),

    'decisions', COALESCE((
      SELECT jsonb_agg(to_jsonb(dc.*) ORDER BY dc.decision_at)
      FROM onto_decisions dc
      WHERE dc.project_id = p_project_id
        AND dc.deleted_at IS NULL
    ), '[]'::jsonb),

    'metrics', COALESCE((
      SELECT jsonb_agg(to_jsonb(mt.*) ORDER BY mt.created_at)
      FROM onto_metrics mt
      WHERE mt.project_id = p_project_id
    ), '[]'::jsonb),

    'context_document', (
      SELECT to_jsonb(d.*)
      FROM onto_edges e
      JOIN onto_documents d ON d.id = e.dst_id
      WHERE e.src_kind = 'project'
        AND e.src_id = p_project_id
        AND e.rel = 'has_context_document'
        AND e.dst_kind = 'document'
        AND d.deleted_at IS NULL
      LIMIT 1
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$
