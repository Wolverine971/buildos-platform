-- =====================================================
-- SMS Event Scheduling System - Phase 1
-- =====================================================
-- Creates infrastructure for AI-powered calendar event SMS reminders
-- - scheduled_sms_messages: Core table for scheduled SMS with calendar linkage
-- - user_sms_preferences updates: Event reminder settings
-- - RPC functions: Cancel and manage scheduled SMS
--
-- Related to: /docs/features/sms-event-scheduling/README.md
-- =====================================================

-- =====================================================
-- 1. CREATE scheduled_sms_messages TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS scheduled_sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message details
  message_content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'event_reminder' CHECK (message_type IN (
    'event_reminder',        -- Reminder before event starts
    'event_starting_soon',   -- Event is starting now
    'daily_agenda',          -- Daily summary of events
    'custom'                 -- Custom message
  )),

  -- Event linkage
  calendar_event_id TEXT,  -- Google Calendar event ID (nullable for non-event messages)
  event_title TEXT,
  event_start TIMESTAMPTZ,
  event_end TIMESTAMPTZ,
  event_details JSONB,  -- Store event description, location, attendees, etc.

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,  -- When to send the SMS
  timezone TEXT NOT NULL DEFAULT 'UTC',

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',   -- Waiting to be sent
    'queued',      -- Job queued in queue_jobs
    'sent',        -- Successfully sent via Twilio
    'delivered',   -- Twilio confirmed delivery
    'failed',      -- Failed to send
    'cancelled'    -- Event cancelled or user opted out
  )),

  -- Twilio tracking
  sms_message_id UUID REFERENCES sms_messages(id),  -- Link to actual SMS record
  twilio_sid TEXT,  -- Twilio message SID

  -- Generation metadata
  generated_via TEXT DEFAULT 'llm' CHECK (generated_via IN ('llm', 'template')),
  llm_model TEXT,  -- Track which LLM model generated it
  generation_cost_usd DECIMAL(10, 6),  -- Track LLM generation cost

  -- Retry logic
  send_attempts INTEGER DEFAULT 0,
  max_send_attempts INTEGER DEFAULT 3,
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT unique_user_event_scheduled UNIQUE(user_id, calendar_event_id, scheduled_for)
);

-- =====================================================
-- 2. CREATE INDEXES for scheduled_sms_messages
-- =====================================================

-- Index for finding scheduled messages ready to send
CREATE INDEX idx_scheduled_sms_status
  ON scheduled_sms_messages(status);

CREATE INDEX idx_scheduled_sms_ready_to_send
  ON scheduled_sms_messages(scheduled_for)
  WHERE status = 'scheduled';

-- Index for user queries
CREATE INDEX idx_scheduled_sms_user_id
  ON scheduled_sms_messages(user_id);

-- Index for calendar event lookups (webhook updates)
CREATE INDEX idx_scheduled_sms_calendar_event
  ON scheduled_sms_messages(calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;

-- Index for user + date queries
CREATE INDEX idx_scheduled_sms_user_date
  ON scheduled_sms_messages(user_id, scheduled_for);

-- =====================================================
-- 3. CREATE updated_at TRIGGER for scheduled_sms_messages
-- =====================================================

-- Ensure the trigger function exists (it should from other migrations)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_scheduled_sms_messages_updated_at
  BEFORE UPDATE ON scheduled_sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. UPDATE user_sms_preferences TABLE
-- =====================================================

-- Add event reminder preferences
ALTER TABLE user_sms_preferences
ADD COLUMN IF NOT EXISTS event_reminders_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS reminder_lead_time_minutes INTEGER DEFAULT 15;

-- Add comment for documentation
COMMENT ON COLUMN user_sms_preferences.event_reminders_enabled IS 'Enable/disable SMS reminders for calendar events';
COMMENT ON COLUMN user_sms_preferences.reminder_lead_time_minutes IS 'How many minutes before event to send reminder (default: 15)';

-- =====================================================
-- 5. CREATE RPC FUNCTION: cancel_scheduled_sms_for_event
-- =====================================================

CREATE OR REPLACE FUNCTION cancel_scheduled_sms_for_event(
  p_calendar_event_id TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  cancelled_count INTEGER,
  message_ids UUID[]
) AS $$
DECLARE
  v_cancelled_ids UUID[];
  v_count INTEGER;
BEGIN
  -- Cancel all scheduled SMS for this calendar event
  WITH updated AS (
    UPDATE scheduled_sms_messages
    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      last_error = 'Event cancelled or deleted'
    WHERE
      calendar_event_id = p_calendar_event_id
      AND status IN ('scheduled', 'queued')
      AND (p_user_id IS NULL OR user_id = p_user_id)
    RETURNING id
  )
  SELECT
    array_agg(id),
    COUNT(*)::INTEGER
  INTO v_cancelled_ids, v_count
  FROM updated;

  -- Return results
  RETURN QUERY SELECT
    COALESCE(v_count, 0),
    COALESCE(v_cancelled_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cancel_scheduled_sms_for_event IS
  'Cancel all scheduled SMS messages for a specific calendar event. Used when events are deleted or cancelled.';

-- =====================================================
-- 6. CREATE RPC FUNCTION: get_scheduled_sms_for_user
-- =====================================================

CREATE OR REPLACE FUNCTION get_scheduled_sms_for_user(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW(),
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  message_content TEXT,
  message_type TEXT,
  calendar_event_id TEXT,
  event_title TEXT,
  event_start TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  status TEXT,
  generated_via TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ssm.id,
    ssm.message_content,
    ssm.message_type,
    ssm.calendar_event_id,
    ssm.event_title,
    ssm.event_start,
    ssm.scheduled_for,
    ssm.status,
    ssm.generated_via,
    ssm.created_at
  FROM scheduled_sms_messages ssm
  WHERE
    ssm.user_id = p_user_id
    AND ssm.scheduled_for >= p_start_date
    AND (p_end_date IS NULL OR ssm.scheduled_for <= p_end_date)
    AND (p_status IS NULL OR ssm.status = p_status)
  ORDER BY ssm.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_scheduled_sms_for_user IS
  'Get scheduled SMS messages for a user within a date range, optionally filtered by status';

-- =====================================================
-- 7. CREATE RPC FUNCTION: update_scheduled_sms_send_time
-- =====================================================

CREATE OR REPLACE FUNCTION update_scheduled_sms_send_time(
  p_message_id UUID,
  p_new_scheduled_for TIMESTAMPTZ,
  p_new_event_start TIMESTAMPTZ DEFAULT NULL,
  p_new_event_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE scheduled_sms_messages
  SET
    scheduled_for = p_new_scheduled_for,
    event_start = COALESCE(p_new_event_start, event_start),
    event_end = COALESCE(p_new_event_end, event_end),
    updated_at = NOW()
  WHERE
    id = p_message_id
    AND status IN ('scheduled', 'queued')
  RETURNING TRUE INTO v_updated;

  RETURN COALESCE(v_updated, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_scheduled_sms_send_time IS
  'Update the scheduled send time for an SMS message. Used when calendar events are rescheduled.';

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant access to authenticated users (via RLS)
ALTER TABLE scheduled_sms_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own scheduled messages
CREATE POLICY scheduled_sms_select_own
  ON scheduled_sms_messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own scheduled messages (cancel only)
CREATE POLICY scheduled_sms_update_own
  ON scheduled_sms_messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can do anything (for worker)
CREATE POLICY scheduled_sms_service_role_all
  ON scheduled_sms_messages
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Grant execute permissions on RPC functions
GRANT EXECUTE ON FUNCTION cancel_scheduled_sms_for_event TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_scheduled_sms_for_user TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_scheduled_sms_send_time TO authenticated, service_role;

-- =====================================================
-- 9. ADD QUEUE JOB TYPE
-- =====================================================

-- Add schedule_daily_sms to queue_type enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'queue_type'
          AND e.enumlabel = 'schedule_daily_sms'
    ) THEN
        ALTER TYPE queue_type ADD VALUE 'schedule_daily_sms';
        RAISE NOTICE 'Added schedule_daily_sms to queue_type enum';
    ELSE
        RAISE NOTICE 'schedule_daily_sms already exists in queue_type enum';
    END IF;
END$$;

-- =====================================================
-- 10. ADD HELPFUL COMMENTS
-- =====================================================

COMMENT ON TABLE scheduled_sms_messages IS
  'Stores scheduled SMS messages for calendar event reminders. Messages are generated via LLM and sent at scheduled times.';

COMMENT ON COLUMN scheduled_sms_messages.calendar_event_id IS
  'Google Calendar event ID. Used for webhook-driven updates when events change.';

COMMENT ON COLUMN scheduled_sms_messages.event_details IS
  'JSONB storage for event context (description, location, attendees) used for message regeneration';

COMMENT ON COLUMN scheduled_sms_messages.generated_via IS
  'Tracks whether message was generated via LLM or template fallback. Used for quality monitoring.';

COMMENT ON COLUMN scheduled_sms_messages.generation_cost_usd IS
  'Tracks LLM generation cost per message for cost analysis';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scheduled_sms_messages') THEN
    RAISE NOTICE '✅ scheduled_sms_messages table created successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to create scheduled_sms_messages table';
  END IF;
END $$;
