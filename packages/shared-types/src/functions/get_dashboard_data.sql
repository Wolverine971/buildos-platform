-- packages/shared-types/src/functions/get_dashboard_data.sql
-- get_dashboard_data(uuid, text, text, text, text)
-- Get dashboard data for a user
-- Source: Supabase database (function definition not in migration files)

-- Note: This function returns comprehensive dashboard data as JSON.
-- The SQL definition below is reconstructed from database.types.ts signature.

CREATE OR REPLACE FUNCTION get_dashboard_data(
  p_user_id uuid,
  p_today text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_date_start text DEFAULT NULL,
  p_date_end text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_actor_id uuid;
BEGIN
  -- Get actor ID for the user
  SELECT id INTO v_actor_id
  FROM onto_actors
  WHERE user_id = p_user_id
  LIMIT 1;

  SELECT jsonb_build_object(
    'projects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'state_key', p.state_key,
        'next_step_short', p.next_step_short,
        'task_count', (SELECT COUNT(*) FROM onto_tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL)
      ))
      FROM onto_projects p
      WHERE p.created_by = v_actor_id
        AND p.deleted_at IS NULL
      ORDER BY p.updated_at DESC
      LIMIT 10
    ), '[]'::jsonb),
    'upcoming_tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'due_at', t.due_at,
        'project_name', p.name
      ))
      FROM onto_tasks t
      JOIN onto_projects p ON t.project_id = p.id
      WHERE p.created_by = v_actor_id
        AND t.deleted_at IS NULL
        AND t.state_key != 'done'
        AND t.due_at IS NOT NULL
      ORDER BY t.due_at ASC
      LIMIT 5
    ), '[]'::jsonb),
    'recent_activity_count', (
      SELECT COUNT(*)
      FROM onto_project_logs l
      WHERE l.changed_by = v_actor_id
        AND l.created_at > NOW() - INTERVAL '7 days'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
