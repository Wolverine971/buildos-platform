-- packages/shared-types/src/functions/cancel_brief_jobs_for_date.sql
-- cancel_brief_jobs_for_date(uuid, text, uuid)
-- Cancel brief jobs for a date
-- Source: apps/web/supabase/migrations/20251011_atomic_queue_job_operations.sql

CREATE OR REPLACE FUNCTION cancel_brief_jobs_for_date(
  p_user_id UUID,
  p_brief_date TEXT,
  p_exclude_job_id UUID DEFAULT NULL
)
RETURNS TABLE (
  cancelled_count INTEGER,
  cancelled_job_ids TEXT[]
) AS $$
DECLARE
  v_cancelled_jobs TEXT[];
  v_count INTEGER;
BEGIN
  -- Cancel matching jobs and collect IDs
  WITH cancelled AS (
    UPDATE queue_jobs
    SET
      status = 'cancelled',
      updated_at = NOW(),
      error_message = 'Cancelled: Duplicate brief job for same date'
    WHERE user_id = p_user_id
      AND job_type = 'generate_daily_brief'
      AND status IN ('pending', 'processing')
      AND metadata->>'briefDate' = p_brief_date
      AND (p_exclude_job_id IS NULL OR id != p_exclude_job_id)
    RETURNING queue_job_id
  )
  SELECT
    COUNT(*)::INTEGER,
    ARRAY_AGG(queue_job_id)
  INTO v_count, v_cancelled_jobs
  FROM cancelled;

  RETURN QUERY SELECT v_count, v_cancelled_jobs;
END;
$$ LANGUAGE plpgsql;
