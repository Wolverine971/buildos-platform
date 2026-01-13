-- packages/shared-types/src/functions/complete_queue_job.sql
-- complete_queue_job(uuid, jsonb)
-- Mark queue job as complete
-- Source: apps/web/supabase/migrations/20251011_atomic_queue_job_operations.sql

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
