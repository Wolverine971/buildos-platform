-- =====================================================
-- FIX QUEUE STATUS COMPARISON
-- =====================================================
-- Fixes type mismatch error in claim_pending_jobs function
-- Issue: status is a queue_status ENUM, but return type expects TEXT
-- Solution: Cast the enum to text in RETURNING clause
-- =====================================================

-- Drop existing function
DROP FUNCTION IF EXISTS claim_pending_jobs(TEXT[], INTEGER);

-- Recreate with proper type casting for BOTH job_type AND status
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
      AND queue_jobs.job_type::TEXT = ANY(p_job_types)
      AND queue_jobs.scheduled_for <= NOW()
    ORDER BY queue_jobs.priority DESC, queue_jobs.scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    queue_jobs.id,
    queue_jobs.queue_job_id,
    queue_jobs.user_id,
    queue_jobs.job_type::TEXT,     -- Cast enum to text
    queue_jobs.metadata,
    queue_jobs.status::TEXT,       -- FIXED: Cast enum to text
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

COMMENT ON FUNCTION claim_pending_jobs IS 'Atomically claims a batch of pending jobs for processing (FIXED: proper enum to text casting for both job_type and status)';

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION claim_pending_jobs(TEXT[], INTEGER) TO service_role;
