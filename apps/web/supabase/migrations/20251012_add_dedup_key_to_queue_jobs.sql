-- =====================================================
-- ADD DEDUP_KEY COLUMN TO QUEUE_JOBS
-- =====================================================
-- Adds deduplication key column to prevent duplicate job creation
-- Required by add_queue_job() RPC function for atomic job insertion
-- =====================================================

-- Add dedup_key column
ALTER TABLE queue_jobs
ADD COLUMN IF NOT EXISTS dedup_key TEXT;

-- Create index for efficient deduplication lookups
CREATE INDEX IF NOT EXISTS idx_queue_jobs_dedup_key
ON queue_jobs(dedup_key)
WHERE dedup_key IS NOT NULL;

-- Add column comment
COMMENT ON COLUMN queue_jobs.dedup_key IS
'Deduplication key to prevent creating duplicate jobs. Used by add_queue_job() to check for existing active jobs with the same key.';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- This column is used by the add_queue_job() function from
-- migration 20251011_atomic_queue_job_operations.sql
-- =====================================================
