-- apps/web/supabase/migrations/20251022_fix_fail_queue_job_column.sql
-- Fix fail_queue_job function to use correct column name
-- The queue_jobs table doesn't have a 'failed_at' column
-- Failed jobs should use 'completed_at' to mark when they finished

CREATE OR REPLACE FUNCTION fail_queue_job(
  p_job_id UUID,
  p_error_message TEXT,
  p_retry BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_job RECORD;
  v_updated INTEGER;
  v_retry_delay INTEGER;
BEGIN
  -- Get current job state
  SELECT attempts, max_attempts
  INTO v_job
  FROM queue_jobs
  WHERE id = p_job_id;

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
      attempts = COALESCE(attempts, 0) + 1,
      error_message = p_error_message,
      updated_at = NOW(),
      scheduled_for = NOW() + (v_retry_delay || ' minutes')::INTERVAL
    WHERE id = p_job_id;
  ELSE
    -- Final failure: mark as failed
    UPDATE queue_jobs
    SET
      status = 'failed',
      attempts = COALESCE(attempts, 0) + 1,
      error_message = p_error_message,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_job_id;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fail_queue_job IS 'Marks a job as failed and optionally schedules retry with exponential backoff';
