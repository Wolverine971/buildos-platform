-- Create optimized RPC function for dashboard data fetching
-- This combines multiple queries into a single atomic operation

CREATE OR REPLACE FUNCTION get_dashboard_data(
  p_user_id UUID,
  p_timezone TEXT DEFAULT 'UTC',
  p_date_start DATE DEFAULT NULL,
  p_date_end DATE DEFAULT NULL,
  p_today DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_date_start DATE;
  v_date_end DATE;
  v_today DATE;
  v_tomorrow DATE;
  v_week_end DATE;
BEGIN
  -- Set default dates if not provided
  v_today := COALESCE(p_today, CURRENT_DATE);
  v_date_start := COALESCE(p_date_start, v_today - INTERVAL '30 days');
  v_date_end := COALESCE(p_date_end, v_today + INTERVAL '14 days');
  v_tomorrow := v_today + INTERVAL '1 day';
  v_week_end := v_today + INTERVAL '7 days';

  -- Build the complete result in a single query
  SELECT json_build_object(
    'regular_tasks', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', t.id,
          'title', t.title,
          'description', t.description,
          'status', t.status,
          'priority', t.priority,
          'task_type', t.task_type,
          'start_date', t.start_date,
          'duration_minutes', t.duration_minutes,
          'project_id', t.project_id,
          'created_at', t.created_at,
          'updated_at', t.updated_at,
          'recurrence_pattern', t.recurrence_pattern,
          'project', CASE 
            WHEN p.id IS NOT NULL THEN json_build_object(
              'id', p.id,
              'name', p.name,
              'slug', p.slug,
              'status', p.status
            )
            ELSE NULL
          END
        ) ORDER BY t.priority DESC, t.start_date ASC
      ), '[]'::json)
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = p_user_id
        AND t.status != 'done'
        AND t.deleted_at IS NULL
        AND t.start_date >= v_date_start
        AND t.start_date <= v_date_end
    ),
    
    'overdue_instances', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ri.id,
          'task_id', ri.task_id,
          'instance_date', ri.instance_date,
          'status', ri.status,
          'completed_at', ri.completed_at,
          'user_id', ri.user_id,
          'created_at', ri.created_at,
          'updated_at', ri.updated_at,
          'task', json_build_object(
            'id', t.id,
            'title', t.title,
            'description', t.description,
            'details', t.details,
            'status', t.status,
            'priority', t.priority,
            'task_type', t.task_type,
            'start_date', t.start_date,
            'duration_minutes', t.duration_minutes,
            'project_id', t.project_id,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'recurrence_pattern', t.recurrence_pattern,
            'recurrence_ends', t.recurrence_ends,
            'recurrence_end_source', t.recurrence_end_source,
            'project', CASE 
              WHEN p.id IS NOT NULL THEN json_build_object(
                'id', p.id,
                'name', p.name,
                'slug', p.slug,
                'description', p.description,
                'status', p.status
              )
              ELSE NULL
            END,
            'calendar_events', (
              SELECT COALESCE(json_agg(
                json_build_object(
                  'id', tce.id,
                  'calendar_event_id', tce.calendar_event_id,
                  'calendar_id', tce.calendar_id,
                  'event_start', tce.event_start,
                  'event_end', tce.event_end,
                  'event_link', tce.event_link,
                  'sync_status', tce.sync_status
                )
              ), '[]'::json)
              FROM task_calendar_events tce
              WHERE tce.task_id = t.id
            )
          )
        ) ORDER BY ri.instance_date DESC
      ), '[]'::json)
      FROM recurring_task_instances ri
      INNER JOIN tasks t ON ri.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE ri.user_id = p_user_id
        AND ri.instance_date < v_today
        AND ri.status IN ('scheduled', 'overdue')
    ),
    
    'week_instances', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ri.id,
          'task_id', ri.task_id,
          'instance_date', ri.instance_date,
          'status', ri.status,
          'completed_at', ri.completed_at,
          'user_id', ri.user_id,
          'created_at', ri.created_at,
          'updated_at', ri.updated_at,
          'task', json_build_object(
            'id', t.id,
            'title', t.title,
            'description', t.description,
            'details', t.details,
            'status', t.status,
            'priority', t.priority,
            'task_type', t.task_type,
            'start_date', t.start_date,
            'duration_minutes', t.duration_minutes,
            'project_id', t.project_id,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'recurrence_pattern', t.recurrence_pattern,
            'recurrence_ends', t.recurrence_ends,
            'recurrence_end_source', t.recurrence_end_source,
            'project', CASE 
              WHEN p.id IS NOT NULL THEN json_build_object(
                'id', p.id,
                'name', p.name,
                'slug', p.slug,
                'description', p.description,
                'status', p.status
              )
              ELSE NULL
            END,
            'calendar_events', (
              SELECT COALESCE(json_agg(
                json_build_object(
                  'id', tce.id,
                  'calendar_event_id', tce.calendar_event_id,
                  'calendar_id', tce.calendar_id,
                  'event_start', tce.event_start,
                  'event_end', tce.event_end,
                  'event_link', tce.event_link,
                  'sync_status', tce.sync_status
                )
              ), '[]'::json)
              FROM task_calendar_events tce
              WHERE tce.task_id = t.id
            )
          )
        ) ORDER BY ri.instance_date ASC
      ), '[]'::json)
      FROM recurring_task_instances ri
      INNER JOIN tasks t ON ri.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE ri.user_id = p_user_id
        AND ri.instance_date >= v_today
        AND ri.instance_date <= v_week_end + INTERVAL '1 day'
        AND ri.status IN ('scheduled', 'overdue')
    ),
    
    'active_projects', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'slug', p.slug,
          'status', p.status,
          'updated_at', p.updated_at
        ) ORDER BY p.updated_at DESC
      ), '[]'::json)
      FROM projects p
      WHERE p.user_id = p_user_id
        AND p.status = 'active'
      LIMIT 10
    ),
    
    'dates', json_build_object(
      'today', v_today,
      'tomorrow', v_tomorrow,
      'week_end', v_week_end,
      'date_start', v_date_start,
      'date_end', v_date_end
    ),
    
    'stats', json_build_object(
      'total_tasks', (
        SELECT COUNT(*)
        FROM tasks
        WHERE user_id = p_user_id
          AND status != 'done'
          AND deleted_at IS NULL
          AND start_date BETWEEN v_date_start AND v_date_end
      ),
      'overdue_count', (
        SELECT COUNT(*)
        FROM tasks
        WHERE user_id = p_user_id
          AND status NOT IN ('done', 'completed')
          AND deleted_at IS NULL
          AND start_date < v_today
      ),
      'today_count', (
        SELECT COUNT(*)
        FROM tasks
        WHERE user_id = p_user_id
          AND status != 'done'
          AND deleted_at IS NULL
          AND DATE(start_date) = v_today
      ),
      'recurring_count', (
        SELECT COUNT(*)
        FROM tasks
        WHERE user_id = p_user_id
          AND task_type = 'recurring'
          AND deleted_at IS NULL
      )
    )
  ) INTO v_result;

  -- Update overdue recurring instances status in a single operation
  UPDATE recurring_task_instances
  SET status = 'overdue'
  WHERE user_id = p_user_id
    AND instance_date < v_today
    AND status = 'scheduled';

  RETURN v_result;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION get_dashboard_data IS 'Optimized function to fetch all dashboard data in a single query, reducing multiple round trips to the database';

-- Create index to optimize the function if they don't exist
CREATE INDEX IF NOT EXISTS idx_tasks_user_start_date 
  ON tasks(user_id, start_date) 
  WHERE deleted_at IS NULL AND status != 'done';

CREATE INDEX IF NOT EXISTS idx_recurring_instances_user_date 
  ON recurring_task_instances(user_id, instance_date)
  WHERE status IN ('scheduled', 'overdue');

CREATE INDEX IF NOT EXISTS idx_projects_user_status 
  ON projects(user_id, status) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_task_calendar_events_task 
  ON task_calendar_events(task_id);