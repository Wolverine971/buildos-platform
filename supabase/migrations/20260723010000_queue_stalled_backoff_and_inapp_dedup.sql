-- supabase/migrations/20260723010000_queue_stalled_backoff_and_inapp_dedup.sql
-- 2026-07-23 queue audit fixes:
--   1. reset_stalled_jobs requeued with scheduled_for = NOW(), so a job that
--      reliably kills its worker hot-looped through all its attempts with no
--      breathing room. Requeues now back off exponentially with jitter.
--   2. fail_queue_job retries had deterministic 2^attempts-minute backoff with
--      no jitter — a provider outage failed many jobs together and retried
--      them together (retry wave). Added bounded random jitter.
--   3. user_notifications.delivery_id only had a NON-unique index, so a crash
--      between the in-app insert and the delivery status update let the retry
--      insert a duplicate in-app notification. Dedupe then enforce uniqueness.

-- 1 + backoff for stalled requeues -------------------------------------------

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
      -- Exponential backoff (capped at 16 minutes) plus up to 60s of jitter.
      -- A stalled job usually means its worker died mid-flight; requeueing it
      -- instantly invites an immediate repeat of whatever killed the worker.
      scheduled_for = CASE
        WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN
          NOW()
            + (LEAST(POWER(2, stalled_jobs.current_attempts), 16) || ' minutes')::INTERVAL
            + (random() * INTERVAL '60 seconds')
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
$function$;

-- 2 + jitter for failure retries ---------------------------------------------

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

-- 3 in-app delivery idempotency ----------------------------------------------

-- Dedupe first (keep the earliest row per delivery), then enforce uniqueness.
DELETE FROM user_notifications un
WHERE un.delivery_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM user_notifications keeper
    WHERE keeper.delivery_id = un.delivery_id
      AND (
        keeper.created_at < un.created_at
        OR (keeper.created_at = un.created_at AND keeper.id < un.id)
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_delivery_id
  ON user_notifications(delivery_id)
  WHERE delivery_id IS NOT NULL;

COMMENT ON INDEX uq_user_notifications_delivery_id IS
  'One in-app notification per notification delivery — makes the send_notification in-app path idempotent under crash-retry (2026-07-23 queue audit).';
