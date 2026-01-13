-- packages/shared-types/src/functions/cancel_job_with_reason.sql
-- cancel_job_with_reason(uuid, text, boolean)
-- Cancel a job with reason
-- Source: apps/web/supabase/migrations/20251011_atomic_queue_job_operations.sql

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
