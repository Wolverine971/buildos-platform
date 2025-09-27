-- supabase/migrations/20240120_batch_phase_operations.sql
-- Date: 2024-01-20
-- Purpose: Optimize phase reordering with batch operations

-- Function to batch update phase orders
CREATE OR REPLACE FUNCTION batch_update_phase_orders(
  p_project_id UUID,
  p_updates JSONB
) 
RETURNS TABLE (
  id UUID,
  order_position INTEGER,
  updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate that all phases belong to the project
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_updates) AS update_item
    WHERE NOT EXISTS (
      SELECT 1 
      FROM phases 
      WHERE phases.id = (update_item->>'id')::UUID 
      AND phases.project_id = p_project_id
    )
  ) THEN
    RAISE EXCEPTION 'Invalid phase ID or phase does not belong to project';
  END IF;

  -- Perform batch update
  RETURN QUERY
  UPDATE phases p
  SET 
    "order" = (u.value->>'order')::INTEGER,
    updated_at = NOW()
  FROM jsonb_array_elements(p_updates) AS u
  WHERE p.id = (u.value->>'id')::UUID
    AND p.project_id = p_project_id
  RETURNING p.id, p."order", p.updated_at;
END;
$$;

-- Function to batch update phase dates
CREATE OR REPLACE FUNCTION batch_update_phase_dates(
  p_project_id UUID,
  p_updates JSONB
)
RETURNS TABLE (
  id UUID,
  start_date DATE,
  end_date DATE,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate dates
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_updates) AS update_item
    WHERE (update_item->>'start_date')::DATE >= (update_item->>'end_date')::DATE
  ) THEN
    RAISE EXCEPTION 'Phase start date must be before end date';
  END IF;

  -- Perform batch update
  RETURN QUERY
  UPDATE phases p
  SET 
    start_date = (u.value->>'start_date')::DATE,
    end_date = (u.value->>'end_date')::DATE,
    updated_at = NOW()
  FROM jsonb_array_elements(p_updates) AS u
  WHERE p.id = (u.value->>'id')::UUID
    AND p.project_id = p_project_id
  RETURNING p.id, p.start_date, p.end_date, p.updated_at;
END;
$$;

-- Function to handle complete phase reordering transaction
CREATE OR REPLACE FUNCTION reorder_phases_with_tasks(
  p_project_id UUID,
  p_phase_updates JSONB,
  p_clear_task_dates BOOLEAN DEFAULT FALSE,
  p_affected_task_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION batch_update_phase_orders(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION batch_update_phase_dates(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION reorder_phases_with_tasks(UUID, JSONB, BOOLEAN, UUID[]) TO authenticated;

-- Add comment documentation
COMMENT ON FUNCTION batch_update_phase_orders IS 'Batch update phase order positions for a project';
COMMENT ON FUNCTION batch_update_phase_dates IS 'Batch update phase start and end dates for a project';
COMMENT ON FUNCTION reorder_phases_with_tasks IS 'Complete phase reordering operation with optional task date clearing';