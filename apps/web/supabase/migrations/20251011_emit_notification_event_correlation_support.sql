-- =====================================================
-- ADD CORRELATION ID SUPPORT TO emit_notification_event
-- =====================================================
-- Enables end-to-end request tracing across web → worker → webhooks
-- by extracting and passing correlation IDs through the entire flow
-- =====================================================

-- Drop the old function first (PostgreSQL requires this for signature changes)
DROP FUNCTION IF EXISTS emit_notification_event(TEXT, TEXT, UUID, UUID, JSONB, JSONB, TIMESTAMPTZ);

-- Create updated function with correlation ID support
CREATE OR REPLACE FUNCTION emit_notification_event(
  p_event_type TEXT,
  p_event_source TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT NULL,
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_subscription RECORD;
  v_prefs RECORD;
  v_delivery_id UUID;
  v_push_sub RECORD;
  v_scheduled_time TIMESTAMPTZ;
  v_correlation_id UUID;
  v_enriched_metadata JSONB;
BEGIN
  -- Use provided scheduled_for or default to NOW()
  v_scheduled_time := COALESCE(p_scheduled_for, NOW());

  -- Extract correlation ID from metadata or payload, or generate a new one
  -- Priority: p_metadata.correlationId > p_payload.correlationId > generate new
  v_correlation_id := COALESCE(
    (p_metadata->>'correlationId')::UUID,
    (p_payload->>'correlationId')::UUID,
    gen_random_uuid()
  );

  -- Ensure correlation ID is in metadata for storage
  v_enriched_metadata := COALESCE(p_metadata, '{}'::jsonb);
  IF NOT (v_enriched_metadata ? 'correlationId') THEN
    v_enriched_metadata := v_enriched_metadata || jsonb_build_object('correlationId', v_correlation_id);
  END IF;

  -- Insert event with correlation ID in metadata
  INSERT INTO notification_events (
    event_type,
    event_source,
    actor_user_id,
    target_user_id,
    payload,
    metadata  -- Contains correlationId
  ) VALUES (
    p_event_type,
    p_event_source,
    p_actor_user_id,
    p_target_user_id,
    p_payload,
    v_enriched_metadata  -- Store correlation ID
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

        -- Queue notification job with correlation ID in metadata
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
          v_scheduled_time,
          'notif_' || v_delivery_id::text,
          jsonb_build_object(
            'event_id', v_event_id,
            'delivery_id', v_delivery_id,
            'channel', 'push',
            'event_type', p_event_type,
            'correlationId', v_correlation_id  -- ADDED: Pass correlation ID to worker
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
        v_scheduled_time,
        'notif_' || v_delivery_id::text,
        jsonb_build_object(
          'event_id', v_event_id,
          'delivery_id', v_delivery_id,
          'channel', 'in_app',
          'event_type', p_event_type,
          'correlationId', v_correlation_id  -- ADDED: Pass correlation ID to worker
        )
      );
    END IF;

    -- Queue email notifications (if enabled)
    IF v_prefs.email_enabled THEN
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
        'email',
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
        v_scheduled_time,
        'notif_' || v_delivery_id::text,
        jsonb_build_object(
          'event_id', v_event_id,
          'delivery_id', v_delivery_id,
          'channel', 'email',
          'event_type', p_event_type,
          'correlationId', v_correlation_id  -- ADDED: Pass correlation ID to worker
        )
      );
    END IF;

    -- Queue SMS notifications (if enabled)
    IF v_prefs.sms_enabled THEN
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
        'sms',
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
        v_scheduled_time,
        'notif_' || v_delivery_id::text,
        jsonb_build_object(
          'event_id', v_event_id,
          'delivery_id', v_delivery_id,
          'channel', 'sms',
          'event_type', p_event_type,
          'correlationId', v_correlation_id  -- ADDED: Pass correlation ID to worker
        )
      );
    END IF;
  END LOOP;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION emit_notification_event IS 'Emits a notification event and queues deliveries to all subscribers based on their preferences. Supports optional scheduled_for parameter to delay notification delivery. Automatically extracts or generates correlation IDs for end-to-end request tracing.';

-- =====================================================
-- MIGRATION NOTES
-- =====================================================
--
-- This migration adds correlation ID support to the emit_notification_event function:
--
-- 1. Extracts correlation ID from p_metadata or p_payload (if provided)
-- 2. Generates a new correlation ID if none provided
-- 3. Stores correlation ID in notification_events.metadata
-- 4. Passes correlation ID to all queue jobs in metadata
-- 5. Supports all channels: push, in_app, email, sms
--
-- Correlation ID flow:
-- - Web API → generates correlation ID → passes in p_metadata
-- - RPC function → extracts correlation ID → stores in event.metadata
-- - RPC function → passes correlation ID to queue jobs
-- - Worker → extracts correlation ID from job.metadata
-- - Worker → logs all operations with correlation ID
-- - Webhooks → extract correlation ID from message metadata
-- - Webhooks → log updates with correlation ID
--
-- This enables full request tracing across the entire notification lifecycle.
--
