-- packages/shared-types/src/functions/reorder_phases_with_tasks.sql
-- reorder_phases_with_tasks(uuid, jsonb, uuid[], boolean)
-- Reorder phases with associated tasks
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION reorder_phases_with_tasks(
  p_project_id uuid,
  p_phase_updates jsonb,
  p_affected_task_ids uuid[] DEFAULT NULL,
  p_clear_task_dates boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_update jsonb;
  v_result jsonb;
BEGIN
  -- Update phase orders
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_phase_updates)
  LOOP
    UPDATE phases
    SET
      order_position = (v_update->>'order_position')::INTEGER,
      start_date = (v_update->>'start_date')::DATE,
      end_date = (v_update->>'end_date')::DATE,
      updated_at = NOW()
    WHERE phases.id = (v_update->>'id')::UUID
      AND phases.project_id = p_project_id;
  END LOOP;

  -- Optionally clear task dates
  IF p_clear_task_dates AND p_affected_task_ids IS NOT NULL THEN
    UPDATE tasks
    SET
      start_at = NULL,
      due_at = NULL,
      updated_at = NOW()
    WHERE id = ANY(p_affected_task_ids);
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'phases_updated', jsonb_array_length(p_phase_updates),
    'tasks_affected', COALESCE(array_length(p_affected_task_ids, 1), 0)
  );

  RETURN v_result;
END;
$$;
