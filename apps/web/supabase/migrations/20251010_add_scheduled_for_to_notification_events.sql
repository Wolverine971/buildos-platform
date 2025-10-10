-- =====================================================
-- ADD SCHEDULED_FOR PARAMETER TO NOTIFICATION EVENTS
-- =====================================================
-- Allows notifications to be scheduled for a specific time
-- instead of being sent immediately
-- =====================================================

-- Drop the old function first (PostgreSQL requires this for signature changes)
DROP FUNCTION IF EXISTS emit_notification_event(TEXT, TEXT, UUID, UUID, JSONB, JSONB);

-- Create new function with p_scheduled_for parameter
CREATE OR REPLACE FUNCTION emit_notification_event(
  p_event_type TEXT,
  p_event_source TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT NULL,
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL  -- NEW: Optional scheduled time
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_subscription RECORD;
  v_prefs RECORD;
  v_delivery_id UUID;
  v_push_sub RECORD;
  v_scheduled_time TIMESTAMPTZ;
BEGIN
  -- Use provided scheduled_for or default to NOW()
  v_scheduled_time := COALESCE(p_scheduled_for, NOW());

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

        -- Queue notification job with scheduled time
        INSERT INTO queue_jobs (
          user_id,
          job_type,
          status,
          scheduled_for,  -- NOW USES v_scheduled_time
          queue_job_id,
          metadata
        ) VALUES (
          v_subscription.user_id,
          'send_notification',
          'pending',
          v_scheduled_time,  -- Use provided scheduled time or NOW()
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
        scheduled_for,  -- NOW USES v_scheduled_time
        queue_job_id,
        metadata
      ) VALUES (
        v_subscription.user_id,
        'send_notification',
        'pending',
        v_scheduled_time,  -- Use provided scheduled time or NOW()
        'notif_' || v_delivery_id::text,
        jsonb_build_object(
          'event_id', v_event_id,
          'delivery_id', v_delivery_id,
          'channel', 'in_app',
          'event_type', p_event_type
        )
      );
    END IF;

    -- Email and SMS would be added here in future phases
  END LOOP;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION emit_notification_event IS 'Emits a notification event and queues deliveries to all subscribers based on their preferences. Supports optional scheduled_for parameter to delay notification delivery.';

-- No need to grant execute again as the function signature is compatible
