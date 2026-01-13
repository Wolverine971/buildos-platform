-- packages/shared-types/src/functions/cancel_job_with_reason.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.cancel_job_with_reason(p_job_id uuid, p_reason text, p_allow_processing boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_updated INTEGER;
  v_allowed_statuses TEXT[];
BEGIN
  -- Determine which statuses we can cancel
  v_allowed_statuses := ARRAY['pending'];
  IF p_allow_processing THEN
    v_allowed_statuses := ARRAY['pending', 'processing'];
  END IF;

  UPDATE queue_jobs
  SET
    status = 'cancelled',
    error_message = p_reason,
    updated_at = NOW()
  WHERE id = p_job_id
    AND status = ANY(v_allowed_statuses);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$
