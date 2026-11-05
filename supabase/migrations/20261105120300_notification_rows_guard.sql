-- supabase/migrations/20261105120300_notification_rows_guard.sql
--
-- Security audit 2026-11-05. Three notification tables trusted rows that signed-in users (or
-- anyone) could write:
--
-- 1. notification_deliveries: the recipient could UPDATE every column of their own delivery
--    (payload, status, attempts, channel, recipient, event ids). The worker reads the stored
--    payload when it sends, so a user could rewrite a delivery into an arbitrary email sent
--    from dj@build-os.com. A signed-in non-admin may now only mark a delivery opened or
--    clicked (opened_at, clicked_at, status -> opened/clicked, updated_at), which is what the
--    /notifications page and the click-tracking endpoint do. Admins keep full update (the
--    admin retry endpoint resets deliveries with the admin's own session). The worker and
--    the tracking endpoints run as service_role and are unaffected.
--
-- 2. notification_subscriptions: any user could subscribe to admin-only events and receive
--    every new user's email through user.signup. A non-admin can no longer create or keep an
--    active subscription to an admin event, and emit_notification_event now skips non-admin
--    subscribers for admin events, so rows created before this migration stop receiving.
--    The admin event list matches NotificationTypeSelector.svelte (adminOnly: true).
--
-- 3. notification_tracking_links: leftover policies let anon list every SMS short link and
--    any signed-in user rewrite any link's destination. The only readers and writers are the
--    /l/[short_code] route (admin client) and the worker's create_tracking_link call
--    (service role), so the table and its helper functions become server-only.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- ---------------------------------------------------------------------------------------------
-- Admin-only event types. Plain lookup with no data access; the subscription guard below runs
-- as the signed-in caller, so authenticated needs EXECUTE.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_only_notification_event(p_event_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT p_event_type IN (
    'user.signup',
    'user.trial_expired',
    'payment.failed',
    'error.critical',
    'billing_ops_anomaly'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_only_notification_event(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_only_notification_event(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 1. notification_deliveries: signed-in non-admins may only record opens and clicks.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_notification_delivery_user_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_open_click_columns text[] := ARRAY['opened_at', 'clicked_at', 'status', 'updated_at'];
BEGIN
  -- Server paths (service_role, SECURITY DEFINER owners) are not restricted.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF current_user = 'authenticated' AND public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_open_click_columns) IS DISTINCT FROM (to_jsonb(OLD) - v_open_click_columns) THEN
    RAISE EXCEPTION 'notification deliveries can only be marked opened or clicked'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('opened', 'clicked') THEN
    RAISE EXCEPTION 'notification delivery status can only change to opened or clicked'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_notification_delivery_user_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_notification_delivery_user_update ON public.notification_deliveries;
CREATE TRIGGER guard_notification_delivery_user_update
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_delivery_user_update();

-- No client path inserts or deletes deliveries; make that explicit.
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.notification_deliveries
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. notification_subscriptions: admin events are for admins only.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_notification_subscription_admin_events()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Turning a subscription off is always allowed.
  IF NEW.is_active IS FALSE THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_only_notification_event(NEW.event_type)
     AND NOT (current_user = 'authenticated' AND public.is_admin()) THEN
    RAISE EXCEPTION 'only admins can subscribe to %', NEW.event_type
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_notification_subscription_admin_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_notification_subscription_admin_events ON public.notification_subscriptions;
CREATE TRIGGER guard_notification_subscription_admin_events
  BEFORE INSERT OR UPDATE ON public.notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_subscription_admin_events();

-- Fan-out: the production definition from 20261019191933 (identical to the 2026-10-25
-- snapshot), plus the admin-event recipient filter in the subscription loop.
CREATE OR REPLACE FUNCTION public.emit_notification_event(p_event_type text, p_event_source text DEFAULT 'api_action'::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
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
  v_existing_event_id UUID;
  v_dedup_key TEXT;
  v_dedup_brief_id TEXT;
  v_dedup_brief_date TEXT;
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

  -- Daily brief generation can legitimately run longer than the queue stall window.
  -- If a stalled-job recovery reclaims the same queue row while the first worker is
  -- still alive, make event emission idempotent for the same user/brief.
  IF v_is_daily_brief AND p_target_user_id IS NOT NULL THEN
    v_dedup_brief_id := NULLIF(p_payload->>'brief_id', '');
    v_dedup_brief_date := NULLIF(p_payload->>'brief_date', '');

    IF v_dedup_brief_id IS NOT NULL OR v_dedup_brief_date IS NOT NULL THEN
      v_dedup_key := concat_ws(
        ':',
        'notification',
        p_event_type,
        p_target_user_id::text,
        COALESCE(v_dedup_brief_id, v_dedup_brief_date)
      );

      PERFORM pg_advisory_xact_lock(hashtext(v_dedup_key));

      SELECT id INTO v_existing_event_id
      FROM notification_events
      WHERE event_type = p_event_type
        AND target_user_id = p_target_user_id
        AND (
          (v_dedup_brief_id IS NOT NULL AND payload->>'brief_id' = v_dedup_brief_id)
          OR (
            v_dedup_brief_id IS NULL
            AND v_dedup_brief_date IS NOT NULL
            AND payload->>'brief_date' = v_dedup_brief_date
          )
        )
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_existing_event_id IS NOT NULL THEN
        RETURN v_existing_event_id;
      END IF;
    END IF;
  END IF;

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
      -- Admin events (user.signup carries the new user's email) only reach admins.
      AND (
        NOT public.is_admin_only_notification_event(p_event_type)
        OR EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = notification_subscriptions.user_id AND u.is_admin IS TRUE
        )
      )
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

    -- Queue SMS notifications only while the shared notification SMS switch is on.
    IF public.get_notification_sms_sending_enabled() AND (
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
$function$;
REVOKE ALL ON FUNCTION public.emit_notification_event(text, text, uuid, uuid, jsonb, jsonb, timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_notification_event(text, text, uuid, uuid, jsonb, jsonb, timestamptz)
TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. notification_tracking_links: server-only.
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read tracking links" ON public.notification_tracking_links;
DROP POLICY IF EXISTS "Authenticated users can update tracking links" ON public.notification_tracking_links;
ALTER TABLE public.notification_tracking_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_tracking_links FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_tracking_link(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_link_click_stats(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_short_code(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tracking_link(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_link_click_stats(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_short_code(integer) TO service_role;
