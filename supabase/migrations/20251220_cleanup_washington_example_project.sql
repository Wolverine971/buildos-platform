-- supabase/migrations/20251220_cleanup_washington_example_project.sql
-- ============================================
-- CLEANUP: Operation American Independence
-- ============================================
-- This migration removes all data from the previous version
-- of the Washington Revolutionary War example project.
-- Run this BEFORE the seed migration.
-- ============================================

-- Project ID for the Washington example project
-- This is the fixed UUID used across all entities
DO $$
DECLARE
  project_uuid UUID := '11111111-1111-1111-1111-111111111111';
BEGIN
  RAISE NOTICE 'Cleaning up previous Washington example project data...';
  RAISE NOTICE 'Project ID: %', project_uuid;

  -- Delete in order respecting foreign key constraints
  -- Graph edges first (references other entities)
  DELETE FROM onto_edges WHERE project_id = project_uuid;
  RAISE NOTICE 'Deleted onto_edges';

  -- Then leaf entities (tasks, documents, decisions, risks)
  DELETE FROM onto_tasks WHERE project_id = project_uuid;
  RAISE NOTICE 'Deleted onto_tasks';

  DELETE FROM onto_documents WHERE project_id = project_uuid;
  RAISE NOTICE 'Deleted onto_documents';

  DELETE FROM onto_decisions WHERE project_id = project_uuid;
  RAISE NOTICE 'Deleted onto_decisions';

  DELETE FROM onto_risks WHERE project_id = project_uuid;
  RAISE NOTICE 'Deleted onto_risks';

  -- Then plans
  DELETE FROM onto_plans WHERE project_id = project_uuid;
  RAISE NOTICE 'Deleted onto_plans';

  -- Then milestones
  DELETE FROM onto_milestones WHERE project_id = project_uuid;
  RAISE NOTICE 'Deleted onto_milestones';

  -- Then goals
  DELETE FROM onto_goals WHERE project_id = project_uuid;
  RAISE NOTICE 'Deleted onto_goals';

  -- Finally the project itself
  DELETE FROM projects WHERE id = project_uuid;
  RAISE NOTICE 'Deleted project';

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Cleanup complete. Ready for fresh seed migration.';
  RAISE NOTICE '==============================================';
END$$;
