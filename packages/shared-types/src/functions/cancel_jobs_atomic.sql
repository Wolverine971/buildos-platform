-- packages/shared-types/src/functions/cancel_jobs_atomic.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.cancel_jobs_atomic(p_user_id uuid, p_job_type text, p_metadata_filter jsonb DEFAULT NULL::jsonb, p_allowed_statuses text[] DEFAULT ARRAY['pending'::text, 'processing'::text])
 RETURNS TABLE(id uuid, queue_job_id text, job_type text, status text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  UPDATE queue_jobs
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE queue_jobs.user_id = p_user_id
    AND queue_jobs.job_type::TEXT = p_job_type  -- FIXED: Cast enum to TEXT for comparison
    AND queue_jobs.status::TEXT = ANY(p_allowed_statuses)  -- FIXED: Cast enum to TEXT
    AND (p_metadata_filter IS NULL OR queue_jobs.metadata @> p_metadata_filter)
  RETURNING
    queue_jobs.id,
    queue_jobs.queue_job_id,
    queue_jobs.job_type::TEXT,  -- FIXED: Cast enum to TEXT for output
    queue_jobs.status::TEXT;    -- FIXED: Cast enum to TEXT for output
END;
$function$
