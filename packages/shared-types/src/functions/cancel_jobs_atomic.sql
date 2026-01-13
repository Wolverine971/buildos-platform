-- packages/shared-types/src/functions/cancel_jobs_atomic.sql
-- cancel_jobs_atomic(uuid, text, jsonb, text[])
-- Atomically cancel multiple jobs
-- Source: apps/web/supabase/migrations/20251011_atomic_queue_job_operations.sql

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
