-- packages/shared-types/src/functions/get_sms_notification_stats.sql
-- get_sms_notification_stats()
-- Get SMS notification statistics
-- Source: apps/web/supabase/migrations/20251011_fix_notification_analytics_bugs.sql

CREATE OR REPLACE FUNCTION get_sms_notification_stats()
RETURNS TABLE (
  total_users_with_phone BIGINT,
  users_phone_verified BIGINT,
  users_sms_enabled BIGINT,
  users_opted_out BIGINT,
  phone_verification_rate NUMERIC,
  sms_adoption_rate NUMERIC,
  opt_out_rate NUMERIC,
  total_sms_sent_24h BIGINT,
  sms_delivery_rate_24h NUMERIC,
  avg_sms_delivery_time_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH sms_prefs AS (
    SELECT
      COUNT(*) FILTER (WHERE phone_number IS NOT NULL) AS with_phone,
      COUNT(*) FILTER (WHERE phone_verified = true) AS verified,
      COUNT(*) FILTER (WHERE phone_verified = true) AS enabled,
      COUNT(*) FILTER (WHERE opted_out = true) AS opted_out
    FROM user_sms_preferences
  ),
  sms_24h AS (
    SELECT
      COUNT(*) AS sent_count,
      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
      AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) FILTER (WHERE delivered_at IS NOT NULL AND status = 'delivered') AS avg_delivery_seconds
    FROM notification_deliveries
    WHERE channel = 'sms'
      AND created_at >= NOW() - INTERVAL '24 hours'
  )
  SELECT
    (SELECT with_phone FROM sms_prefs),
    (SELECT verified FROM sms_prefs),
    (SELECT enabled FROM sms_prefs),
    (SELECT opted_out FROM sms_prefs),
    ROUND(
      (SELECT verified FROM sms_prefs)::NUMERIC / NULLIF((SELECT with_phone FROM sms_prefs)::NUMERIC, 0) * 100,
      2
    ),
    ROUND(
      (SELECT enabled FROM sms_prefs)::NUMERIC / NULLIF((SELECT verified FROM sms_prefs)::NUMERIC, 0) * 100,
      2
    ),
    ROUND(
      (SELECT opted_out FROM sms_prefs)::NUMERIC / NULLIF((SELECT verified FROM sms_prefs)::NUMERIC, 0) * 100,
      2
    ),
    (SELECT sent_count FROM sms_24h),
    ROUND(
      (SELECT delivered_count FROM sms_24h)::NUMERIC / NULLIF((SELECT sent_count FROM sms_24h)::NUMERIC, 0) * 100,
      2
    ),
    (SELECT avg_delivery_seconds FROM sms_24h)::NUMERIC;
END;
$$ LANGUAGE plpgsql STABLE;
