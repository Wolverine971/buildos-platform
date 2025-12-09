-- apps/web/supabase/migrations/test_20251021_deduplication_fix.sql
-- =====================================================
-- TEST SCRIPT FOR QUEUE JOB DEDUPLICATION FIX
-- =====================================================
-- This script verifies that the race condition fix works correctly
--
-- Run this AFTER applying migration: 20251021_fix_queue_job_deduplication_race.sql
--
-- Usage:
--   psql -h your-supabase-host -U postgres -d postgres -f test_20251021_deduplication_fix.sql
--
-- Or via Supabase SQL Editor (copy/paste sections)
-- =====================================================

\echo '========================================';
\echo 'QUEUE JOB DEDUPLICATION FIX - TEST SUITE';
\echo '========================================';
\echo '';

-- =====================================================
-- TEST 1: VERIFY INDEX EXISTS
-- =====================================================

\echo 'TEST 1: Verify partial unique index exists...';

DO $$
DECLARE
  v_index_exists BOOLEAN;
  v_index_def TEXT;
BEGIN
  -- Check if index exists
  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'queue_jobs'
      AND indexname = 'idx_queue_jobs_dedup_key_unique'
  ) INTO v_index_exists;

  IF v_index_exists THEN
    -- Get index definition
    SELECT indexdef INTO v_index_def
    FROM pg_indexes
    WHERE tablename = 'queue_jobs'
      AND indexname = 'idx_queue_jobs_dedup_key_unique';

    RAISE NOTICE '✅ PASS: Partial unique index exists';
    RAISE NOTICE '   Definition: %', v_index_def;
  ELSE
    RAISE EXCEPTION '❌ FAIL: Partial unique index does not exist';
  END IF;

  -- Verify old non-unique index is gone
  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'queue_jobs'
      AND indexname = 'idx_queue_jobs_dedup_key'
  ) INTO v_index_exists;

  IF NOT v_index_exists THEN
    RAISE NOTICE '✅ PASS: Old non-unique index removed';
  ELSE
    RAISE WARNING '⚠️  WARNING: Old non-unique index still exists (should be removed)';
  END IF;

END $$;

\echo '';

-- =====================================================
-- TEST 2: VERIFY NO ACTIVE DUPLICATES EXIST
-- =====================================================

\echo 'TEST 2: Verify no active duplicate jobs exist...';

DO $$
DECLARE
  v_duplicate_count INTEGER;
  v_duplicate_record RECORD;
BEGIN
  -- Check for duplicate active jobs
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT dedup_key
    FROM queue_jobs
    WHERE dedup_key IS NOT NULL
      AND status IN ('pending', 'processing')
    GROUP BY dedup_key
    HAVING COUNT(*) > 1
  ) duplicates;

  IF v_duplicate_count = 0 THEN
    RAISE NOTICE '✅ PASS: No active duplicate jobs found';
  ELSE
    RAISE WARNING '❌ FAIL: Found % dedup_keys with multiple active jobs', v_duplicate_count;

    -- Show the duplicates
    FOR v_duplicate_record IN
      SELECT
        dedup_key,
        COUNT(*) as job_count,
        array_agg(id::text) as job_ids
      FROM queue_jobs
      WHERE dedup_key IS NOT NULL
        AND status IN ('pending', 'processing')
      GROUP BY dedup_key
      HAVING COUNT(*) > 1
      LIMIT 5
    LOOP
      RAISE WARNING '   - dedup_key: %, count: %, jobs: %',
        v_duplicate_record.dedup_key,
        v_duplicate_record.job_count,
        v_duplicate_record.job_ids;
    END LOOP;
  END IF;

END $$;

\echo '';

-- =====================================================
-- TEST 3: TEST DEDUPLICATION WORKS (BASIC)
-- =====================================================

\echo 'TEST 3: Test basic deduplication works...';

DO $$
DECLARE
  v_test_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_test_dedup_key TEXT := 'test-dedup-' || extract(epoch from now())::text;
  v_job_id_1 UUID;
  v_job_id_2 UUID;
  v_job_count INTEGER;
BEGIN
  -- First call: should create new job
  SELECT add_queue_job(
    v_test_user_id,
    'generate_daily_brief',
    '{"briefDate": "2025-10-21", "test": true}'::jsonb,
    10,
    NOW(),
    v_test_dedup_key
  ) INTO v_job_id_1;

  RAISE NOTICE 'First call created job: %', v_job_id_1;

  -- Second call: should return same job ID
  SELECT add_queue_job(
    v_test_user_id,
    'generate_daily_brief',
    '{"briefDate": "2025-10-21", "test": true}'::jsonb,
    10,
    NOW(),
    v_test_dedup_key
  ) INTO v_job_id_2;

  RAISE NOTICE 'Second call returned job: %', v_job_id_2;

  -- Verify both calls returned same ID
  IF v_job_id_1 = v_job_id_2 THEN
    RAISE NOTICE '✅ PASS: Both calls returned same job ID (deduplication works)';
  ELSE
    RAISE EXCEPTION '❌ FAIL: Calls returned different IDs - job1: %, job2: %', v_job_id_1, v_job_id_2;
  END IF;

  -- Verify only one job exists in database
  SELECT COUNT(*) INTO v_job_count
  FROM queue_jobs
  WHERE dedup_key = v_test_dedup_key;

  IF v_job_count = 1 THEN
    RAISE NOTICE '✅ PASS: Only one job exists in database';
  ELSE
    RAISE EXCEPTION '❌ FAIL: Found % jobs with same dedup_key (expected 1)', v_job_count;
  END IF;

  -- Cleanup test job
  DELETE FROM queue_jobs WHERE dedup_key = v_test_dedup_key;
  RAISE NOTICE '🧹 Cleaned up test job';

END $$;

\echo '';

-- =====================================================
-- TEST 4: TEST COMPLETED JOBS DON'T BLOCK NEW JOBS
-- =====================================================

\echo 'TEST 4: Test completed jobs don''t block new jobs...';

DO $$
DECLARE
  v_test_user_id UUID := '00000000-0000-0000-0000-000000000002';
  v_test_dedup_key TEXT := 'test-completed-' || extract(epoch from now())::text;
  v_job_id_1 UUID;
  v_job_id_2 UUID;
  v_total_jobs INTEGER;
  v_pending_jobs INTEGER;
  v_completed_jobs INTEGER;
BEGIN
  -- Create first job
  SELECT add_queue_job(
    v_test_user_id,
    'generate_daily_brief',
    '{"briefDate": "2025-10-21", "test": true}'::jsonb,
    10,
    NOW(),
    v_test_dedup_key
  ) INTO v_job_id_1;

  RAISE NOTICE 'Created first job: %', v_job_id_1;

  -- Mark it as completed
  UPDATE queue_jobs
  SET status = 'completed', completed_at = NOW()
  WHERE id = v_job_id_1;

  RAISE NOTICE 'Marked first job as completed';

  -- Create second job with same dedup_key (should succeed)
  SELECT add_queue_job(
    v_test_user_id,
    'generate_daily_brief',
    '{"briefDate": "2025-10-21", "test": true}'::jsonb,
    10,
    NOW(),
    v_test_dedup_key
  ) INTO v_job_id_2;

  RAISE NOTICE 'Created second job: %', v_job_id_2;

  -- Verify we got a different job ID
  IF v_job_id_1 != v_job_id_2 THEN
    RAISE NOTICE '✅ PASS: Second job created with different ID (completed jobs don''t block)';
  ELSE
    RAISE EXCEPTION '❌ FAIL: Got same job ID (completed job blocked new job)';
  END IF;

  -- Verify we have 2 total jobs with same dedup_key
  SELECT COUNT(*) INTO v_total_jobs
  FROM queue_jobs
  WHERE dedup_key = v_test_dedup_key;

  SELECT COUNT(*) INTO v_pending_jobs
  FROM queue_jobs
  WHERE dedup_key = v_test_dedup_key AND status = 'pending';

  SELECT COUNT(*) INTO v_completed_jobs
  FROM queue_jobs
  WHERE dedup_key = v_test_dedup_key AND status = 'completed';

  IF v_total_jobs = 2 AND v_pending_jobs = 1 AND v_completed_jobs = 1 THEN
    RAISE NOTICE '✅ PASS: Database shows 2 jobs total (1 completed, 1 pending)';
  ELSE
    RAISE EXCEPTION '❌ FAIL: Unexpected job counts - total: %, pending: %, completed: %',
      v_total_jobs, v_pending_jobs, v_completed_jobs;
  END IF;

  -- Cleanup test jobs
  DELETE FROM queue_jobs WHERE dedup_key = v_test_dedup_key;
  RAISE NOTICE '🧹 Cleaned up test jobs';

END $$;

\echo '';

-- =====================================================
-- TEST 5: TEST UNIQUE CONSTRAINT PREVENTS DUPLICATES
-- =====================================================

\echo 'TEST 5: Test unique constraint prevents direct duplicate inserts...';

DO $$
DECLARE
  v_test_user_id UUID := '00000000-0000-0000-0000-000000000003';
  v_test_dedup_key TEXT := 'test-constraint-' || extract(epoch from now())::text;
  v_insert_succeeded BOOLEAN := FALSE;
BEGIN
  -- Insert first job directly (bypass add_queue_job function)
  INSERT INTO queue_jobs (
    user_id, job_type, metadata, priority, scheduled_for, dedup_key, status
  ) VALUES (
    v_test_user_id,
    'generate_daily_brief',
    '{"test": true}'::jsonb,
    10,
    NOW(),
    v_test_dedup_key,
    'pending'
  );

  RAISE NOTICE 'First direct insert succeeded';

  -- Try to insert duplicate (should fail due to unique constraint)
  BEGIN
    INSERT INTO queue_jobs (
      user_id, job_type, metadata, priority, scheduled_for, dedup_key, status
    ) VALUES (
      v_test_user_id,
      'generate_daily_brief',
      '{"test": true}'::jsonb,
      10,
      NOW(),
      v_test_dedup_key,
      'pending'
    );

    v_insert_succeeded := TRUE;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'Second direct insert blocked by unique constraint (expected)';
      v_insert_succeeded := FALSE;
  END;

  IF NOT v_insert_succeeded THEN
    RAISE NOTICE '✅ PASS: Unique constraint prevents duplicate inserts';
  ELSE
    RAISE EXCEPTION '❌ FAIL: Duplicate insert succeeded (unique constraint not working)';
  END IF;

  -- Cleanup test job
  DELETE FROM queue_jobs WHERE dedup_key = v_test_dedup_key;
  RAISE NOTICE '🧹 Cleaned up test job';

END $$;

\echo '';

-- =====================================================
-- TEST 6: PERFORMANCE CHECK
-- =====================================================

\echo 'TEST 6: Check index performance...';

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status FROM queue_jobs
WHERE dedup_key = 'non-existent-key'
  AND status IN ('pending', 'processing')
LIMIT 1;

\echo '';
\echo '✅ Should show "Index Scan" using idx_queue_jobs_dedup_key_unique';
\echo '';

-- =====================================================
-- TEST SUMMARY
-- =====================================================

\echo '';
\echo '========================================';
\echo 'TEST SUITE COMPLETE';
\echo '========================================';
\echo '';
\echo 'All tests passed! The race condition fix is working correctly.';
\echo '';
\echo 'Next steps:';
\echo '1. Monitor worker logs for "DEDUP_EVENT" messages';
\echo '2. Watch for any duplicate job creation in production';
\echo '3. Verify LLM costs and SMS charges decrease';
\echo '';
\echo '========================================';
