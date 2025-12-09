-- apps/web/supabase/migrations/20251021_fix_queue_job_deduplication_race_CONCURRENT.sql
-- =====================================================
-- FIX QUEUE JOB DEDUPLICATION RACE CONDITION (CONCURRENT VERSION)
-- =====================================================
-- TRUE ZERO-DOWNTIME VERSION using CREATE INDEX CONCURRENTLY
--
-- Use this version for high-traffic production environments where you
-- cannot tolerate even a brief lock on the queue_jobs table.
--
-- IMPORTANT: This version MUST be run outside a transaction block
--
-- =====================================================
-- DEPLOYMENT INSTRUCTIONS FOR CONCURRENT VERSION
-- =====================================================
--
-- This file contains statements that CANNOT run inside transaction blocks.
-- You MUST execute them with autocommit enabled.
--
-- METHOD 1: psql with AUTOCOMMIT (Production-safe)
--   psql -h your-host -U postgres -d postgres \
--     --set AUTOCOMMIT=on \
--     -f apps/web/supabase/migrations/20251021_fix_queue_job_deduplication_race_CONCURRENT.sql
--
-- METHOD 2: Execute statements individually
--   Copy each section below and paste into Supabase Dashboard SQL Editor
--   Run each section separately (they are already separated by -- STEP comments)
--
-- DO NOT USE:
--   - supabase db push (wraps in transaction)
--   - psql without --set AUTOCOMMIT=on (wraps in transaction)
--   - Any tool that wraps statements in BEGIN/COMMIT
--
-- =====================================================

-- =====================================================
-- PREREQUISITE: Run the main migration first
-- =====================================================
-- Before running this CONCURRENT version, you should have already run:
--   20251021_fix_queue_job_deduplication_race.sql
--
-- This creates the function and cancels duplicates.
-- This CONCURRENT file ONLY recreates the index using CONCURRENTLY.
-- =====================================================

-- =====================================================
-- STEP 1: DROP EXISTING INDEX (if created by main migration)
-- =====================================================
-- If you ran the standard migration first, drop its index
-- This is fast and non-blocking since we're dropping, not creating
DROP INDEX IF EXISTS idx_queue_jobs_dedup_key_unique;

-- Also drop the old non-unique index if it exists
DROP INDEX IF EXISTS idx_queue_jobs_dedup_key;

-- =====================================================
-- STEP 2: CREATE UNIQUE INDEX CONCURRENTLY
-- =====================================================
-- This is the zero-downtime version
-- Can take several minutes on large tables but doesn't block operations
-- PostgreSQL will allow reads and writes during index creation

CREATE UNIQUE INDEX CONCURRENTLY idx_queue_jobs_dedup_key_unique
ON queue_jobs(dedup_key)
WHERE dedup_key IS NOT NULL
  AND status IN ('pending', 'processing');

-- Add comment explaining the constraint
COMMENT ON INDEX idx_queue_jobs_dedup_key_unique IS
'Partial unique index preventing duplicate active jobs with same dedup_key.
Only applies to pending/processing jobs, allowing historical duplicates in completed/failed status.
Created: 2025-10-21 to fix TOCTOU race condition in add_queue_job().
Version: CONCURRENT (zero-downtime)';

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Verify the index was created successfully
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'queue_jobs'
  AND indexname = 'idx_queue_jobs_dedup_key_unique';

-- Expected output: Should show the index definition with UNIQUE and WHERE clause

-- =====================================================
-- NOTES
-- =====================================================
--
-- CONCURRENTLY creates the index without blocking reads/writes but:
-- 1. Takes longer than regular CREATE INDEX
-- 2. Uses more CPU and I/O
-- 3. Cannot run in transaction blocks
-- 4. If it fails, may leave an INVALID index that needs cleanup:
--    DROP INDEX CONCURRENTLY idx_queue_jobs_dedup_key_unique;
--
-- Monitor progress:
--   SELECT * FROM pg_stat_progress_create_index;
--
-- =====================================================
