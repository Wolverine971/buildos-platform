-- packages/shared-types/src/functions/get_projects_with_stats.sql
-- get_projects_with_stats(uuid, text, text, integer, integer)
-- Get projects with statistics for a user
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_projects_with_stats(
  p_user_id uuid,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_total_count integer;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO v_total_count
  FROM onto_projects p
  JOIN onto_actors a ON a.id = p.created_by
  WHERE a.user_id = p_user_id
    AND p.deleted_at IS NULL
    AND (p_search IS NULL OR p.title ILIKE '%' || p_search || '%')
    AND (p_status IS NULL OR p.state_key::TEXT = p_status);

  -- Get projects with stats
  SELECT jsonb_build_object(
    'projects', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'description', p.description,
        'state_key', p.state_key,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'stats', jsonb_build_object(
          'task_count', (SELECT COUNT(*) FROM onto_tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL),
          'completed_tasks', (SELECT COUNT(*) FROM onto_tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.state_key = 'done'),
          'goal_count', (SELECT COUNT(*) FROM onto_goals g WHERE g.project_id = p.id AND g.deleted_at IS NULL),
          'document_count', (SELECT COUNT(*) FROM onto_documents d WHERE d.project_id = p.id AND d.deleted_at IS NULL)
        )
      )
    ), '[]'::jsonb),
    'total_count', v_total_count,
    'limit', p_limit,
    'offset', p_offset
  ) INTO v_result
  FROM onto_projects p
  JOIN onto_actors a ON a.id = p.created_by
  WHERE a.user_id = p_user_id
    AND p.deleted_at IS NULL
    AND (p_search IS NULL OR p.title ILIKE '%' || p_search || '%')
    AND (p_status IS NULL OR p.state_key::TEXT = p_status)
  ORDER BY p.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;

  RETURN v_result;
END;
$$;
