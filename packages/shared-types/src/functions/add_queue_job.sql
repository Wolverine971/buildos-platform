-- packages/shared-types/src/functions/add_queue_job.sql
-- add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
-- Add a job to the queue
-- Source: apps/web/supabase/migrations/20251011_atomic_queue_job_operations.sql

CREATE OR REPLACE FUNCTION add_queue_job(
  p_user_id UUID,
  p_job_type TEXT,
  p_metadata JSONB,
  p_priority INTEGER DEFAULT 10,
  p_scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  p_dedup_key TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_existing_job RECORD;
BEGIN
  -- Check for duplicate if dedup_key provided
  IF p_dedup_key IS NOT NULL THEN
    SELECT id, status INTO v_existing_job
    FROM queue_jobs
    WHERE dedup_key = p_dedup_key
      AND status IN ('pending', 'processing')
    LIMIT 1;

    -- If duplicate found and still active, return existing ID
    IF FOUND THEN
      RETURN v_existing_job.id;
    END IF;
  END IF;

  -- Insert new job
  INSERT INTO queue_jobs (
    user_id,
    job_type,
    metadata,
    priority,
    scheduled_for,
    dedup_key,
    status
  ) VALUES (
    p_user_id,
    p_job_type,
    p_metadata,
    p_priority,
    p_scheduled_for,
    p_dedup_key,
    'pending'
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;
