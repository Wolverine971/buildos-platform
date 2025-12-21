-- supabase/migrations/20251221_soft_delete_onto_projects.sql
-- Migration: Soft Delete for Ontology Projects
-- Description: Adds deleted_at column to onto_projects and creates soft delete function
-- Date: 2025-12-21

-- ============================================================================
-- 1. ADD deleted_at COLUMN TO onto_projects
-- ============================================================================

ALTER TABLE onto_projects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN onto_projects.deleted_at IS 'Soft delete timestamp - null means active';

-- ============================================================================
-- 2. CREATE PARTIAL INDEX FOR PERFORMANCE
-- ============================================================================

-- Partial index to efficiently query only active projects
CREATE INDEX IF NOT EXISTS idx_onto_projects_deleted_at
  ON onto_projects(deleted_at)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. CREATE SOFT DELETE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION soft_delete_onto_project(p_project_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project ID required';
  END IF;

  -- Soft delete all child entities that support soft delete
  -- Note: Not all child tables have deleted_at columns, so we only update those that do

  -- Soft delete tasks
  UPDATE onto_tasks
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete plans
  UPDATE onto_plans
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete goals
  UPDATE onto_goals
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete documents
  UPDATE onto_documents
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete outputs
  UPDATE onto_outputs
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete milestones
  UPDATE onto_milestones
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete risks
  UPDATE onto_risks
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete decisions
  UPDATE onto_decisions
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete events
  UPDATE onto_events
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete requirements (if it has deleted_at)
  UPDATE onto_requirements
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Finally soft delete the project
  UPDATE onto_projects
  SET deleted_at = v_now, updated_at = v_now
  WHERE id = p_project_id AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION soft_delete_onto_project(UUID) IS
  'Soft deletes a project and all related ontology entities by setting deleted_at timestamp.';

GRANT EXECUTE ON FUNCTION soft_delete_onto_project(UUID) TO authenticated;

-- ============================================================================
-- 4. CREATE RESTORE PROJECT FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_onto_project(p_project_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project ID required';
  END IF;

  -- Restore all child entities
  UPDATE onto_tasks
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_plans
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_goals
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_documents
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_outputs
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_milestones
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_risks
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_decisions
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_events
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  UPDATE onto_requirements
  SET deleted_at = NULL, updated_at = now()
  WHERE project_id = p_project_id AND deleted_at IS NOT NULL;

  -- Finally restore the project
  UPDATE onto_projects
  SET deleted_at = NULL, updated_at = now()
  WHERE id = p_project_id AND deleted_at IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION restore_onto_project(UUID) IS
  'Restores a soft-deleted project and all related ontology entities.';

GRANT EXECUTE ON FUNCTION restore_onto_project(UUID) TO authenticated;

-- ============================================================================
-- 5. UPDATE RLS POLICIES TO EXCLUDE DELETED PROJECTS (optional optimization)
-- ============================================================================

-- Note: Applications should filter deleted_at IS NULL in queries, but having
-- an RLS policy can provide an additional safety net. Uncomment if desired:

-- DROP POLICY IF EXISTS "Users can view own onto_projects" ON onto_projects;
-- CREATE POLICY "Users can view own onto_projects"
--   ON onto_projects FOR SELECT
--   USING (
--     created_by = (SELECT id FROM onto_actors WHERE user_id = auth.uid())
--     AND deleted_at IS NULL
--   );

-- ============================================================================
-- 6. UPDATE get_project_skeleton TO FILTER SOFT-DELETED PROJECTS
-- ============================================================================

DROP FUNCTION IF EXISTS get_project_skeleton(uuid, uuid);

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
    -- Filter out soft-deleted entities
    'task_count', (SELECT count(*) FROM onto_tasks WHERE project_id = p.id AND deleted_at IS NULL),
    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id AND deleted_at IS NULL),
    'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id AND deleted_at IS NULL),
    'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id AND deleted_at IS NULL),
    'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id AND deleted_at IS NULL),
    'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id AND deleted_at IS NULL),
    'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id AND deleted_at IS NULL)
  )
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.created_by = p_actor_id
    AND p.deleted_at IS NULL;  -- Exclude soft-deleted projects
$$;

GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO service_role;

COMMENT ON FUNCTION get_project_skeleton(uuid, uuid) IS
  'Fast function that returns minimal project data for skeleton rendering. '
  'Includes project metadata (name, state, next_step) and entity counts. '
  'Filters out soft-deleted projects and entities. '
  'Designed for sub-50ms response to enable instant page load. '
  'Returns NULL if project not found, user lacks access, or project is deleted.';

-- ============================================================================
-- 7. UPDATE get_project_full TO FILTER SOFT-DELETED PROJECTS AND ENTITIES
-- ============================================================================

DROP FUNCTION IF EXISTS get_project_full(uuid, uuid);

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
  -- First verify the project exists, user has access, and project is not deleted
  SELECT to_jsonb(p.*)
  INTO v_project
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.created_by = p_actor_id
    AND p.deleted_at IS NULL;  -- Exclude soft-deleted projects

  IF v_project IS NULL THEN
    -- Return null if project not found, user doesn't have access, or deleted
    RETURN NULL;
  END IF;

  -- Build the complete result in a single query using subqueries
  -- All entities filter out soft-deleted records
  SELECT jsonb_build_object(
    'project', v_project,

    'goals', COALESCE((
      SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created_at)
      FROM onto_goals g
      WHERE g.project_id = p_project_id AND g.deleted_at IS NULL
    ), '[]'::jsonb),

    'requirements', COALESCE((
      SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
      FROM onto_requirements r
      WHERE r.project_id = p_project_id AND r.deleted_at IS NULL
    ), '[]'::jsonb),

    'plans', COALESCE((
      SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created_at)
      FROM onto_plans pl
      WHERE pl.project_id = p_project_id AND pl.deleted_at IS NULL
    ), '[]'::jsonb),

    'tasks', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(t.*) ||
        jsonb_build_object(
          'plan_id', e.dst_id,
          'plan', (
            SELECT to_jsonb(pl.*)
            FROM onto_plans pl
            WHERE pl.id = e.dst_id AND pl.deleted_at IS NULL
          )
        )
        ORDER BY t.created_at
      )
      FROM onto_tasks t
      LEFT JOIN onto_edges e ON e.src_kind = 'task'
        AND e.src_id = t.id
        AND e.rel = 'belongs_to_plan'
        AND e.dst_kind = 'plan'
      WHERE t.project_id = p_project_id AND t.deleted_at IS NULL
    ), '[]'::jsonb),

    'outputs', COALESCE((
      SELECT jsonb_agg(to_jsonb(o.*) ORDER BY o.created_at)
      FROM onto_outputs o
      WHERE o.project_id = p_project_id AND o.deleted_at IS NULL
    ), '[]'::jsonb),

    'documents', COALESCE((
      SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created_at)
      FROM onto_documents d
      WHERE d.project_id = p_project_id AND d.deleted_at IS NULL
    ), '[]'::jsonb),

    'sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.created_at)
      FROM onto_sources s
      WHERE s.project_id = p_project_id
    ), '[]'::jsonb),

    'milestones', COALESCE((
      SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.due_at)
      FROM onto_milestones m
      WHERE m.project_id = p_project_id AND m.deleted_at IS NULL
    ), '[]'::jsonb),

    'risks', COALESCE((
      SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
      FROM onto_risks r
      WHERE r.project_id = p_project_id AND r.deleted_at IS NULL
    ), '[]'::jsonb),

    'decisions', COALESCE((
      SELECT jsonb_agg(to_jsonb(dc.*) ORDER BY dc.decision_at)
      FROM onto_decisions dc
      WHERE dc.project_id = p_project_id AND dc.deleted_at IS NULL
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
$$;

GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO service_role;

COMMENT ON FUNCTION get_project_full(uuid, uuid) IS
  'Optimized function that returns all project data in a single database call. '
  'Includes project, all related entities (goals, plans, tasks, etc.), and context document. '
  'Filters out soft-deleted projects and entities. '
  'Returns NULL if project not found, user lacks access, or project is deleted.';
