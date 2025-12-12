-- supabase/migrations/20251212_get_project_full.sql
-- Migration: Optimized project loading function
-- Date: 2025-12-12
-- Description: Creates a single RPC that returns all project data in one database round-trip
--              Replaces 13+ separate queries with one optimized call
--              Note: FSM transitions removed - using simple enum states now (see FSM_SIMPLIFICATION_COMPLETE.md)

-- ============================================================================
-- DROP EXISTING FUNCTION IF EXISTS
-- ============================================================================

DROP FUNCTION IF EXISTS get_project_full(uuid, uuid);

-- ============================================================================
-- CREATE OPTIMIZED FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_project_full(
  p_project_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project jsonb;
  v_result jsonb;
BEGIN
  -- First verify the project exists and user has access
  SELECT to_jsonb(p.*)
  INTO v_project
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.created_by = p_actor_id;

  IF v_project IS NULL THEN
    -- Return null if project not found or user doesn't have access
    RETURN NULL;
  END IF;

  -- Build the complete result in a single query using subqueries
  SELECT jsonb_build_object(
    'project', v_project,

    'goals', COALESCE((
      SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created_at)
      FROM onto_goals g
      WHERE g.project_id = p_project_id
    ), '[]'::jsonb),

    'requirements', COALESCE((
      SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
      FROM onto_requirements r
      WHERE r.project_id = p_project_id
    ), '[]'::jsonb),

    'plans', COALESCE((
      SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created_at)
      FROM onto_plans pl
      WHERE pl.project_id = p_project_id
    ), '[]'::jsonb),

    'tasks', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(t.*) ||
        jsonb_build_object(
          'plan_id', e.dst_id,
          'plan', (
            SELECT to_jsonb(pl.*)
            FROM onto_plans pl
            WHERE pl.id = e.dst_id
          )
        )
        ORDER BY t.created_at
      )
      FROM onto_tasks t
      LEFT JOIN onto_edges e ON e.src_kind = 'task'
        AND e.src_id = t.id
        AND e.rel = 'belongs_to_plan'
        AND e.dst_kind = 'plan'
      WHERE t.project_id = p_project_id
    ), '[]'::jsonb),

    'outputs', COALESCE((
      SELECT jsonb_agg(to_jsonb(o.*) ORDER BY o.created_at)
      FROM onto_outputs o
      WHERE o.project_id = p_project_id
    ), '[]'::jsonb),

    'documents', COALESCE((
      SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created_at)
      FROM onto_documents d
      WHERE d.project_id = p_project_id
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
    ), '[]'::jsonb),

    'risks', COALESCE((
      SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
      FROM onto_risks r
      WHERE r.project_id = p_project_id
    ), '[]'::jsonb),

    'decisions', COALESCE((
      SELECT jsonb_agg(to_jsonb(dc.*) ORDER BY dc.decision_at)
      FROM onto_decisions dc
      WHERE dc.project_id = p_project_id
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
      LIMIT 1
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO service_role;

-- ============================================================================
-- ADD COMMENT
-- ============================================================================

COMMENT ON FUNCTION get_project_full(uuid, uuid) IS
  'Optimized function that returns all project data in a single database call. '
  'Includes project, all related entities (goals, plans, tasks, etc.), and context document. '
  'Returns NULL if project not found or user lacks access.';

-- ============================================================================
-- VERIFICATION (commented out, for manual testing)
-- ============================================================================

-- Test with a project:
-- SELECT get_project_full('project-uuid', 'actor-uuid');

DO $$
BEGIN
  RAISE NOTICE 'get_project_full function created successfully';
  RAISE NOTICE 'This single RPC replaces 13+ separate database queries';
END$$;
