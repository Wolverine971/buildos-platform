-- =====================================================
-- FIX QUEUE JOB DEDUPLICATION RACE CONDITION
-- =====================================================
-- Fixes Time-of-Check-Time-of-Use (TOCTOU) race condition in add_queue_job()
--
-- Issue: Multiple concurrent calls can create duplicate jobs with same dedup_key
-- Solution: Partial unique index + INSERT ON CONFLICT pattern
--
-- Changes:
-- 1. Cancel existing duplicate jobs (keep oldest per dedup_key)
-- 2. Create partial unique index on active jobs (pending/processing)
-- 3. Update add_queue_job() to use INSERT ON CONFLICT
-- 4. Add monitoring/logging for conflict detection
-- 5. Drop old non-unique index
--
-- Migration Date: 2025-10-21
-- Related Bug: Queue Job Deduplication Race Condition - DATA CORRUPTION
-- Reference: /thoughts/shared/research/2025-10-21_17-04-05_comprehensive-codebase-audit.md
--
-- =====================================================
-- DEPLOYMENT INSTRUCTIONS
-- =====================================================
--
-- STANDARD DEPLOYMENT (Has brief lock during index creation - ~1-5 seconds):
--   - Run this migration file normally
--   - Brief exclusive lock while creating unique index
--   - Acceptable for most deployments since queue_jobs table is typically small
--
-- ZERO-DOWNTIME DEPLOYMENT (For high-traffic production):
--   See: apps/web/supabase/migrations/20251021_fix_queue_job_deduplication_race_CONCURRENT.sql
--   Requires manual execution outside transaction block
--
-- This file uses regular CREATE INDEX (non-CONCURRENT) for compatibility
-- with migration tools that wrap statements in transactions.
--
-- =====================================================

-- =====================================================
-- STEP 1: IDENTIFY AND CANCEL EXISTING DUPLICATES
-- =====================================================
-- Strategy: For each dedup_key with duplicates in pending/processing status,
-- keep the oldest job (earliest created_at) and cancel the rest

DO $$
DECLARE
  v_cancelled_count INTEGER := 0;
  v_duplicate_record RECORD;
BEGIN
  RAISE NOTICE '🔍 Step 1: Identifying and cancelling duplicate jobs...';

  -- Find and cancel duplicate jobs (keep oldest, cancel newer ones)
  WITH duplicates AS (
    -- Find dedup_keys that have multiple active jobs
    SELECT
      dedup_key,
      COUNT(*) as duplicate_count
    FROM queue_jobs
    WHERE dedup_key IS NOT NULL
      AND status IN ('pending', 'processing')
    GROUP BY dedup_key
    HAVING COUNT(*) > 1
  ),
  jobs_to_cancel AS (
    -- For each duplicate dedup_key, get all but the oldest job
    SELECT
      qj.id,
      qj.queue_job_id,
      qj.dedup_key,
      qj.job_type,
      qj.created_at,
      qj.status
    FROM queue_jobs qj
    INNER JOIN duplicates d ON qj.dedup_key = d.dedup_key
    WHERE qj.status IN ('pending', 'processing')
      AND qj.id NOT IN (
        -- Keep the oldest job for each dedup_key
        SELECT DISTINCT ON (dedup_key) id
        FROM queue_jobs
        WHERE dedup_key IS NOT NULL
          AND status IN ('pending', 'processing')
        ORDER BY dedup_key, created_at ASC
      )
  ),
  cancelled_jobs AS (
    -- Cancel the duplicate jobs
    UPDATE queue_jobs
    SET
      status = 'cancelled',
      error_message = 'Cancelled by migration: Duplicate job detected. Race condition fix applied.',
      updated_at = NOW()
    FROM jobs_to_cancel jtc
    WHERE queue_jobs.id = jtc.id
    RETURNING
      queue_jobs.id,
      queue_jobs.queue_job_id,
      queue_jobs.dedup_key,
      queue_jobs.job_type
  )
  SELECT COUNT(*) INTO v_cancelled_count FROM cancelled_jobs;

  -- Log the results
  IF v_cancelled_count > 0 THEN
    RAISE NOTICE '✅ Cancelled % duplicate jobs', v_cancelled_count;

    -- Log details of cancelled jobs for audit trail
    FOR v_duplicate_record IN
      SELECT
        dedup_key,
        COUNT(*) as cancelled_count
      FROM queue_jobs
      WHERE status = 'cancelled'
        AND error_message LIKE '%Duplicate job detected. Race condition fix%'
      GROUP BY dedup_key
      ORDER BY cancelled_count DESC
      LIMIT 10
    LOOP
      RAISE NOTICE '   - dedup_key: % (% duplicates cancelled)',
        v_duplicate_record.dedup_key,
        v_duplicate_record.cancelled_count;
    END LOOP;
  ELSE
    RAISE NOTICE '✅ No duplicate jobs found - database is clean';
  END IF;

END $$;

-- =====================================================
-- STEP 2: CREATE PARTIAL UNIQUE INDEX
-- =====================================================
-- This creates a unique index with a brief exclusive lock (1-5 seconds typically)
-- For zero-downtime deployment in high-traffic production, use the CONCURRENT version

-- Drop the old non-unique index first (if it exists)
DROP INDEX IF EXISTS idx_queue_jobs_dedup_key;

-- Create new partial unique index
-- This will acquire a brief exclusive lock on the queue_jobs table
-- Lock duration depends on table size (typically 1-5 seconds for queue tables)
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_jobs_dedup_key_unique
ON queue_jobs(dedup_key)
WHERE dedup_key IS NOT NULL
  AND status IN ('pending', 'processing');

-- Add comment explaining the constraint
COMMENT ON INDEX idx_queue_jobs_dedup_key_unique IS
'Partial unique index preventing duplicate active jobs with same dedup_key.
Only applies to pending/processing jobs, allowing historical duplicates in completed/failed status.
Created: 2025-10-21 to fix TOCTOU race condition in add_queue_job().
Version: Standard (brief lock during creation - acceptable for most deployments)';

-- =====================================================
-- STEP 3: UPDATE add_queue_job() FUNCTION
-- =====================================================
-- Replace SELECT + INSERT pattern with atomic INSERT ON CONFLICT
-- Add logging to track when deduplication prevents duplicate jobs

-- Drop existing function
DROP FUNCTION IF EXISTS add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT);

-- Create updated function with atomic deduplication
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
  v_queue_job_id TEXT;
  v_is_duplicate BOOLEAN := FALSE;
BEGIN
  -- Generate a unique queue_job_id with job type prefix
  -- Format: {job_type}_{random_uuid}
  v_queue_job_id := p_job_type || '_' || gen_random_uuid()::text;

  -- Attempt atomic insert with conflict handling
  -- ON CONFLICT prevents race condition - database enforces uniqueness
  INSERT INTO queue_jobs (
    user_id,
    job_type,
    metadata,
    priority,
    scheduled_for,
    dedup_key,
    status,
    queue_job_id
  ) VALUES (
    p_user_id,
    p_job_type::queue_type,  -- FIXED: Cast TEXT to queue_type enum
    p_metadata,
    p_priority,
    p_scheduled_for,
    p_dedup_key,
    'pending'::queue_status,  -- FIXED: Cast TEXT to queue_status enum
    v_queue_job_id  -- FIXED: Auto-generate queue_job_id
  )
  ON CONFLICT (dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
  DO NOTHING
  RETURNING id INTO v_job_id;

  -- If conflict occurred (no id returned), fetch existing job
  IF v_job_id IS NULL AND p_dedup_key IS NOT NULL THEN
    v_is_duplicate := TRUE;

    SELECT id INTO v_job_id
    FROM queue_jobs
    WHERE dedup_key = p_dedup_key
      AND status IN ('pending', 'processing')
    ORDER BY created_at ASC  -- Return oldest job if somehow multiple exist
    LIMIT 1;

    -- Log deduplication event for monitoring (Decision 3: Option A)
    RAISE NOTICE 'DEDUP_EVENT: Prevented duplicate job creation - job_type: %, dedup_key: %, existing_job_id: %',
      p_job_type,
      p_dedup_key,
      v_job_id;
  END IF;

  -- If still no job found (edge case), raise error
  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create or find job with dedup_key: %', p_dedup_key;
  END IF;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Update function comment
COMMENT ON FUNCTION add_queue_job IS
'Atomically adds a job to the queue with race-condition-free deduplication.
Uses partial unique index on dedup_key to prevent duplicate active jobs.
On conflict, returns existing job ID and logs DEDUP_EVENT for monitoring.
Fixed: 2025-10-21 - TOCTOU race condition eliminated.';

-- =====================================================
-- STEP 4: RE-GRANT PERMISSIONS
-- =====================================================
-- Re-grant permissions after dropping and recreating function

GRANT EXECUTE ON FUNCTION add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT) TO authenticated;

-- =====================================================
-- STEP 5: VERIFICATION QUERIES
-- =====================================================
-- Run these queries after migration to verify the fix is working:
--
-- 1. Check for any remaining active duplicates:
--    SELECT dedup_key, COUNT(*) FROM queue_jobs
--    WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
--    GROUP BY dedup_key HAVING COUNT(*) > 1;
--
-- 2. Verify index exists:
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'queue_jobs' AND indexname LIKE '%dedup%';
--
-- 3. Test deduplication:
--    SELECT add_queue_job('00000000-0000-0000-0000-000000000000'::uuid,
--                         'test_job', '{}'::jsonb, 10, NOW(),
--                         'test-dedup-key-' || NOW()::text);
--
-- 4. Monitor deduplication events in logs:
--    Look for "DEDUP_EVENT: Prevented duplicate job creation" messages

-- =====================================================
-- MIGRATION SUMMARY
-- =====================================================

DO $$
DECLARE
  v_active_jobs_count INTEGER;
  v_unique_dedup_keys INTEGER;
  v_index_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRATION SUMMARY';
  RAISE NOTICE '========================================';

  -- Count active jobs
  SELECT COUNT(*) INTO v_active_jobs_count
  FROM queue_jobs
  WHERE status IN ('pending', 'processing');

  -- Count unique dedup keys
  SELECT COUNT(DISTINCT dedup_key) INTO v_unique_dedup_keys
  FROM queue_jobs
  WHERE dedup_key IS NOT NULL
    AND status IN ('pending', 'processing');

  -- Check index exists
  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'queue_jobs'
      AND indexname = 'idx_queue_jobs_dedup_key_unique'
  ) INTO v_index_exists;

  RAISE NOTICE '📊 Current State:';
  RAISE NOTICE '   - Active jobs (pending/processing): %', v_active_jobs_count;
  RAISE NOTICE '   - Unique dedup_keys in active jobs: %', v_unique_dedup_keys;
  RAISE NOTICE '   - Partial unique index exists: %', v_index_exists;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Race condition fix applied successfully';
  RAISE NOTICE '✅ Database enforces deduplication atomically';
  RAISE NOTICE '✅ Monitoring enabled via DEDUP_EVENT logs';
  RAISE NOTICE '========================================';
END $$;

-- =====================================================
-- NOTES FOR FUTURE REFERENCE
-- =====================================================
-- This migration fixes the following race condition:
--
-- BEFORE (Race Condition):
--   Thread A: SELECT dedup_key (not found)
--   Thread B: SELECT dedup_key (not found)  <- Gap allows race
--   Thread A: INSERT new job
--   Thread B: INSERT new job  <- DUPLICATE CREATED
--
-- AFTER (Atomic):
--   Thread A: INSERT ON CONFLICT (succeeds)
--   Thread B: INSERT ON CONFLICT (conflicts, returns existing ID)
--   Result: Only one job created, both threads get same job_id
--
-- The partial unique index ensures:
-- - No duplicate active jobs (pending/processing) with same dedup_key
-- - Historical jobs (completed/failed) can have same dedup_key
-- - Zero-downtime deployment via CREATE INDEX CONCURRENTLY
--
-- Monitoring:
-- - Watch for "DEDUP_EVENT" in logs to see deduplication in action
-- - Indicates how often race condition would have created duplicates
--
-- Testing:
-- - Run concurrent add_queue_job() calls with same dedup_key
-- - Verify only one job created and both calls return same job_id
-- - Check database shows no active duplicates
-- =====================================================
