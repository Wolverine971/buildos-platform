-- Create optimized RPC function for fetching project phases with tasks hierarchy
-- This is a new function that doesn't conflict with existing functions

CREATE OR REPLACE FUNCTION get_project_phases_hierarchy(
  p_project_id UUID,
  p_user_id UUID DEFAULT NULL
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
  -- Verify project ownership if user_id provided
  IF p_user_id IS NOT NULL THEN
    SELECT user_id INTO v_project_user_id
    FROM projects
    WHERE id = p_project_id;
    
    IF v_project_user_id IS NULL OR v_project_user_id != p_user_id THEN
      RETURN json_build_object('error', 'Unauthorized', 'phases', '[]'::json);
    END IF;
  END IF;

  -- Build the complete phases hierarchy in a single query
  SELECT json_build_object(
    'phases', COALESCE(
      (SELECT json_agg(phase_data ORDER BY phase_data->>'order')
       FROM (
         SELECT json_build_object(
           'id', p.id,
           'project_id', p.project_id,
           'user_id', p.user_id,
           'name', p.name,
           'description', p.description,
           'start_date', p.start_date,
           'end_date', p.end_date,
           'order', p.order,
           'created_at', p.created_at,
           'updated_at', p.updated_at,
           'tasks', COALESCE(
             (SELECT json_agg(
                json_build_object(
                  'id', t.id,
                  'title', t.title,
                  'description', t.description,
                  'details', t.details,
                  'status', t.status,
                  'priority', t.priority,
                  'task_type', t.task_type,
                  'start_date', t.start_date,
                  'deleted_at', t.deleted_at,
                  'created_at', t.created_at,
                  'updated_at', t.updated_at,
                  'project_id', t.project_id,
                  'completed_at', t.completed_at,
                  'suggested_start_date', pt.suggested_start_date,
                  'assignment_reason', pt.assignment_reason,
                  'calendar_events', COALESCE(
                    (SELECT json_agg(
                       json_build_object(
                         'id', tce.id,
                         'calendar_event_id', tce.calendar_event_id,
                         'calendar_id', tce.calendar_id,
                         'event_start', tce.event_start,
                         'event_end', tce.event_end,
                         'event_link', tce.event_link,
                         'sync_status', tce.sync_status
                       )
                     )
                     FROM task_calendar_events tce
                     WHERE tce.task_id = t.id
                    ), '[]'::json
                  )
                )
              )
              FROM phase_tasks pt
              INNER JOIN tasks t ON pt.task_id = t.id
              WHERE pt.phase_id = p.id
             ), '[]'::json
           ),
           'task_count', (
             SELECT COUNT(*)
             FROM phase_tasks pt2
             INNER JOIN tasks t2 ON pt2.task_id = t2.id
             WHERE pt2.phase_id = p.id
           ),
           'completed_tasks', (
             SELECT COUNT(*)
             FROM phase_tasks pt3
             INNER JOIN tasks t3 ON pt3.task_id = t3.id
             WHERE pt3.phase_id = p.id
               AND t3.status IN ('done', 'completed')
           )
         ) AS phase_data
         FROM phases p
         WHERE p.project_id = p_project_id
       ) AS phase_subquery
      ), '[]'::json
    ),
    'metadata', json_build_object(
      'total_phases', (SELECT COUNT(*) FROM phases WHERE project_id = p_project_id),
      'total_tasks', (
        SELECT COUNT(DISTINCT pt.task_id)
        FROM phase_tasks pt
        INNER JOIN phases p ON pt.phase_id = p.id
        WHERE p.project_id = p_project_id
      ),
      'project_id', p_project_id,
      'fetched_at', NOW()
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION get_project_phases_hierarchy IS 'Optimized function to fetch all phases with their tasks and calendar events in a single query, eliminating complex nested JOINs';

-- Create indexes to optimize the function if they don't exist
CREATE INDEX IF NOT EXISTS idx_phases_project_order 
  ON phases(project_id, "order");

CREATE INDEX IF NOT EXISTS idx_phase_tasks_phase 
  ON phase_tasks(phase_id);

CREATE INDEX IF NOT EXISTS idx_phase_tasks_task 
  ON phase_tasks(task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project 
  ON tasks(project_id)
  WHERE deleted_at IS NULL;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_project_phases_hierarchy TO authenticated;