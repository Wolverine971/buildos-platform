-- =====================================================
-- ATOMIC QUEUE JOB OPERATIONS
-- =====================================================
-- Creates atomic database functions for queue job operations to prevent race conditions
--
-- Key operations:
-- 1. claim_pending_jobs() - Atomic batch job claiming with status update
-- 2. complete_queue_job() - Mark job as completed with result
-- 3. fail_queue_job() - Mark job as failed with retry logic
-- 4. reset_stalled_jobs() - Recover jobs that have been processing too long
-- 5. add_queue_job() - Atomic job creation with deduplication
-- =====================================================

-- =====================================================
-- DROP EXISTING FUNCTIONS (IF ANY)
-- =====================================================
-- Must drop first if return types are changing or functions already exist
-- This ensures clean migration without type conflicts
-- Drop ALL functions with these names, regardless of signature

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all functions named claim_pending_jobs
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'claim_pending_jobs' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;

    -- Drop all functions named complete_queue_job
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'complete_queue_job' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;

    -- Drop all functions named fail_queue_job
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'fail_queue_job' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;

    -- Drop all functions named reset_stalled_jobs
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'reset_stalled_jobs' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;

    -- Drop all functions named add_queue_job
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'add_queue_job' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;

    -- Drop all functions named cancel_jobs_atomic
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'cancel_jobs_atomic' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;

    -- Drop all functions named cancel_brief_jobs_for_date
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'cancel_brief_jobs_for_date' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;

    -- Drop all functions named cancel_job_with_reason
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'cancel_job_with_reason' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;
END $$;

-- =====================================================
-- 1. CLAIM PENDING JOBS (ATOMIC)
-- =====================================================
-- Atomically claims a batch of pending jobs by updating their status to 'processing'
-- This prevents race conditions where multiple workers claim the same job

CREATE OR REPLACE FUNCTION claim_pending_jobs(
  p_job_types TEXT[],
  p_batch_size INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  queue_job_id TEXT,
  user_id UUID,
  job_type TEXT,
  metadata JSONB,
  status TEXT,
  priority INTEGER,
  attempts INTEGER,
  max_attempts INTEGER,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
) AS $$
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
      AND queue_jobs.job_type = ANY(p_job_types)
      AND queue_jobs.scheduled_for <= NOW()
    ORDER BY queue_jobs.priority DESC, queue_jobs.scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED  -- Critical: prevents race conditions
  )
  RETURNING
    queue_jobs.id,
    queue_jobs.queue_job_id,
    queue_jobs.user_id,
    queue_jobs.job_type,
    queue_jobs.metadata,
    queue_jobs.status,
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_pending_jobs IS 'Atomically claims a batch of pending jobs for processing, preventing race conditions with SKIP LOCKED';

-- =====================================================
-- 2. COMPLETE QUEUE JOB
-- =====================================================
-- Marks a job as completed with optional result data

CREATE OR REPLACE FUNCTION complete_queue_job(
  p_job_id UUID,
  p_result JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE queue_jobs
  SET
    status = 'completed',
    completed_at = NOW(),
    updated_at = NOW(),
    result = p_result
  WHERE id = p_job_id
    AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION complete_queue_job IS 'Marks a processing job as completed with optional result data';

-- =====================================================
-- 3. FAIL QUEUE JOB
-- =====================================================
-- Marks a job as failed and optionally schedules retry with exponential backoff

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
      failed_at = NOW(),
      updated_at = NOW()
    WHERE id = p_job_id;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fail_queue_job IS 'Marks a job as failed and optionally schedules retry with exponential backoff';

-- =====================================================
-- 4. RESET STALLED JOBS
-- =====================================================
-- Resets jobs that have been processing for too long (likely crashed workers)

CREATE OR REPLACE FUNCTION reset_stalled_jobs(
  p_stall_timeout TEXT DEFAULT '5 minutes'
)
RETURNS INTEGER AS $$
DECLARE
  v_reset_count INTEGER;
BEGIN
  UPDATE queue_jobs
  SET
    status = 'pending',
    started_at = NULL,
    updated_at = NOW()
  WHERE status = 'processing'
    AND started_at < NOW() - p_stall_timeout::INTERVAL;

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;

  IF v_reset_count > 0 THEN
    RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
  END IF;

  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_stalled_jobs IS 'Resets jobs that have been processing longer than the timeout (handles crashed workers)';

-- =====================================================
-- 5. ADD QUEUE JOB (ATOMIC WITH DEDUPLICATION)
-- =====================================================
-- Atomically adds a job with deduplication based on dedup_key

CREATE OR REPLACE FUNCTION add_queue_job(
  p_user_id UUID,
  p_job_type TEXT,
  p_metadata JSONB,
  p_priority INTEGER DEFAULT 10,
  p_scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  p_dedup_key TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_existing_job RECORD;
BEGIN
  -- Check for duplicate if dedup_key provided
  IF p_dedup_key IS NOT NULL THEN
    SELECT id, status INTO v_existing_job
    FROM queue_jobs
    WHERE dedup_key = p_dedup_key
      AND status IN ('pending', 'processing')
    LIMIT 1;

    -- If duplicate found and still active, return existing ID
    IF FOUND THEN
      RETURN v_existing_job.id;
    END IF;
  END IF;

  -- Insert new job
  INSERT INTO queue_jobs (
    user_id,
    job_type,
    metadata,
    priority,
    scheduled_for,
    dedup_key,
    status
  ) VALUES (
    p_user_id,
    p_job_type,
    p_metadata,
    p_priority,
    p_scheduled_for,
    p_dedup_key,
    'pending'
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION add_queue_job IS 'Atomically adds a job to the queue with deduplication support';

-- =====================================================
-- 6. CANCEL JOBS ATOMIC
-- =====================================================
-- Atomically cancels jobs matching specific criteria

CREATE OR REPLACE FUNCTION cancel_jobs_atomic(
  p_user_id UUID,
  p_job_type TEXT,
  p_metadata_filter JSONB DEFAULT NULL,
  p_allowed_statuses TEXT[] DEFAULT ARRAY['pending', 'processing']
)
RETURNS TABLE (
  id UUID,
  queue_job_id TEXT,
  job_type TEXT,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  UPDATE queue_jobs
  SET
    status = 'cancelled',
    updated_at = NOW()
  WHERE queue_jobs.user_id = p_user_id
    AND queue_jobs.job_type = p_job_type
    AND queue_jobs.status = ANY(p_allowed_statuses)
    AND (p_metadata_filter IS NULL OR queue_jobs.metadata @> p_metadata_filter)
  RETURNING
    queue_jobs.id,
    queue_jobs.queue_job_id,
    queue_jobs.job_type,
    queue_jobs.status;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cancel_jobs_atomic IS 'Atomically cancels jobs matching user, type, and optional metadata filter';

-- =====================================================
-- 7. CANCEL BRIEF JOBS FOR DATE (SPECIFIC USE CASE)
-- =====================================================
-- Atomically cancels brief jobs for a specific date (prevents duplicate briefs)

CREATE OR REPLACE FUNCTION cancel_brief_jobs_for_date(
  p_user_id UUID,
  p_brief_date TEXT,
  p_exclude_job_id UUID DEFAULT NULL
)
RETURNS TABLE (
  cancelled_count INTEGER,
  cancelled_job_ids TEXT[]
) AS $$
DECLARE
  v_cancelled_jobs TEXT[];
  v_count INTEGER;
BEGIN
  -- Cancel matching jobs and collect IDs
  WITH cancelled AS (
    UPDATE queue_jobs
    SET
      status = 'cancelled',
      updated_at = NOW(),
      error_message = 'Cancelled: Duplicate brief job for same date'
    WHERE user_id = p_user_id
      AND job_type = 'generate_daily_brief'
      AND status IN ('pending', 'processing')
      AND metadata->>'briefDate' = p_brief_date
      AND (p_exclude_job_id IS NULL OR id != p_exclude_job_id)
    RETURNING queue_job_id
  )
  SELECT
    COUNT(*)::INTEGER,
    ARRAY_AGG(queue_job_id)
  INTO v_count, v_cancelled_jobs
  FROM cancelled;

  RETURN QUERY SELECT v_count, v_cancelled_jobs;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cancel_brief_jobs_for_date IS 'Atomically cancels duplicate brief jobs for a specific date';

-- =====================================================
-- 8. CANCEL JOB WITH REASON
-- =====================================================
-- Cancels a single job with a specific reason

CREATE OR REPLACE FUNCTION cancel_job_with_reason(
  p_job_id UUID,
  p_reason TEXT,
  p_allow_processing BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cancel_job_with_reason IS 'Cancels a single job with a specific reason message';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
-- Re-grant permissions after dropping functions
-- Must specify full function signatures for proper grants

GRANT EXECUTE ON FUNCTION claim_pending_jobs(TEXT[], INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_queue_job(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION fail_queue_job(UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION reset_stalled_jobs(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_jobs_atomic(UUID, TEXT, JSONB, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_brief_jobs_for_date(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_job_with_reason(UUID, TEXT, BOOLEAN) TO service_role;

-- Also allow authenticated users for add_queue_job (web app can queue jobs)
GRANT EXECUTE ON FUNCTION add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT) TO authenticated;

-- =====================================================
-- NOTES
-- =====================================================
-- These functions solve the following race conditions:
--
-- 1. Job Claiming Race: Multiple workers claiming same job
--    - Fixed by claim_pending_jobs() with FOR UPDATE SKIP LOCKED
--
-- 2. Duplicate Job Creation: Multiple identical jobs being created
--    - Fixed by add_queue_job() with dedup_key checking
--
-- 3. Stalled Jobs: Workers crash and jobs stay "processing" forever
--    - Fixed by reset_stalled_jobs() periodic cleanup
--
-- 4. Concurrent Cancellation: Multiple attempts to cancel same job
--    - Fixed by atomic UPDATE in cancel functions
--
-- Migration Strategy:
-- - These functions are backwards compatible
-- - Existing code using direct queries will continue to work
-- - Gradually migrate to use these RPCs for better reliability
