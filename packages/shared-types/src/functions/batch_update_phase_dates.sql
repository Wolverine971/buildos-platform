-- packages/shared-types/src/functions/batch_update_phase_dates.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.batch_update_phase_dates(p_project_id uuid, p_updates jsonb)
 RETURNS TABLE(id uuid, start_date date, end_date date, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
