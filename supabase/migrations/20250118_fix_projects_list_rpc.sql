-- Drop the existing function with the incorrect type casting
DROP FUNCTION IF EXISTS get_projects_with_stats(UUID, TEXT, TEXT, INTEGER, INTEGER);

-- Create fixed version of the optimized RPC function for projects list with task statistics
-- This fixes the enum type casting issue

CREATE OR REPLACE FUNCTION get_projects_with_stats(
  p_user_id UUID,
  p_status TEXT DEFAULT 'all',
  p_search TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_total_count INTEGER;
BEGIN
  -- Get total count for pagination
  SELECT COUNT(*)
  INTO v_total_count
  FROM projects p
  WHERE p.user_id = p_user_id
    AND (p_status = 'all' OR p.status::text = p_status)
    AND (
      p_search = '' OR 
      p.name ILIKE '%' || p_search || '%' OR 
      p.description ILIKE '%' || p_search || '%'
    );

  -- Build the complete result with projects and stats
  SELECT json_build_object(
    'projects', COALESCE(
      (SELECT json_agg(project_data)
       FROM (
         SELECT json_build_object(
           'id', p.id,
           'user_id', p.user_id,
           'name', p.name,
           'slug', p.slug,
           'description', p.description,
           'status', p.status,
           'calendar_color_id', p.calendar_color_id,
           'start_date', p.start_date,
           'end_date', p.end_date,
           'created_at', p.created_at,
           'updated_at', p.updated_at,
           'taskStats', json_build_object(
             'total', (
               SELECT COUNT(*)
               FROM tasks t
               WHERE t.project_id = p.id
                 AND t.deleted_at IS NULL
             ),
             'active', (
               SELECT COUNT(*)
               FROM tasks t
               WHERE t.project_id = p.id
                 AND t.deleted_at IS NULL
                 AND t.status IN ('backlog', 'in_progress')
             ),
             'completed', (
               SELECT COUNT(*)
               FROM tasks t
               WHERE t.project_id = p.id
                 AND t.deleted_at IS NULL
                 AND t.status = 'done'
             ),
             'blocked', (
               SELECT COUNT(*)
               FROM tasks t
               WHERE t.project_id = p.id
                 AND t.deleted_at IS NULL
                 AND t.status = 'blocked'
             ),
             'overdue', (
               SELECT COUNT(*)
               FROM tasks t
               WHERE t.project_id = p.id
                 AND t.deleted_at IS NULL
                 AND t.status != 'done'
                 AND t.start_date < CURRENT_DATE
             ),
             'completionRate', (
               SELECT CASE 
                 WHEN COUNT(*) = 0 THEN 0
                 ELSE ROUND((COUNT(*) FILTER (WHERE status = 'done') * 100.0) / COUNT(*))
               END
               FROM tasks t
               WHERE t.project_id = p.id
                 AND t.deleted_at IS NULL
             ),
             'highPriorityCount', (
               SELECT COUNT(*)
               FROM tasks t
               WHERE t.project_id = p.id
                 AND t.deleted_at IS NULL
                 AND t.status != 'done'
                 AND t.priority = 'high'
             ),
             'recentlyUpdated', (
               SELECT COUNT(*)
               FROM tasks t
               WHERE t.project_id = p.id
                 AND t.deleted_at IS NULL
                 AND t.updated_at > NOW() - INTERVAL '7 days'
             )
           ),
           'phaseInfo', json_build_object(
             'count', (
               SELECT COUNT(*)
               FROM phases ph
               WHERE ph.project_id = p.id
             ),
             'activePhase', (
               SELECT json_build_object(
                 'id', ph.id,
                 'name', ph.name,
                 'start_date', ph.start_date,
                 'end_date', ph.end_date
               )
               FROM phases ph
               WHERE ph.project_id = p.id
                 AND ph.start_date <= CURRENT_DATE
                 AND ph.end_date >= CURRENT_DATE
               ORDER BY ph.order ASC
               LIMIT 1
             )
           ),
           'lastActivity', (
             SELECT MAX(activity_date)
             FROM (
               SELECT MAX(t.updated_at) as activity_date
               FROM tasks t
               WHERE t.project_id = p.id
               UNION ALL
               SELECT MAX(ph.updated_at) as activity_date
               FROM phases ph
               WHERE ph.project_id = p.id
               UNION ALL
               SELECT p.updated_at as activity_date
             ) activities
           ),
           'sortOrder', CASE p.status::text
             WHEN 'active' THEN 0
             WHEN 'paused' THEN 1
             WHEN 'completed' THEN 2
             ELSE 3
           END
         ) AS project_data
         FROM projects p
         WHERE p.user_id = p_user_id
           AND (p_status = 'all' OR p.status::text = p_status)
           AND (
             p_search = '' OR 
             p.name ILIKE '%' || p_search || '%' OR 
             p.description ILIKE '%' || p_search || '%'
           )
         ORDER BY 
           CASE p.status::text
             WHEN 'active' THEN 0
             WHEN 'paused' THEN 1
             WHEN 'completed' THEN 2
             ELSE 3
           END,
           p.created_at DESC
         LIMIT p_limit
         OFFSET p_offset
       ) AS projects_subquery
      ), '[]'::json
    ),
    'pagination', json_build_object(
      'total', v_total_count,
      'limit', p_limit,
      'offset', p_offset,
      'totalPages', CEIL(v_total_count::numeric / p_limit)
    ),
    'metadata', json_build_object(
      'fetched_at', NOW(),
      'user_id', p_user_id,
      'filters', json_build_object(
        'status', p_status,
        'search', p_search
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_projects_with_stats TO authenticated;