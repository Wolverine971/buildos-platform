-- Migration: SMS Notification Channel Integration - Phase 1
-- Description: Adds support for SMS as a notification channel by linking sms_messages to notification_deliveries
-- Date: 2025-10-06
-- Related: /docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md

-- ============================================================================
-- 1. Add Foreign Key to sms_messages Table
-- ============================================================================

-- Add notification_delivery_id column to link SMS messages to notification deliveries
ALTER TABLE sms_messages
ADD COLUMN notification_delivery_id UUID
REFERENCES notification_deliveries(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_sms_messages_notification_delivery
ON sms_messages(notification_delivery_id)
WHERE notification_delivery_id IS NOT NULL;

-- Add comment explaining the purpose
COMMENT ON COLUMN sms_messages.notification_delivery_id IS
'Links to notification_deliveries for event-driven SMS notifications. NULL for standalone SMS messages (task reminders, etc).';

-- ============================================================================
-- 2. Helper Function: Get User SMS Channel Info
-- ============================================================================

-- Function to check if user has SMS channel available and get phone info
CREATE OR REPLACE FUNCTION get_user_sms_channel_info(p_user_id UUID)
RETURNS TABLE (
  has_sms_available BOOLEAN,
  phone_number TEXT,
  phone_verified BOOLEAN,
  phone_verified_at TIMESTAMPTZ,
  opted_out BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- SMS is available if phone is verified and user hasn't opted out
    COALESCE(sp.phone_verified = true AND sp.opted_out = false, false) as has_sms_available,
    sp.phone_number,
    COALESCE(sp.phone_verified, false) as phone_verified,
    sp.phone_verified_at,
    COALESCE(sp.opted_out, false) as opted_out
  FROM user_sms_preferences sp
  WHERE sp.user_id = p_user_id;

  -- If no record exists, return default values
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false::boolean as has_sms_available,
      NULL::text as phone_number,
      false::boolean as phone_verified,
      NULL::timestamptz as phone_verified_at,
      false::boolean as opted_out;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_user_sms_channel_info IS
'Gets SMS channel availability for a user. Returns phone number and verification status.
SMS is available only if phone is verified and user has not opted out.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_sms_channel_info TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_sms_channel_info TO service_role;

-- ============================================================================
-- 3. Update emit_notification_event RPC for SMS Support
-- ============================================================================

-- Drop existing function to recreate with SMS support
DROP FUNCTION IF EXISTS emit_notification_event CASCADE;

-- Recreate with SMS channel support
CREATE OR REPLACE FUNCTION emit_notification_event(
  p_event_type TEXT,
  p_event_source TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_subscription RECORD;
  v_prefs RECORD;
  v_delivery_id UUID;
  v_push_sub RECORD;
  v_sms_info RECORD;
BEGIN
  -- Insert event
  INSERT INTO notification_events (
    event_type,
    event_source,
    actor_user_id,
    target_user_id,
    payload,
    metadata
  ) VALUES (
    p_event_type,
    p_event_source,
    p_actor_user_id,
    p_target_user_id,
    p_payload,
    p_metadata
  ) RETURNING id INTO v_event_id;

  -- Find active subscriptions for this event type
  FOR v_subscription IN
    SELECT * FROM notification_subscriptions
    WHERE event_type = p_event_type
      AND is_active = true
  LOOP
    -- Get user preferences (use defaults if not found)
    SELECT * INTO v_prefs
    FROM user_notification_preferences
    WHERE user_id = v_subscription.user_id
      AND event_type = p_event_type;

    -- If no preferences exist, use safe defaults (push enabled)
    IF NOT FOUND THEN
      v_prefs.push_enabled := true;
      v_prefs.email_enabled := false;
      v_prefs.sms_enabled := false;
      v_prefs.in_app_enabled := true;
    END IF;

    -- Queue browser push notifications
    IF v_prefs.push_enabled THEN
      -- Find active push subscriptions for this user
      FOR v_push_sub IN
        SELECT * FROM push_subscriptions
        WHERE user_id = v_subscription.user_id
          AND is_active = true
      LOOP
        -- Create delivery record
        INSERT INTO notification_deliveries (
          event_id,
          subscription_id,
          recipient_user_id,
          channel,
          channel_identifier,
          payload,
          status
        ) VALUES (
          v_event_id,
          v_subscription.id,
          v_subscription.user_id,
          'push',
          v_push_sub.endpoint,
          p_payload,
          'pending'
        ) RETURNING id INTO v_delivery_id;

        -- Queue notification job
        INSERT INTO queue_jobs (
          user_id,
          job_type,
          status,
          scheduled_for,
          queue_job_id,
          metadata
        ) VALUES (
          v_subscription.user_id,
          'send_notification',
          'pending',
          NOW(),
          'notif_' || v_delivery_id::text,
          jsonb_build_object(
            'event_id', v_event_id,
            'delivery_id', v_delivery_id,
            'channel', 'push',
            'event_type', p_event_type
          )
        );
      END LOOP;
    END IF;

    -- Queue in-app notifications
    IF v_prefs.in_app_enabled THEN
      INSERT INTO notification_deliveries (
        event_id,
        subscription_id,
        recipient_user_id,
        channel,
        payload,
        status
      ) VALUES (
        v_event_id,
        v_subscription.id,
        v_subscription.user_id,
        'in_app',
        p_payload,
        'pending'
      ) RETURNING id INTO v_delivery_id;

      INSERT INTO queue_jobs (
        user_id,
        job_type,
        status,
        scheduled_for,
        queue_job_id,
        metadata
      ) VALUES (
        v_subscription.user_id,
        'send_notification',
        'pending',
        NOW(),
        'notif_' || v_delivery_id::text,
        jsonb_build_object(
          'event_id', v_event_id,
          'delivery_id', v_delivery_id,
          'channel', 'in_app',
          'event_type', p_event_type
        )
      );
    END IF;

    -- ======= NEW: Queue SMS notifications =======
    IF v_prefs.sms_enabled THEN
      -- Get SMS channel info (phone verification status)
      SELECT * INTO v_sms_info
      FROM get_user_sms_channel_info(v_subscription.user_id);

      -- Only create SMS delivery if phone is verified and user hasn't opted out
      IF v_sms_info.has_sms_available THEN
        INSERT INTO notification_deliveries (
          event_id,
          subscription_id,
          recipient_user_id,
          channel,
          channel_identifier,
          payload,
          status
        ) VALUES (
          v_event_id,
          v_subscription.id,
          v_subscription.user_id,
          'sms',
          v_sms_info.phone_number,
          p_payload,
          'pending'
        ) RETURNING id INTO v_delivery_id;

        INSERT INTO queue_jobs (
          user_id,
          job_type,
          status,
          scheduled_for,
          queue_job_id,
          metadata
        ) VALUES (
          v_subscription.user_id,
          'send_notification',
          'pending',
          NOW(),
          'notif_' || v_delivery_id::text,
          jsonb_build_object(
            'event_id', v_event_id,
            'delivery_id', v_delivery_id,
            'channel', 'sms',
            'event_type', p_event_type,
            'phone_number', v_sms_info.phone_number
          )
        );
      END IF;
    END IF;
    -- ======= END SMS SUPPORT =======

    -- Email would be added here in future phases
  END LOOP;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION emit_notification_event IS 'Emits a notification event and queues deliveries to all subscribers based on their preferences. Now supports SMS channel with phone verification.';

GRANT EXECUTE ON FUNCTION emit_notification_event TO authenticated;
GRANT EXECUTE ON FUNCTION emit_notification_event TO service_role;

-- ============================================================================
-- 4. Analytics: Add SMS to Channel Performance Tracking
-- ============================================================================

-- Update the notification analytics RPC to include SMS in channel breakdown
-- (This is informational only - the existing RPC will automatically include SMS)

COMMENT ON TABLE notification_deliveries IS
'Multi-channel notification delivery tracking. Supports push, email, in_app, and SMS channels.';

-- ============================================================================
-- 5. Verification and Testing Queries
-- ============================================================================

-- Test query: Check if SMS channel info function works
-- SELECT * FROM get_user_sms_channel_info(auth.uid());

-- Test query: Check if foreign key was added
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'sms_messages' AND column_name = 'notification_delivery_id';

-- Test query: Count existing notification subscriptions with SMS enabled
-- SELECT COUNT(*)
-- FROM user_notification_preferences
-- WHERE sms_enabled = true;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Log migration success
DO $$
BEGIN
  RAISE NOTICE 'SMS Notification Channel Phase 1 migration completed successfully';
  RAISE NOTICE '- Added notification_delivery_id FK to sms_messages table';
  RAISE NOTICE '- Created get_user_sms_channel_info() helper function';
  RAISE NOTICE '- Updated emit_notification_event RPC with SMS support';
  RAISE NOTICE 'Next: Implement SMS adapter in worker (Phase 2)';
END $$;
