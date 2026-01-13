-- packages/shared-types/src/functions/reset_stalled_jobs.sql
-- reset_stalled_jobs(text)
-- Reset stalled jobs
-- Source: apps/web/supabase/migrations/20251011_atomic_queue_job_operations.sql

CREATE OR REPLACE FUNCTION reset_stalled_jobs(
  p_stall_timeout TEXT DEFAULT '5 minutes'
)
RETURNS INTEGER AS $$
DECLARE
  v_reset_count INTEGER;
BEGIN
  UPDATE queue_jobs
  SET
    status = 'pending',
    started_at = NULL,
    updated_at = NOW()
  WHERE status = 'processing'
    AND started_at < NOW() - p_stall_timeout::INTERVAL;

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;

  IF v_reset_count > 0 THEN
    RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
  END IF;

  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql;
