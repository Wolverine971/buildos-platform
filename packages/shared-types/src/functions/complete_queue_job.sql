-- packages/shared-types/src/functions/complete_queue_job.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.complete_queue_job(p_job_id uuid, p_result jsonb DEFAULT NULL::jsonb, p_processing_token uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE queue_jobs
  SET
    status = 'completed',
    completed_at = NOW(),
    updated_at = NOW(),
    processing_token = NULL,
    result = p_result
  WHERE id = p_job_id
    AND status IN ('processing', 'completed')
    AND (p_processing_token IS NULL OR processing_token = p_processing_token);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$
