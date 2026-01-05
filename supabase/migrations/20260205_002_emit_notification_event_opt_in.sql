-- supabase/migrations/20260205_002_emit_notification_event_opt_in.sql
-- =====================================================
-- Update emit_notification_event to enforce explicit opt-in
-- =====================================================
-- Changes:
--   - No fallback defaults when preferences are missing (fail closed)
--   - Daily brief channels respect should_*_daily_brief
--   - Queue job metadata includes event_id + event_type
--   - Only use subscriptions created via explicit opt-in or admin_only
-- =====================================================

BEGIN;

DROP FUNCTION IF EXISTS emit_notification_event(
  TEXT, TEXT, UUID, UUID, JSONB, JSONB, TIMESTAMPTZ
);

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
  v_is_daily_brief BOOLEAN;
BEGIN
  v_is_daily_brief := p_event_type IN ('brief.completed', 'brief.failed');

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

  -- Find active subscriptions for this event type (explicit opt-in only)
  FOR v_subscription IN
    SELECT * FROM notification_subscriptions
    WHERE event_type = p_event_type
      AND is_active = true
      AND (admin_only IS TRUE OR created_by IS NOT NULL)
      AND (p_target_user_id IS NULL OR user_id = p_target_user_id)
  LOOP
    -- Get user notification preferences (no event_type filter)
    SELECT * INTO v_prefs
    FROM user_notification_preferences
    WHERE user_id = v_subscription.user_id;

    -- If preferences are missing, fail closed
    IF NOT FOUND THEN
      RAISE NOTICE 'No preferences found for user %, skipping', v_subscription.user_id;
      CONTINUE;
    END IF;

    -- Queue push notifications
    IF COALESCE(v_prefs.push_enabled, false) THEN
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
            'event_id', v_event_id,
            'event_type', p_event_type,
            'delivery_id', v_delivery_id,
            'channel', 'push',
            'correlationId', v_correlation_id
          )
        );
      END LOOP;
    END IF;

    -- Queue in-app notifications
    IF COALESCE(v_prefs.in_app_enabled, false) THEN
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
          'event_id', v_event_id,
          'event_type', p_event_type,
          'delivery_id', v_delivery_id,
          'channel', 'in_app',
          'correlationId', v_correlation_id
        )
      );
    END IF;

    -- Queue email notifications
    IF (
      (v_is_daily_brief AND COALESCE(v_prefs.should_email_daily_brief, false))
      OR (NOT v_is_daily_brief AND COALESCE(v_prefs.email_enabled, false))
    ) THEN
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
          'event_id', v_event_id,
          'event_type', p_event_type,
          'delivery_id', v_delivery_id,
          'channel', 'email',
          'correlationId', v_correlation_id
        )
      );
    END IF;

    -- Queue SMS notifications
    IF (
      (v_is_daily_brief AND COALESCE(v_prefs.should_sms_daily_brief, false))
      OR (NOT v_is_daily_brief AND COALESCE(v_prefs.sms_enabled, false))
    ) THEN
      DECLARE
        v_sms_prefs RECORD;
      BEGIN
        SELECT * INTO v_sms_prefs
        FROM user_sms_preferences
        WHERE user_id = v_subscription.user_id
          AND phone_verified = true
          AND opted_out = false
          AND phone_number IS NOT NULL;

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
              'event_id', v_event_id,
              'event_type', p_event_type,
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

GRANT EXECUTE ON FUNCTION emit_notification_event TO authenticated;
GRANT EXECUTE ON FUNCTION emit_notification_event TO service_role;

COMMENT ON FUNCTION emit_notification_event IS
  'Creates notification event and deliveries. Opt-in enforcement (2026-02-05): skips when preferences missing, uses should_*_daily_brief for brief events, and stores event_type in queue metadata.';

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✓ emit_notification_event() updated for explicit opt-in';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Skips users without preferences (fail closed)';
  RAISE NOTICE '  - Daily brief uses should_email_daily_brief / should_sms_daily_brief';
  RAISE NOTICE '  - Queue metadata includes event_id + event_type';
  RAISE NOTICE '  - Subscriptions require explicit opt-in (created_by or admin_only)';
  RAISE NOTICE '============================================================';
END $$;

COMMIT;
