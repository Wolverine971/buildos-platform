-- packages/shared-types/src/functions/reset_stalled_jobs.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.reset_stalled_jobs(p_stall_timeout text DEFAULT '5 minutes'::text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_reset_count INTEGER;
BEGIN
  WITH stalled_jobs AS (
    SELECT
      id,
      COALESCE(attempts, 0) AS current_attempts,
      COALESCE(max_attempts, 3) AS allowed_attempts
    FROM queue_jobs
    WHERE status = 'processing'
      AND GREATEST(
        COALESCE(started_at, 'epoch'::timestamptz),
        COALESCE(updated_at, 'epoch'::timestamptz)
      ) < NOW() - p_stall_timeout::INTERVAL
    FOR UPDATE SKIP LOCKED
  ),
  updated_jobs AS (
    UPDATE queue_jobs q
    SET
      status = CASE
        WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN 'pending'::queue_status
        ELSE 'failed'::queue_status
      END,
      attempts = stalled_jobs.current_attempts + 1,
      processing_token = NULL,
      started_at = NULL,
      scheduled_for = CASE
        WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN NOW()
        ELSE q.scheduled_for
      END,
      completed_at = CASE
        WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN q.completed_at
        ELSE NOW()
      END,
      error_message = CASE
        WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN
          COALESCE(q.error_message, 'Job stalled and was requeued')
        ELSE
          'Job stalled and exceeded max attempts'
      END,
      updated_at = NOW()
    FROM stalled_jobs
    WHERE q.id = stalled_jobs.id
    RETURNING q.id
  )
  SELECT COUNT(*) INTO v_reset_count FROM updated_jobs;

  IF v_reset_count > 0 THEN
    RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
  END IF;

  RETURN v_reset_count;
END;
$function$
