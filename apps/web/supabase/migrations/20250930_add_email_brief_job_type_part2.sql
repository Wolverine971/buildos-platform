-- Migration: Add generate_brief_email job type - PART 2 (Infrastructure)
-- Description: Adds constraints, indexes, and functions for email job type
-- Date: 2025-09-30
-- Related: PHASE2_REVISED_IMPLEMENTATION.md in apps/worker
-- IMPORTANT: Part 1 must be committed before running this

-- NO CHANGES TO daily_briefs TABLE!
-- We reuse existing emails/email_recipients/email_tracking_events tables

-- Step 1: Update the queue job metadata constraint to include new job type
-- First, drop the existing constraint
ALTER TABLE queue_jobs
DROP CONSTRAINT IF EXISTS valid_job_metadata;

-- Add updated constraint that includes generate_brief_email
ALTER TABLE queue_jobs
ADD CONSTRAINT valid_job_metadata CHECK (
    -- Terminal states can have any metadata
    status IN ('completed', 'cancelled', 'failed')
    OR
    -- Active states need non-null metadata for certain types
    NOT (
        status NOT IN ('completed', 'cancelled', 'failed')
        AND job_type IN ('generate_daily_brief', 'generate_phases', 'generate_brief_email')
        AND metadata IS NULL
    )
);

COMMENT ON CONSTRAINT valid_job_metadata ON queue_jobs IS
'Updated constraint: Prevents NULL metadata for daily_brief, phases, and email generation jobs';

-- Step 2: Create index on emails table for efficient brief email lookups
-- Query pattern: Find emails for a specific brief
CREATE INDEX IF NOT EXISTS idx_emails_category_template_data
  ON emails(category, (template_data->>'brief_id'))
  WHERE category = 'daily_brief';

-- Query pattern: Find pending emails that need to be sent
CREATE INDEX IF NOT EXISTS idx_emails_status_category
  ON emails(status, category, created_at)
  WHERE status = 'pending' AND category = 'daily_brief';

COMMENT ON INDEX idx_emails_category_template_data IS
'Optimizes queries for finding emails by brief_id in template_data';

COMMENT ON INDEX idx_emails_status_category IS
'Optimizes queries for finding pending brief emails that need processing';

-- Step 3: Create RPC function to find emails needing to be sent
CREATE OR REPLACE FUNCTION get_pending_brief_emails(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  email_id uuid,
  user_id uuid,
  brief_id text,
  brief_date text,
  created_at timestamptz,
  subject text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id as email_id,
    e.created_by as user_id,
    e.template_data->>'brief_id' as brief_id,
    e.template_data->>'brief_date' as brief_date,
    e.created_at,
    e.subject
  FROM emails e
  INNER JOIN user_brief_preferences ubp
    ON ubp.user_id = e.created_by
  WHERE e.status = 'pending'
    AND e.category = 'daily_brief'
    AND ubp.email_daily_brief = true
    AND ubp.is_active = true
    AND e.created_at > NOW() - INTERVAL '7 days' -- Only recent emails
  ORDER BY e.created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_pending_brief_emails IS
'Returns pending brief emails that need to be sent based on user preferences';

-- Step 4: Create RPC function to get email status for a brief
CREATE OR REPLACE FUNCTION get_brief_email_status(
  p_brief_id text
)
RETURNS TABLE (
  email_id uuid,
  status text,
  sent_at timestamptz,
  recipient_email text,
  recipient_status text,
  opened_at timestamptz,
  open_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id as email_id,
    e.status,
    er.sent_at,
    er.recipient_email,
    er.status as recipient_status,
    er.opened_at,
    er.open_count
  FROM emails e
  LEFT JOIN email_recipients er ON er.email_id = e.id
  WHERE e.category = 'daily_brief'
    AND e.template_data->>'brief_id' = p_brief_id
  ORDER BY e.created_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_brief_email_status IS
'Gets the email delivery and tracking status for a specific brief';

-- Step 5: Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_pending_brief_emails TO service_role;
GRANT EXECUTE ON FUNCTION get_brief_email_status TO service_role, authenticated;

-- Step 6: Add helper view for monitoring (optional)
CREATE OR REPLACE VIEW brief_email_stats AS
SELECT
  DATE(e.created_at) as date,
  COUNT(*) as total_emails,
  COUNT(*) FILTER (WHERE e.status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE e.status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE e.status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE er.opened_at IS NOT NULL) as opened_count,
  AVG(EXTRACT(EPOCH FROM (er.sent_at - e.created_at))) FILTER (WHERE er.sent_at IS NOT NULL) as avg_send_time_seconds
FROM emails e
LEFT JOIN email_recipients er ON er.email_id = e.id
WHERE e.category = 'daily_brief'
  AND e.created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(e.created_at)
ORDER BY DATE(e.created_at) DESC;

COMMENT ON VIEW brief_email_stats IS
'Daily statistics for brief email delivery and engagement (last 30 days)';

GRANT SELECT ON brief_email_stats TO service_role, authenticated;

-- Migration verification
DO $$
BEGIN
  -- Verify enum value exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'generate_brief_email'
    AND enumtypid = 'queue_type'::regtype
  ) THEN
    RAISE EXCEPTION 'Migration failed: generate_brief_email not found in queue_type enum. Did you run part 1 first?';
  END IF;

  -- Verify indexes were created
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'emails' AND indexname = 'idx_emails_category_template_data'
  ) THEN
    RAISE EXCEPTION 'Migration failed: idx_emails_category_template_data index not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'emails' AND indexname = 'idx_emails_status_category'
  ) THEN
    RAISE EXCEPTION 'Migration failed: idx_emails_status_category index not created';
  END IF;

  -- Verify functions were created
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_pending_brief_emails'
  ) THEN
    RAISE EXCEPTION 'Migration failed: get_pending_brief_emails function not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_brief_email_status'
  ) THEN
    RAISE EXCEPTION 'Migration failed: get_brief_email_status function not created';
  END IF;

  -- Verify view was created
  IF NOT EXISTS (
    SELECT 1 FROM pg_views
    WHERE viewname = 'brief_email_stats'
  ) THEN
    RAISE EXCEPTION 'Migration failed: brief_email_stats view not created';
  END IF;

  RAISE NOTICE 'Migration completed successfully: Email decoupling using existing email tables';
  RAISE NOTICE '  ✓ Enum value verified';
  RAISE NOTICE '  ✓ Constraint updated';
  RAISE NOTICE '  ✓ Indexes created on emails table';
  RAISE NOTICE '  ✓ RPC functions created';
  RAISE NOTICE '  ✓ Monitoring view created';
END $$;
