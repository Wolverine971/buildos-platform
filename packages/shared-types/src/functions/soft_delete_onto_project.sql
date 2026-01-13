-- packages/shared-types/src/functions/soft_delete_onto_project.sql
-- soft_delete_onto_project(uuid)
-- Soft delete an ontology project
-- Source: supabase/migrations/20251221_soft_delete_onto_projects.sql

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

  -- Soft delete milestones
  UPDATE onto_milestones
  SET deleted_at = v_now, updated_at = v_now
  WHERE project_id = p_project_id AND deleted_at IS NULL;

  -- Soft delete risks
  UPDATE onto_risks
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
