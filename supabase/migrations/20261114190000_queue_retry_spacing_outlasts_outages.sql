-- supabase/migrations/20261114190000_queue_retry_spacing_outlasts_outages.sql
--
-- Queue retries waited 2^attempts minutes: 1 minute, then 2. With the default
-- three attempts a job was out of tries about four minutes after its first
-- failure. On 2026-10-22 the model provider rejected requests for over an hour
-- and every job that ran in that window gave up within five minutes; nothing
-- replays a failed job.
--
-- New spacing, by failures so far:
--   1st failure -> ~2 minutes   (a blip: retry soon)
--   2nd failure -> ~30 minutes  (an outage: come back after it)
--   3rd+ failure -> ~2 hours    (only for jobs queued with max_attempts > 3)
-- The up-to-60-second jitter is unchanged, as is everything else in the
-- function: the processing-token fence, the attempts arithmetic, and the final
-- failure branch.
--
-- CREATE OR REPLACE keeps the function's existing grants.

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

  -- Minutes to wait, by failures recorded before this one.
  v_retry_delay := CASE COALESCE(v_job.attempts, 0)
    WHEN 0 THEN 2
    WHEN 1 THEN 30
    ELSE 120
  END;

  -- Determine if we should retry
  IF p_retry AND (COALESCE(v_job.attempts, 0) + 1 < COALESCE(v_job.max_attempts, 3)) THEN
    -- Retry: increment attempts and schedule for later. Jitter (up to 60s)
    -- prevents a provider outage from creating a synchronized retry wave.
    UPDATE queue_jobs
    SET
      status = 'pending',
      processing_token = NULL,
      started_at = NULL,
      completed_at = NULL,
      attempts = COALESCE(attempts, 0) + 1,
      error_message = p_error_message,
      updated_at = NOW(),
      scheduled_for = NOW()
        + (v_retry_delay || ' minutes')::INTERVAL
        + (random() * INTERVAL '60 seconds')
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
$function$;
