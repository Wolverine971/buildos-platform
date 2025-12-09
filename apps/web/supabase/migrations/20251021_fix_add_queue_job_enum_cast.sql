-- apps/web/supabase/migrations/20251021_fix_add_queue_job_enum_cast.sql
-- =====================================================
-- HOTFIX: Add missing enum casts to add_queue_job()
-- =====================================================
-- Fixes the regression from 20251021_fix_queue_job_deduplication_race.sql
-- which accidentally removed the enum casts that were added in
-- 20251012_fix_queue_job_enum_casting.sql
--
-- Error: "column \"job_type\" is of type queue_type but expression is of type text"
-- =====================================================

-- Drop existing function
DROP FUNCTION IF EXISTS add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT);

-- Recreate with proper enum casting
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
  v_queue_job_id TEXT;
  v_is_duplicate BOOLEAN := FALSE;
BEGIN
  -- Generate a unique queue_job_id with job type prefix
  -- Format: {job_type}_{random_uuid}
  v_queue_job_id := p_job_type || '_' || gen_random_uuid()::text;

  -- Attempt atomic insert with conflict handling
  -- ON CONFLICT prevents race condition - database enforces uniqueness
  INSERT INTO queue_jobs (
    user_id,
    job_type,
    metadata,
    priority,
    scheduled_for,
    dedup_key,
    status,
    queue_job_id
  ) VALUES (
    p_user_id,
    p_job_type::queue_type,  -- FIXED: Cast TEXT to queue_type enum
    p_metadata,
    p_priority,
    p_scheduled_for,
    p_dedup_key,
    'pending'::queue_status,  -- FIXED: Cast TEXT to queue_status enum
    v_queue_job_id  -- FIXED: Auto-generate queue_job_id
  )
  ON CONFLICT (dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
  DO NOTHING
  RETURNING id INTO v_job_id;

  -- If conflict occurred (no id returned), fetch existing job
  IF v_job_id IS NULL AND p_dedup_key IS NOT NULL THEN
    v_is_duplicate := TRUE;

    SELECT id INTO v_job_id
    FROM queue_jobs
    WHERE dedup_key = p_dedup_key
      AND status IN ('pending', 'processing')
    ORDER BY created_at ASC  -- Return oldest job if somehow multiple exist
    LIMIT 1;

    -- Log deduplication event for monitoring
    RAISE NOTICE 'DEDUP_EVENT: Prevented duplicate job creation - job_type: %, dedup_key: %, existing_job_id: %',
      p_job_type,
      p_dedup_key,
      v_job_id;
  END IF;

  -- If still no job found (edge case), raise error
  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create or find job with dedup_key: %', p_dedup_key;
  END IF;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Update function comment
COMMENT ON FUNCTION add_queue_job IS
'Atomically adds a job to the queue with race-condition-free deduplication.
Uses partial unique index on dedup_key to prevent duplicate active jobs.
On conflict, returns existing job ID and logs DEDUP_EVENT for monitoring.
Fixed: 2025-10-21 - TOCTOU race condition eliminated.
Hotfix: 2025-10-21 - Restored enum casts (queue_type, queue_status)';

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT) TO authenticated;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Hotfix applied: add_queue_job() now properly casts TEXT to enum types';
  RAISE NOTICE '   - p_job_type::queue_type';
  RAISE NOTICE '   - ''pending''::queue_status';
END $$;
