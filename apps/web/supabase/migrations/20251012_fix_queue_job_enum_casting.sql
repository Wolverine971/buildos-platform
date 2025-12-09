-- apps/web/supabase/migrations/20251012_fix_queue_job_enum_casting.sql
-- =====================================================
-- FIX ENUM TYPE CASTING IN QUEUE JOB FUNCTIONS
-- =====================================================
-- Fixes type casting errors where TEXT parameters need to be converted
-- to queue_type enum and vice versa for proper database operations
-- =====================================================

-- Drop existing functions to recreate with proper casting
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop add_queue_job
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'add_queue_job' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;

    -- Drop cancel_jobs_atomic
    FOR r IN SELECT oid::regprocedure FROM pg_proc WHERE proname = 'cancel_jobs_atomic' LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
    END LOOP;
END $$;

-- =====================================================
-- 1. FIX ADD_QUEUE_JOB - Add proper enum casting
-- =====================================================

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
  v_queue_job_id TEXT;
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

  -- Generate a unique queue_job_id with job type prefix
  -- Format: {job_type}_{random_uuid}
  v_queue_job_id := p_job_type || '_' || gen_random_uuid()::text;

  -- Insert new job with proper enum casting
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
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION add_queue_job IS 'Atomically adds a job to the queue with deduplication support and proper enum casting';

-- =====================================================
-- 2. FIX CANCEL_JOBS_ATOMIC - Add proper enum casting
-- =====================================================

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
    AND queue_jobs.job_type::TEXT = p_job_type  -- FIXED: Cast enum to TEXT for comparison
    AND queue_jobs.status::TEXT = ANY(p_allowed_statuses)  -- FIXED: Cast enum to TEXT
    AND (p_metadata_filter IS NULL OR queue_jobs.metadata @> p_metadata_filter)
  RETURNING
    queue_jobs.id,
    queue_jobs.queue_job_id,
    queue_jobs.job_type::TEXT,  -- FIXED: Cast enum to TEXT for output
    queue_jobs.status::TEXT;    -- FIXED: Cast enum to TEXT for output
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cancel_jobs_atomic IS 'Atomically cancels jobs matching user, type, and optional metadata filter with proper enum casting';

-- =====================================================
-- RE-GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION add_queue_job(UUID, TEXT, JSONB, INTEGER, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_jobs_atomic(UUID, TEXT, JSONB, TEXT[]) TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Fixed issues in add_queue_job and cancel_jobs_atomic:
--
-- add_queue_job:
-- 1. TEXT → queue_type enum casting when inserting job_type
-- 2. TEXT → queue_status enum casting when inserting status
-- 3. Auto-generate queue_job_id (format: {job_type}_{uuid})
--
-- cancel_jobs_atomic:
-- 1. queue_type enum → TEXT casting when comparing
-- 2. queue_status enum → TEXT casting when comparing
-- =====================================================
