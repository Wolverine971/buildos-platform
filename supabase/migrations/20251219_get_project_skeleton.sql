-- supabase/migrations/20251219_get_project_skeleton.sql
-- Migration: Fast project skeleton loading function
-- Date: 2025-12-19
-- Description: Creates a lightweight RPC that returns project metadata and counts
--              for instant skeleton rendering during cold page loads.
--              Designed for sub-50ms response time.

-- ============================================================================
-- DROP EXISTING FUNCTION IF EXISTS
-- ============================================================================

DROP FUNCTION IF EXISTS get_project_skeleton(uuid, uuid);

-- ============================================================================
-- CREATE SKELETON FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_project_skeleton(
  p_project_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'state_key', p.state_key,
    'type_key', p.type_key,
    'next_step_short', p.next_step_short,
    'next_step_long', p.next_step_long,
    'next_step_source', p.next_step_source,
    'next_step_updated_at', p.next_step_updated_at,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    -- Entity counts using scalar subqueries (leverages existing indexes)
    'task_count', (SELECT count(*) FROM onto_tasks WHERE project_id = p.id),
    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id),
    'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id),
    'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id),
    'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id),
    'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id),
    'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id)
  )
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.created_by = p_actor_id;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO service_role;

-- ============================================================================
-- ADD COMMENT
-- ============================================================================

COMMENT ON FUNCTION get_project_skeleton(uuid, uuid) IS
  'Fast function that returns minimal project data for skeleton rendering. '
  'Includes project metadata (name, state, next_step) and entity counts. '
  'Designed for sub-50ms response to enable instant page load. '
  'Returns NULL if project not found or user lacks access.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'get_project_skeleton function created successfully';
  RAISE NOTICE 'This lightweight RPC enables instant skeleton rendering during cold loads';
END$$;
