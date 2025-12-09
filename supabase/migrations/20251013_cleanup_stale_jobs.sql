-- supabase/migrations/20251013_cleanup_stale_jobs.sql
-- Migration: Cleanup stale and failed jobs
-- Created: 2025-10-13
-- Purpose: Remove old failed/pending job records to reduce database bloat
--
-- What this migration does:
-- 1. Deletes failed queue_jobs older than 30 days
-- 2. Deletes failed/pending daily_briefs older than 30 days
-- 3. Deletes stuck 'processing' daily_briefs older than 7 days
-- 4. Deletes failed/pending project_daily_briefs older than 30 days
--
-- Safety: Only removes failed/pending/stuck records, keeps all completed/successful data

BEGIN;

-- Track what we're about to delete (for logging)
DO $$
DECLARE
  queue_jobs_count INTEGER;
  daily_briefs_count INTEGER;
  project_briefs_count INTEGER;
BEGIN
  -- Count records to be deleted
  SELECT COUNT(*) INTO queue_jobs_count
  FROM queue_jobs
  WHERE status = 'failed'
    AND created_at < NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO daily_briefs_count
  FROM daily_briefs
  WHERE (
    (generation_status IN ('failed', 'pending') AND created_at < NOW() - INTERVAL '30 days')
    OR
    (generation_status = 'processing' AND created_at < NOW() - INTERVAL '7 days')
  );

  SELECT COUNT(*) INTO project_briefs_count
  FROM project_daily_briefs
  WHERE generation_status IN ('failed', 'pending')
    AND created_at < NOW() - INTERVAL '30 days';

  RAISE NOTICE 'Cleanup Migration - Records to delete:';
  RAISE NOTICE '  Queue jobs (failed >30d): %', queue_jobs_count;
  RAISE NOTICE '  Daily briefs (failed/pending/stuck): %', daily_briefs_count;
  RAISE NOTICE '  Project briefs (failed/pending >30d): %', project_briefs_count;
  RAISE NOTICE '  Total: %', queue_jobs_count + daily_briefs_count + project_briefs_count;
END $$;

-- 1. Delete failed queue jobs older than 30 days
DELETE FROM queue_jobs
WHERE status = 'failed'
  AND created_at < NOW() - INTERVAL '30 days';

-- 2. Delete failed/pending daily briefs older than 30 days
-- Also delete stuck 'processing' briefs older than 7 days (likely failed)
DELETE FROM daily_briefs
WHERE (
  (generation_status IN ('failed', 'pending') AND created_at < NOW() - INTERVAL '30 days')
  OR
  (generation_status = 'processing' AND created_at < NOW() - INTERVAL '7 days')
);

-- 3. Delete failed/pending project daily briefs older than 30 days
DELETE FROM project_daily_briefs
WHERE generation_status IN ('failed', 'pending')
  AND created_at < NOW() - INTERVAL '30 days';

-- Verify cleanup
DO $$
DECLARE
  remaining_failed_jobs INTEGER;
  remaining_failed_briefs INTEGER;
  remaining_failed_project_briefs INTEGER;
BEGIN
  -- Count remaining old failed records
  SELECT COUNT(*) INTO remaining_failed_jobs
  FROM queue_jobs
  WHERE status = 'failed'
    AND created_at < NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO remaining_failed_briefs
  FROM daily_briefs
  WHERE (
    (generation_status IN ('failed', 'pending') AND created_at < NOW() - INTERVAL '30 days')
    OR
    (generation_status = 'processing' AND created_at < NOW() - INTERVAL '7 days')
  );

  SELECT COUNT(*) INTO remaining_failed_project_briefs
  FROM project_daily_briefs
  WHERE generation_status IN ('failed', 'pending')
    AND created_at < NOW() - INTERVAL '30 days';

  RAISE NOTICE 'Cleanup complete. Remaining old records:';
  RAISE NOTICE '  Queue jobs: %', remaining_failed_jobs;
  RAISE NOTICE '  Daily briefs: %', remaining_failed_briefs;
  RAISE NOTICE '  Project briefs: %', remaining_failed_project_briefs;

  -- Fail if cleanup didn't work
  IF remaining_failed_jobs > 0 OR remaining_failed_briefs > 0 OR remaining_failed_project_briefs > 0 THEN
    RAISE WARNING 'Some records remain - this may be expected if they were created during migration';
  END IF;
END $$;

COMMIT;
