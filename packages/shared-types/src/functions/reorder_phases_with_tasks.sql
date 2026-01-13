-- packages/shared-types/src/functions/reorder_phases_with_tasks.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.reorder_phases_with_tasks(p_project_id uuid, p_phase_updates jsonb, p_clear_task_dates boolean DEFAULT false, p_affected_task_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
  v_phase_count INTEGER;
  v_task_count INTEGER := 0;
BEGIN
  -- Start transaction implicitly
  
  -- Update phase orders
  WITH updated_phases AS (
    SELECT * FROM batch_update_phase_orders(p_project_id, p_phase_updates)
  )
  SELECT COUNT(*) INTO v_phase_count FROM updated_phases;

  -- Clear task dates if requested
  IF p_clear_task_dates AND p_affected_task_ids IS NOT NULL THEN
    -- Clear task start dates
    UPDATE tasks
    SET 
      start_date = NULL,
      updated_at = NOW()
    WHERE id = ANY(p_affected_task_ids)
      AND project_id = p_project_id;
    
    GET DIAGNOSTICS v_task_count = ROW_COUNT;

    -- Update phase task assignments
    UPDATE phase_tasks pt
    SET 
      suggested_start_date = NULL,
      assignment_reason = 'Phase reordering'
    WHERE pt.phase_id IN (
      SELECT id FROM phases WHERE project_id = p_project_id
    );
  END IF;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'phases_updated', v_phase_count,
    'tasks_cleared', v_task_count,
    'timestamp', NOW()
  );

  RETURN v_result;
END;
$function$
