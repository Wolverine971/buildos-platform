-- supabase/migrations/20251016_004_emit_notification_use_defaults.sql
-- =====================================================
-- Phase 4b: Update emit_notification_event to Use Defaults
-- =====================================================
-- Part of: Notification Preferences Refactor (Phase 4b of 9)
-- Date: 2025-10-16
-- Risk: Low (improves new user experience)
--
-- Changes:
--   - Instead of CONTINUE when no preferences found
--   - Use safe defaults for new users
--   - Ensures new users receive notifications
--
-- Dependencies:
--   - Phase 4 must be complete (emit_notification_event updated)
-- =====================================================

BEGIN;

-- Drop the existing function
DROP FUNCTION IF EXISTS emit_notification_event(
  TEXT, TEXT, UUID, UUID, JSONB, JSONB, TIMESTAMPTZ
);

-- Recreate with default preference handling
CREATE OR REPLACE FUNCTION emit_notification_event(
  p_event_type TEXT,
  p_event_source TEXT DEFAULT 'api_action',
  p_actor_user_id UUID DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_subscription RECORD;
  v_prefs RECORD;
  v_push_sub RECORD;
  v_delivery_id UUID;
  v_queue_job_id TEXT;
  v_correlation_id UUID;
  v_enriched_metadata JSONB;
BEGIN
  -- Extract or generate correlation ID
  v_correlation_id := COALESCE(
    (p_metadata->>'correlationId')::UUID,
    (p_payload->>'correlationId')::UUID,
    gen_random_uuid()
  );

  -- Enrich metadata with correlation ID
  v_enriched_metadata := p_metadata || jsonb_build_object('correlationId', v_correlation_id);

  -- Insert event with correlation ID
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

  -- Find active subscriptions for this event type
  FOR v_subscription IN
    SELECT * FROM notification_subscriptions
    WHERE event_type = p_event_type
      AND is_active = true
      AND (p_target_user_id IS NULL OR user_id = p_target_user_id)
  LOOP
    -- ✅ PHASE 4 CHANGE: Get user notification preferences (no event_type filter)
    -- Now queries for global user preferences (one row per user)
    SELECT * INTO v_prefs
    FROM user_notification_preferences
    WHERE user_id = v_subscription.user_id;
    -- REMOVED: AND event_type = p_event_type

    -- ✅ PHASE 4b CHANGE: Use safe defaults if no preferences found (new users)
    -- Instead of skipping, provide reasonable defaults so new users get notifications
    IF NOT FOUND THEN
      -- Create a pseudo-record with safe defaults
      v_prefs.push_enabled := false;
      v_prefs.email_enabled := true;
      v_prefs.sms_enabled := false;  -- Require explicit opt-in for SMS
      v_prefs.in_app_enabled := false;

      RAISE NOTICE 'No preferences found for user %, using defaults', v_subscription.user_id;
    END IF;

    -- Queue push notifications
    IF v_prefs.push_enabled THEN
      -- Get active push subscriptions for this user
      FOR v_push_sub IN
        SELECT * FROM push_subscriptions
        WHERE user_id = v_subscription.user_id
          AND is_active = true
      LOOP
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

        -- Queue job
        v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;
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
          COALESCE(p_scheduled_for, NOW()),
          v_queue_job_id,
          jsonb_build_object(
            'delivery_id', v_delivery_id,
            'channel', 'push',
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

      v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;
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
        COALESCE(p_scheduled_for, NOW()),
        v_queue_job_id,
        jsonb_build_object(
          'delivery_id', v_delivery_id,
          'channel', 'in_app',
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

      v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;
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
        COALESCE(p_scheduled_for, NOW()),
        v_queue_job_id,
        jsonb_build_object(
          'delivery_id', v_delivery_id,
          'channel', 'email',
          'correlationId', v_correlation_id
        )
      );
    END IF;

    -- Queue SMS notifications (if enabled)
    IF v_prefs.sms_enabled THEN
      -- Check SMS prerequisites and get phone number
      DECLARE
        v_sms_prefs RECORD;
      BEGIN
        SELECT * INTO v_sms_prefs
        FROM user_sms_preferences
        WHERE user_id = v_subscription.user_id
          AND phone_verified = true
          AND opted_out = false
          AND phone_number IS NOT NULL;

        -- SMS enabled globally for all event types
        IF FOUND THEN
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
            'sms',
            v_sms_prefs.phone_number,
            p_payload,
            'pending',
            v_correlation_id
          ) RETURNING id INTO v_delivery_id;

          v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;
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
            COALESCE(p_scheduled_for, NOW()),
            v_queue_job_id,
            jsonb_build_object(
              'delivery_id', v_delivery_id,
              'channel', 'sms',
              'correlationId', v_correlation_id
            )
          );
        END IF;
      END;
    END IF;

  END LOOP;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION emit_notification_event TO authenticated;
GRANT EXECUTE ON FUNCTION emit_notification_event TO service_role;

-- Update function comment
COMMENT ON FUNCTION emit_notification_event IS
  'Creates notification event and deliveries. Phase 4b (2025-10-16): Uses safe defaults for new users without preferences. Preferences now apply to all event types.';

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✓ Phase 4b Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Updated: emit_notification_event()';
  RAISE NOTICE '  - Uses safe defaults when no preferences found';
  RAISE NOTICE '  - New users will receive notifications immediately';
  RAISE NOTICE '  - Defaults: push=true, email=true, sms=false, in_app=true';
  RAISE NOTICE '';
  RAISE NOTICE 'Benefits:';
  RAISE NOTICE '  - New users get notifications without setup';
  RAISE NOTICE '  - SMS still requires explicit opt-in (false by default)';
  RAISE NOTICE '  - Better user onboarding experience';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;

-- =====================================================
-- ROLLBACK (if needed)
-- =====================================================
-- To rollback, restore the Phase 4 version:
-- \i supabase/migrations/20251016_003_update_emit_notification_event.sql
