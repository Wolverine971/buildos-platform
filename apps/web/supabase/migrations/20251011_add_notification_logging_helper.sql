-- apps/web/supabase/migrations/20251011_add_notification_logging_helper.sql
-- =====================================================
-- ADD DATABASE FUNCTION LOGGING TO NOTIFICATION SYSTEM
-- =====================================================
-- Creates helper function for logging from database functions
-- and updates emit_notification_event() to log key operations
-- for debugging subscription matching and delivery creation
-- =====================================================

-- =====================================================
-- 1. CREATE LOGGING HELPER FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION log_notification_event(
  p_level TEXT,
  p_message TEXT,
  p_namespace TEXT DEFAULT 'db_function',
  p_correlation_id UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_delivery_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS void AS $$
BEGIN
  -- Insert log entry into notification_logs table
  -- Note: This is non-blocking and won't fail the transaction if logging fails
  INSERT INTO notification_logs (
    level,
    message,
    namespace,
    correlation_id,
    notification_event_id,
    notification_delivery_id,
    user_id,
    metadata,
    created_at
  ) VALUES (
    p_level,
    p_message,
    p_namespace,
    p_correlation_id,
    p_event_id,
    p_delivery_id,
    p_user_id,
    p_context || p_metadata,  -- Merge context and metadata
    NOW()
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the transaction if logging fails
    -- Just silently continue (logging is best-effort)
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_notification_event IS 'Helper function to log notification events from database functions. Inserts into notification_logs table with proper error handling.';

-- =====================================================
-- 2. UPDATE emit_notification_event WITH LOGGING
-- =====================================================

-- Drop the existing function first
DROP FUNCTION IF EXISTS emit_notification_event(TEXT, TEXT, UUID, UUID, JSONB, JSONB, TIMESTAMPTZ);

-- Recreate with logging calls
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
  v_subscription_count INTEGER := 0;
  v_delivery_count INTEGER := 0;
BEGIN
  -- Use provided scheduled_for or default to NOW()
  v_scheduled_time := COALESCE(p_scheduled_for, NOW());

  -- Extract correlation ID from metadata or payload, or generate a new one
  v_correlation_id := COALESCE(
    (p_metadata->>'correlationId')::UUID,
    (p_payload->>'correlationId')::UUID,
    gen_random_uuid()
  );

  -- Ensure correlation ID is in metadata
  v_enriched_metadata := COALESCE(p_metadata, '{}'::jsonb);
  IF NOT (v_enriched_metadata ? 'correlationId') THEN
    v_enriched_metadata := v_enriched_metadata || jsonb_build_object('correlationId', v_correlation_id);
  END IF;

  -- LOG: Event creation starting
  PERFORM log_notification_event(
    'info',
    'Creating notification event',
    'emit_notification_event',
    v_correlation_id,
    NULL,
    NULL,
    p_target_user_id,
    jsonb_build_object(
      'event_type', p_event_type,
      'event_source', p_event_source,
      'actor_user_id', p_actor_user_id,
      'target_user_id', p_target_user_id
    ),
    jsonb_build_object('scheduled_for', p_scheduled_for)
  );

  -- Insert event with correlation ID in both metadata AND dedicated column
  INSERT INTO notification_events (
    event_type,
    event_source,
    actor_user_id,
    target_user_id,
    payload,
    metadata,
    correlation_id
  ) VALUES (
    p_event_type,
    p_event_source,
    p_actor_user_id,
    p_target_user_id,
    p_payload,
    v_enriched_metadata,
    v_correlation_id
  ) RETURNING id INTO v_event_id;

  -- LOG: Event created
  PERFORM log_notification_event(
    'debug',
    'Notification event created',
    'emit_notification_event',
    v_correlation_id,
    v_event_id,
    NULL,
    p_target_user_id,
    jsonb_build_object('event_id', v_event_id)
  );

  -- Find active subscriptions for this event type
  FOR v_subscription IN
    SELECT * FROM notification_subscriptions
    WHERE event_type = p_event_type
      AND is_active = true
  LOOP
    v_subscription_count := v_subscription_count + 1;

    -- LOG: Subscription matched
    PERFORM log_notification_event(
      'debug',
      'Subscription matched',
      'emit_notification_event',
      v_correlation_id,
      v_event_id,
      NULL,
      v_subscription.user_id,
      jsonb_build_object(
        'subscription_id', v_subscription.id,
        'subscriber_user_id', v_subscription.user_id,
        'event_type', p_event_type
      )
    );

    -- Get user preferences
    SELECT * INTO v_prefs
    FROM user_notification_preferences
    WHERE user_id = v_subscription.user_id
      AND event_type = p_event_type;

    -- Use safe defaults if preferences not found
    IF NOT FOUND THEN
      v_prefs.push_enabled := true;
      v_prefs.email_enabled := false;
      v_prefs.sms_enabled := false;
      v_prefs.in_app_enabled := true;
    END IF;

    -- Queue browser push notifications
    IF v_prefs.push_enabled THEN
      FOR v_push_sub IN
        SELECT * FROM push_subscriptions
        WHERE user_id = v_subscription.user_id
          AND is_active = true
      LOOP
        -- Create delivery record with correlation ID
        INSERT INTO notification_deliveries (
          event_id,
          subscription_id,
          recipient_user_id,
          channel,
          channel_identifier,
          payload,
          status,
          correlation_id
        ) VALUES (
          v_event_id,
          v_subscription.id,
          v_subscription.user_id,
          'push',
          v_push_sub.endpoint,
          p_payload,
          'pending',
          v_correlation_id
        ) RETURNING id INTO v_delivery_id;

        v_delivery_count := v_delivery_count + 1;

        -- LOG: Delivery created
        PERFORM log_notification_event(
          'info',
          'Delivery created',
          'emit_notification_event',
          v_correlation_id,
          v_event_id,
          v_delivery_id,
          v_subscription.user_id,
          jsonb_build_object(
            'channel', 'push',
            'delivery_id', v_delivery_id,
            'recipient_user_id', v_subscription.user_id
          )
        );

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
          v_scheduled_time,
          'notif_' || v_delivery_id::text,
          jsonb_build_object(
            'event_id', v_event_id,
            'delivery_id', v_delivery_id,
            'channel', 'push',
            'event_type', p_event_type,
            'correlationId', v_correlation_id
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
        status,
        correlation_id
      ) VALUES (
        v_event_id,
        v_subscription.id,
        v_subscription.user_id,
        'in_app',
        p_payload,
        'pending',
        v_correlation_id
      ) RETURNING id INTO v_delivery_id;

      v_delivery_count := v_delivery_count + 1;

      -- LOG: Delivery created
      PERFORM log_notification_event(
        'info',
        'Delivery created',
        'emit_notification_event',
        v_correlation_id,
        v_event_id,
        v_delivery_id,
        v_subscription.user_id,
        jsonb_build_object(
          'channel', 'in_app',
          'delivery_id', v_delivery_id,
          'recipient_user_id', v_subscription.user_id
        )
      );

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
          'correlationId', v_correlation_id
        )
      );
    END IF;

    -- Queue email notifications
    IF v_prefs.email_enabled THEN
      INSERT INTO notification_deliveries (
        event_id,
        subscription_id,
        recipient_user_id,
        channel,
        payload,
        status,
        correlation_id
      ) VALUES (
        v_event_id,
        v_subscription.id,
        v_subscription.user_id,
        'email',
        p_payload,
        'pending',
        v_correlation_id
      ) RETURNING id INTO v_delivery_id;

      v_delivery_count := v_delivery_count + 1;

      -- LOG: Delivery created
      PERFORM log_notification_event(
        'info',
        'Delivery created',
        'emit_notification_event',
        v_correlation_id,
        v_event_id,
        v_delivery_id,
        v_subscription.user_id,
        jsonb_build_object(
          'channel', 'email',
          'delivery_id', v_delivery_id,
          'recipient_user_id', v_subscription.user_id
        )
      );

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
          'correlationId', v_correlation_id
        )
      );
    END IF;

    -- Queue SMS notifications
    IF v_prefs.sms_enabled THEN
      INSERT INTO notification_deliveries (
        event_id,
        subscription_id,
        recipient_user_id,
        channel,
        payload,
        status,
        correlation_id
      ) VALUES (
        v_event_id,
        v_subscription.id,
        v_subscription.user_id,
        'sms',
        p_payload,
        'pending',
        v_correlation_id
      ) RETURNING id INTO v_delivery_id;

      v_delivery_count := v_delivery_count + 1;

      -- LOG: Delivery created
      PERFORM log_notification_event(
        'info',
        'Delivery created',
        'emit_notification_event',
        v_correlation_id,
        v_event_id,
        v_delivery_id,
        v_subscription.user_id,
        jsonb_build_object(
          'channel', 'sms',
          'delivery_id', v_delivery_id,
          'recipient_user_id', v_subscription.user_id
        )
      );

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
          'correlationId', v_correlation_id
        )
      );
    END IF;
  END LOOP;

  -- LOG: Processing complete summary
  PERFORM log_notification_event(
    'info',
    'Notification event processing complete',
    'emit_notification_event',
    v_correlation_id,
    v_event_id,
    NULL,
    p_target_user_id,
    jsonb_build_object('event_type', p_event_type),
    jsonb_build_object(
      'subscriptions_matched', v_subscription_count,
      'deliveries_created', v_delivery_count
    )
  );

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION emit_notification_event IS 'Emits a notification event and queues deliveries to all subscribers based on their preferences. Supports optional scheduled_for parameter to delay notification delivery. Automatically extracts or generates correlation IDs for end-to-end request tracing. Logs all operations to notification_logs for debugging.';

-- =====================================================
-- MIGRATION NOTES
-- =====================================================
--
-- This migration adds comprehensive logging to the notification system:
--
-- 1. Creates log_notification_event() helper function for database logging
-- 2. Updates emit_notification_event() to log at key points:
--    - Event creation start
--    - Event created
--    - Subscription matched (for each subscription)
--    - Delivery created (for each delivery)
--    - Processing complete summary
--
-- Benefits:
-- - Visibility into subscription matching logic
-- - Debug why deliveries weren't created
-- - See delivery count summaries
-- - Trace entire flow via correlation ID
-- - Non-blocking logging (won't fail transactions)
--
-- IMPORTANT: This migration depends on:
-- - 20251011_create_notification_logs_table.sql (creates notification_logs table)
-- - 20251011_add_correlation_id_columns.sql (adds correlation_id columns)
-- - 20251011_emit_notification_event_correlation_support.sql (adds correlation support)
--
-- Migration order:
-- 1. create_notification_logs_table
-- 2. add_correlation_id_columns
-- 3. emit_notification_event_correlation_support
-- 4. add_notification_logging_helper (this file)
--
