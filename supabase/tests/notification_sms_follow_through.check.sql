-- supabase/tests/notification_sms_follow_through.check.sql
-- Rehearsal only: seed old deliveries before replaying the migration to prove its backfill.
INSERT INTO auth.users (id, email) VALUES
  ('13900000-0000-4000-8000-000000000001', 'sms-follow-through@example.test');
INSERT INTO public.users (id, email) VALUES
  ('13900000-0000-4000-8000-000000000001', 'sms-follow-through@example.test') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_notification_preferences (user_id, sms_enabled, should_sms_daily_brief, in_app_enabled)
VALUES ('13900000-0000-4000-8000-000000000001', true, true, true)
ON CONFLICT (user_id) DO UPDATE SET sms_enabled=true, should_sms_daily_brief=true, in_app_enabled=true;
INSERT INTO public.user_sms_preferences (user_id, phone_number, phone_verified, opted_out)
VALUES ('13900000-0000-4000-8000-000000000001', '+12125550139', true, false)
ON CONFLICT (user_id) DO UPDATE SET phone_number=EXCLUDED.phone_number, phone_verified=true, opted_out=false;
INSERT INTO public.notification_subscriptions (user_id, event_type, is_active, created_by)
VALUES ('13900000-0000-4000-8000-000000000001', 'brief.completed', true, '13900000-0000-4000-8000-000000000001')
ON CONFLICT (user_id, event_type) DO UPDATE SET is_active=true, created_by=EXCLUDED.created_by;
INSERT INTO public.notification_deliveries (id, recipient_user_id, channel, status, attempts, external_id)
VALUES
  ('13900000-0000-4000-8000-000000000010', '13900000-0000-4000-8000-000000000001', 'sms', 'pending', 1, 'old-provider-reference'),
  ('13900000-0000-4000-8000-000000000011', '13900000-0000-4000-8000-000000000001', 'email', 'pending', 0, NULL),
  ('13900000-0000-4000-8000-000000000012', '13900000-0000-4000-8000-000000000001', 'sms', 'sent', 1, NULL);

\ir ../migrations/20261019191933_notification_sms_follow_through.sql

DO $$
DECLARE
  v_event uuid;
  v_failures text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_deliveries
    WHERE id='13900000-0000-4000-8000-000000000010' AND status='cancelled'
      AND attempts=1 AND external_id='old-provider-reference' AND last_error='cancelled: sms_disabled') THEN
    v_failures := array_append(v_failures, 'Backfill must cancel pending SMS and preserve attempt/provider history');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_deliveries WHERE id='13900000-0000-4000-8000-000000000011' AND status='pending')
    OR NOT EXISTS (SELECT 1 FROM public.notification_deliveries WHERE id='13900000-0000-4000-8000-000000000012' AND status='sent') THEN
    v_failures := array_append(v_failures, 'Backfill changed a non-SMS or terminal delivery');
  END IF;
  BEGIN
    UPDATE public.notification_deliveries SET status='cancelled' WHERE id='13900000-0000-4000-8000-000000000011';
  EXCEPTION WHEN check_violation THEN
    v_failures := array_append(v_failures, 'Delivery constraint rejects cancelled');
  END;
  v_event := public.emit_notification_event('brief.completed', 'worker_job', NULL,
    '13900000-0000-4000-8000-000000000001', '{"brief_date":"2026-10-19","title":"Brief","body":"Ready"}', '{}');
  IF EXISTS (SELECT 1 FROM public.notification_deliveries WHERE event_id=v_event AND channel='sms') THEN
    v_failures := array_append(v_failures, 'Disabled SMS still creates deliveries');
  END IF;
  IF EXISTS (SELECT 1 FROM public.queue_jobs WHERE metadata->>'event_id'=v_event::text AND metadata->>'channel'='sms') THEN
    v_failures := array_append(v_failures, 'Disabled SMS still creates queue jobs');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_deliveries WHERE event_id=v_event AND channel='in_app') THEN
    v_failures := array_append(v_failures, 'Disabling SMS broke in-app delivery');
  END IF;
  IF cardinality(v_failures) > 0 THEN RAISE EXCEPTION '%', array_to_string(v_failures, '; '); END IF;
END;
$$;

-- Both the SQL emitter and worker-facing RPC read this same setting.
UPDATE private.notification_sms_settings SET enabled=true WHERE singleton;
DO $$
DECLARE v_event uuid;
BEGIN
  ASSERT public.get_notification_sms_sending_enabled(), 'Worker RPC must read the enabled setting';
  v_event := public.emit_notification_event('brief.completed', 'worker_job', NULL,
    '13900000-0000-4000-8000-000000000001', '{"brief_date":"2026-10-20","title":"Brief","body":"Ready"}', '{}');
  ASSERT (SELECT count(*)=1 FROM public.notification_deliveries WHERE event_id=v_event AND channel='sms'), 'Enabled SMS must create one delivery';
  ASSERT (SELECT count(*)=1 FROM public.queue_jobs WHERE metadata->>'event_id'=v_event::text AND metadata->>'channel'='sms'), 'Enabled SMS must create one job';
  PERFORM public.emit_notification_event('brief.completed', 'worker_job', NULL,
    '13900000-0000-4000-8000-000000000001', '{"brief_date":"2026-10-20","title":"Brief","body":"Ready"}', '{}');
  ASSERT (SELECT count(*)=1 FROM public.notification_deliveries WHERE event_id=v_event AND channel='sms'), 'Brief dedup must remain intact';
  ASSERT NOT has_function_privilege('anon', 'public.get_notification_sms_sending_enabled()', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public.get_notification_sms_sending_enabled()', 'EXECUTE');
END;
$$;
-- The rehearsal recreates role names as NOLOGIN without their attributes.
-- Production SELECT verified 2026-10-19: service_role has BYPASSRLS. Model that
-- existing attribute here so the worker RPC/queue test uses the real role contract.
ALTER ROLE service_role BYPASSRLS;
SET ROLE service_role;
DO $$
DECLARE
  v_first uuid;
  v_retry uuid;
  v_until timestamptz := now() + interval '1 hour';
  v_key text := 'notification-deferred:13900000-0000-4000-8000-000000000010:' || v_until::text;
BEGIN
  ASSERT public.get_notification_sms_sending_enabled(), 'Worker role must read the enabled setting';
  v_first := public.add_queue_job(
    p_user_id := '13900000-0000-4000-8000-000000000001',
    p_job_type := 'send_notification',
    p_metadata := '{"delivery_id":"13900000-0000-4000-8000-000000000010","channel":"sms"}',
    p_scheduled_for := v_until,
    p_dedup_key := v_key
  );
  v_retry := public.add_queue_job(
    p_user_id := '13900000-0000-4000-8000-000000000001',
    p_job_type := 'send_notification',
    p_metadata := '{"delivery_id":"13900000-0000-4000-8000-000000000010","channel":"sms"}',
    p_scheduled_for := v_until,
    p_dedup_key := v_key
  );
  ASSERT v_first = v_retry, 'Replaying a quiet-hours deferral must reuse the future queue job';
  ASSERT (SELECT count(*)=1 FROM public.queue_jobs WHERE dedup_key=v_key), 'Deferral created duplicate queue jobs';
  ASSERT (SELECT scheduled_for=v_until AND status='pending' FROM public.queue_jobs WHERE id=v_first), 'Deferral lost its scheduled time';
END $$;
RESET ROLE;
ALTER ROLE service_role NOBYPASSRLS;
DELETE FROM private.notification_sms_settings;
DO $$ BEGIN
  ASSERT NOT public.get_notification_sms_sending_enabled(), 'Missing setting must fail closed';
END $$;
