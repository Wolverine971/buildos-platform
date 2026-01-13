-- packages/shared-types/src/functions/claim_pending_jobs.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.claim_pending_jobs(p_job_types text[], p_batch_size integer DEFAULT 5)
 RETURNS TABLE(id uuid, queue_job_id text, user_id uuid, job_type text, metadata jsonb, status text, priority integer, attempts integer, max_attempts integer, scheduled_for timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, error_message text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  UPDATE queue_jobs
  SET
    status = 'processing',
    started_at = NOW(),
    updated_at = NOW()
  WHERE queue_jobs.id IN (
    SELECT queue_jobs.id
    FROM queue_jobs
    WHERE queue_jobs.status = 'pending'
      AND queue_jobs.job_type::TEXT = ANY(p_job_types)
      AND queue_jobs.scheduled_for <= NOW()
    ORDER BY queue_jobs.priority DESC, queue_jobs.scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    queue_jobs.id,
    queue_jobs.queue_job_id,
    queue_jobs.user_id,
    queue_jobs.job_type::TEXT,     -- Cast enum to text
    queue_jobs.metadata,
    queue_jobs.status::TEXT,       -- FIXED: Cast enum to text
    queue_jobs.priority,
    queue_jobs.attempts,
    queue_jobs.max_attempts,
    queue_jobs.scheduled_for,
    queue_jobs.created_at,
    queue_jobs.updated_at,
    queue_jobs.started_at,
    queue_jobs.completed_at,
    queue_jobs.error_message;
END;
$function$
