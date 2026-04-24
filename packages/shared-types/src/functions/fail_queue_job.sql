-- packages/shared-types/src/functions/fail_queue_job.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.fail_queue_job(p_job_id uuid, p_error_message text, p_retry boolean DEFAULT true, p_processing_token uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_job RECORD;
  v_updated INTEGER;
  v_retry_delay INTEGER;
BEGIN
  -- Get current job state
  SELECT attempts, max_attempts
  INTO v_job
  FROM queue_jobs
  WHERE id = p_job_id
    AND status IN ('processing', 'failed')
    AND (p_processing_token IS NULL OR processing_token = p_processing_token);

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Calculate exponential backoff: 2^attempts minutes
  v_retry_delay := POWER(2, COALESCE(v_job.attempts, 0));

  -- Determine if we should retry
  IF p_retry AND (COALESCE(v_job.attempts, 0) + 1 < COALESCE(v_job.max_attempts, 3)) THEN
    -- Retry: increment attempts and schedule for later
    UPDATE queue_jobs
    SET
      status = 'pending',
      processing_token = NULL,
      started_at = NULL,
      completed_at = NULL,
      attempts = COALESCE(attempts, 0) + 1,
      error_message = p_error_message,
      updated_at = NOW(),
      scheduled_for = NOW() + (v_retry_delay || ' minutes')::INTERVAL
    WHERE id = p_job_id
      AND status IN ('processing', 'failed')
      AND (p_processing_token IS NULL OR processing_token = p_processing_token);
  ELSE
    -- Final failure: mark as failed
    UPDATE queue_jobs
    SET
      status = 'failed',
      processing_token = NULL,
      attempts = COALESCE(attempts, 0) + 1,
      error_message = p_error_message,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_job_id
      AND status IN ('processing', 'failed')
      AND (p_processing_token IS NULL OR processing_token = p_processing_token);
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$
