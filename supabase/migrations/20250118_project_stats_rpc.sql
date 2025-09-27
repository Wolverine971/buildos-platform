-- Create optimized RPC function for project statistics
-- This eliminates fetching all tasks just to count them

CREATE OR REPLACE FUNCTION get_project_statistics(
  p_project_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_project_user_id UUID;
BEGIN
  -- Verify project ownership
  SELECT user_id INTO v_project_user_id
  FROM projects
  WHERE id = p_project_id;
  
  IF v_project_user_id IS NULL OR v_project_user_id != p_user_id THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  -- Calculate all statistics in a single query
  SELECT json_build_object(
    'stats', json_build_object(
      'total', (
        SELECT COUNT(*)
        FROM tasks
        WHERE project_id = p_project_id
          AND user_id = p_user_id
          AND deleted_at IS NULL
      ),
      'completed', (
        SELECT COUNT(*)
        FROM tasks
        WHERE project_id = p_project_id
          AND user_id = p_user_id
          AND deleted_at IS NULL
          AND status = 'done'
      ),
      'active', (
        SELECT COUNT(*)
        FROM tasks
        WHERE project_id = p_project_id
          AND user_id = p_user_id
          AND deleted_at IS NULL
          AND status != 'done'
      ),
      'inProgress', (
        SELECT COUNT(*)
        FROM tasks
        WHERE project_id = p_project_id
          AND user_id = p_user_id
          AND deleted_at IS NULL
          AND status = 'in_progress'
      ),
      'blocked', (
        SELECT COUNT(*)
        FROM tasks
        WHERE project_id = p_project_id
          AND user_id = p_user_id
          AND deleted_at IS NULL
          AND status = 'blocked'
      ),
      'deleted', (
        SELECT COUNT(*)
        FROM tasks
        WHERE project_id = p_project_id
          AND user_id = p_user_id
          AND deleted_at IS NOT NULL
      ),
      'scheduled', (
        SELECT COUNT(DISTINCT t.id)
        FROM tasks t
        INNER JOIN task_calendar_events tce ON t.id = tce.task_id
        WHERE t.project_id = p_project_id
          AND t.user_id = p_user_id
          AND t.deleted_at IS NULL
          AND t.status != 'done'
          AND tce.sync_status IN ('synced', 'pending')
      ),
      'hasPhases', (
        SELECT COUNT(*) > 0
        FROM phases
        WHERE project_id = p_project_id
      ),
      'completionRate', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND((COUNT(*) FILTER (WHERE status = 'done') * 100.0) / COUNT(*))
        END
        FROM tasks
        WHERE project_id = p_project_id
          AND user_id = p_user_id
          AND deleted_at IS NULL
      ),
      'byPriority', (
        SELECT json_object_agg(
          COALESCE(priority::text, 'none'),
          count
        )
        FROM (
          SELECT priority, COUNT(*) as count
          FROM tasks
          WHERE project_id = p_project_id
            AND user_id = p_user_id
            AND deleted_at IS NULL
            AND status != 'done'
          GROUP BY priority
        ) priority_counts
      ),
      'byStatus', (
        SELECT json_object_agg(
          status,
          count
        )
        FROM (
          SELECT status, COUNT(*) as count
          FROM tasks
          WHERE project_id = p_project_id
            AND user_id = p_user_id
            AND deleted_at IS NULL
          GROUP BY status
        ) status_counts
      ),
      'byType', (
        SELECT json_object_agg(
          COALESCE(task_type, 'one_off'),
          count
        )
        FROM (
          SELECT task_type, COUNT(*) as count
          FROM tasks
          WHERE project_id = p_project_id
            AND user_id = p_user_id
            AND deleted_at IS NULL
          GROUP BY task_type
        ) type_counts
      ),
      'phasesCount', (
        SELECT COUNT(*)
        FROM phases
        WHERE project_id = p_project_id
      ),
      'averageTasksPerPhase', (
        SELECT CASE
          WHEN COUNT(DISTINCT p.id) = 0 THEN 0
          ELSE ROUND(COUNT(pt.task_id)::numeric / COUNT(DISTINCT p.id), 1)
        END
        FROM phases p
        LEFT JOIN phase_tasks pt ON p.id = pt.phase_id
        WHERE p.project_id = p_project_id
      )
    ),
    'metadata', json_build_object(
      'project_id', p_project_id,
      'calculated_at', NOW(),
      'user_id', p_user_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION get_project_statistics IS 'Optimized function to calculate project statistics without fetching all task data, using database aggregations for efficiency';

-- Create indexes to optimize the function if they don't exist
CREATE INDEX IF NOT EXISTS idx_tasks_project_user_status 
  ON tasks(project_id, user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project_user_deleted 
  ON tasks(project_id, user_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_task_calendar_events_task_sync 
  ON task_calendar_events(task_id, sync_status);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_project_statistics TO authenticated;