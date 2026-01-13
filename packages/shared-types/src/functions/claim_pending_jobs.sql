-- packages/shared-types/src/functions/claim_pending_jobs.sql
-- claim_pending_jobs(text[], integer)
-- Claim pending jobs for processing
-- Source: apps/web/supabase/migrations/20251011_atomic_queue_job_operations.sql

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
    queue_jobs.job_type::TEXT,
    queue_jobs.metadata,
    queue_jobs.status::TEXT,
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
