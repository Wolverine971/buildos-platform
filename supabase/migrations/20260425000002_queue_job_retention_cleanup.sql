-- supabase/migrations/20260425000002_queue_job_retention_cleanup.sql
-- Add queue retention helper for deleting very old completed jobs in batches.

CREATE INDEX IF NOT EXISTS idx_queue_jobs_completed_retention
  ON queue_jobs(completed_at, id)
  WHERE status = 'completed';

CREATE OR REPLACE FUNCTION public.delete_old_completed_queue_jobs(
  p_retention_days integer DEFAULT 30,
  p_batch_size integer DEFAULT 500,
  p_job_types text[] DEFAULT NULL
)
RETURNS TABLE(
  deleted_count integer,
  oldest_deleted_completed_at timestamptz,
  newest_deleted_completed_at timestamptz
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_retention_days integer := GREATEST(COALESCE(p_retention_days, 0), 0);
  v_batch_size integer := GREATEST(COALESCE(p_batch_size, 500), 1);
BEGIN
  IF v_retention_days = 0 THEN
    RETURN QUERY
    SELECT
      0::integer,
      NULL::timestamptz,
      NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT q.id, q.completed_at
    FROM queue_jobs q
    WHERE q.status = 'completed'
      AND q.completed_at IS NOT NULL
      AND q.completed_at < NOW() - make_interval(days => v_retention_days)
      AND (p_job_types IS NULL OR q.job_type::TEXT = ANY(p_job_types))
      -- Keep queue jobs still referenced by sms_messages to avoid FK violations.
      AND NOT EXISTS (
        SELECT 1
        FROM sms_messages sm
        WHERE sm.queue_job_id = q.id
      )
    ORDER BY q.completed_at ASC, q.id ASC
    LIMIT v_batch_size
  ),
  deleted AS (
    DELETE FROM queue_jobs q
    USING candidates c
    WHERE q.id = c.id
    RETURNING q.completed_at
  )
  SELECT
    COUNT(*)::integer AS deleted_count,
    MIN(d.completed_at) AS oldest_deleted_completed_at,
    MAX(d.completed_at) AS newest_deleted_completed_at
  FROM deleted d;
END;
$function$;
