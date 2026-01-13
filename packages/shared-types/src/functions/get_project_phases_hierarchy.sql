-- packages/shared-types/src/functions/get_project_phases_hierarchy.sql
-- get_project_phases_hierarchy(uuid, uuid)
-- Get project phases in hierarchical structure
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_project_phases_hierarchy(
  p_project_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ph.id,
      'name', ph.name,
      'description', ph.description,
      'order_index', ph.order_index,
      'start_date', ph.start_date,
      'end_date', ph.end_date,
      'status', ph.status,
      'tasks', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'title', t.title,
            'description', t.description,
            'state_key', t.state_key,
            'priority', t.priority,
            'due_at', t.due_at,
            'completed_at', t.completed_at
          ) ORDER BY t.priority DESC NULLS LAST, t.created_at
        ), '[]'::jsonb)
        FROM onto_tasks t
        WHERE t.project_id = p_project_id
          AND t.deleted_at IS NULL
          AND (t.props->>'phase_id')::uuid = ph.id
      )
    ) ORDER BY ph.order_index
  ) INTO v_result
  FROM project_phases ph
  WHERE ph.project_id = p_project_id
    AND ph.deleted_at IS NULL;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
