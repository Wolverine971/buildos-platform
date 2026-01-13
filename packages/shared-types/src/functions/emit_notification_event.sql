-- packages/shared-types/src/functions/emit_notification_event.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.emit_notification_event(p_event_type text, p_event_source text DEFAULT 'api_action'::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
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
$function$
