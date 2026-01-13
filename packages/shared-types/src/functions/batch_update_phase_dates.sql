-- packages/shared-types/src/functions/batch_update_phase_dates.sql
-- batch_update_phase_dates(uuid, jsonb)
-- Batch update phase dates
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION batch_update_phase_dates(
  p_project_id uuid,
  p_updates jsonb
)
RETURNS TABLE (
  id uuid,
  start_date date,
  end_date date,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_update jsonb;
BEGIN
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE phases
    SET
      start_date = (v_update->>'start_date')::DATE,
      end_date = (v_update->>'end_date')::DATE,
      updated_at = NOW()
    WHERE phases.id = (v_update->>'id')::UUID
      AND phases.project_id = p_project_id;
  END LOOP;

  RETURN QUERY
  SELECT
    ph.id,
    ph.start_date,
    ph.end_date,
    ph.updated_at
  FROM phases ph
  WHERE ph.project_id = p_project_id;
END;
$$;
