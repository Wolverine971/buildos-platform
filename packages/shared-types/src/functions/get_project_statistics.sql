-- packages/shared-types/src/functions/get_project_statistics.sql
-- get_project_statistics(uuid, uuid)
-- Get comprehensive project statistics
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_project_statistics(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'tasks', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM onto_tasks WHERE project_id = p_project_id AND deleted_at IS NULL),
      'completed', (SELECT COUNT(*) FROM onto_tasks WHERE project_id = p_project_id AND deleted_at IS NULL AND state_key = 'done'),
      'in_progress', (SELECT COUNT(*) FROM onto_tasks WHERE project_id = p_project_id AND deleted_at IS NULL AND state_key = 'doing'),
      'pending', (SELECT COUNT(*) FROM onto_tasks WHERE project_id = p_project_id AND deleted_at IS NULL AND state_key = 'todo'),
      'blocked', (SELECT COUNT(*) FROM onto_tasks WHERE project_id = p_project_id AND deleted_at IS NULL AND state_key = 'blocked'),
      'overdue', (SELECT COUNT(*) FROM onto_tasks WHERE project_id = p_project_id AND deleted_at IS NULL AND due_at < NOW() AND completed_at IS NULL)
    ),
    'goals', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM onto_goals WHERE project_id = p_project_id AND deleted_at IS NULL),
      'achieved', (SELECT COUNT(*) FROM onto_goals WHERE project_id = p_project_id AND deleted_at IS NULL AND state_key = 'achieved'),
      'active', (SELECT COUNT(*) FROM onto_goals WHERE project_id = p_project_id AND deleted_at IS NULL AND state_key = 'active')
    ),
    'documents', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM onto_documents WHERE project_id = p_project_id AND deleted_at IS NULL)
    ),
    'phases', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM project_phases WHERE project_id = p_project_id AND deleted_at IS NULL),
      'completed', (SELECT COUNT(*) FROM project_phases WHERE project_id = p_project_id AND deleted_at IS NULL AND status = 'completed')
    ),
    'completion_percentage', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE state_key = 'done') / COUNT(*))
      END
      FROM onto_tasks
      WHERE project_id = p_project_id AND deleted_at IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
