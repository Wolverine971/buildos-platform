-- packages/shared-types/src/functions/get_sms_notification_stats.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_sms_notification_stats(p_interval text DEFAULT '24 hours'::text)
 RETURNS TABLE(total_users_with_phone bigint, users_phone_verified bigint, users_sms_enabled bigint, users_opted_out bigint, phone_verification_rate numeric, sms_adoption_rate numeric, opt_out_rate numeric, total_sms_sent_24h bigint, sms_delivery_rate_24h numeric, avg_sms_delivery_time_seconds numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH sms_prefs AS (
    SELECT
      COUNT(DISTINCT usp.user_id) FILTER (WHERE usp.phone_number IS NOT NULL) AS with_phone,
      COUNT(DISTINCT usp.user_id) FILTER (WHERE usp.phone_verified = true) AS verified,
      COUNT(DISTINCT usp.user_id) FILTER (
        WHERE usp.phone_number IS NOT NULL
          AND usp.phone_verified = true
          AND COALESCE(usp.opted_out, false) = false
          AND (
            COALESCE(unp.sms_enabled, false) = true
            OR COALESCE(unp.should_sms_daily_brief, false) = true
            OR COALESCE(usp.event_reminders_enabled, false) = true
            OR COALESCE(usp.morning_kickoff_enabled, false) = true
            OR COALESCE(usp.evening_recap_enabled, false) = true
            OR COALESCE(usp.urgent_alerts, false) = true
          )
      ) AS enabled,
      COUNT(DISTINCT usp.user_id) FILTER (
        WHERE usp.phone_verified = true
          AND COALESCE(usp.opted_out, false) = true
      ) AS opted_out
    FROM user_sms_preferences usp
    LEFT JOIN user_notification_preferences unp ON unp.user_id = usp.user_id
  ),
  sms_period AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked')) AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')) AS delivered_count,
      AVG(EXTRACT(EPOCH FROM (delivered_at - COALESCE(sent_at, created_at))))
        FILTER (WHERE delivered_at IS NOT NULL AND status IN ('delivered', 'opened', 'clicked')) AS avg_delivery_seconds
    FROM notification_deliveries
    WHERE channel = 'sms'
      AND created_at >= NOW() - p_interval::INTERVAL
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
    (SELECT sent_count FROM sms_period),
    ROUND(
      (SELECT delivered_count FROM sms_period)::NUMERIC / NULLIF((SELECT sent_count FROM sms_period)::NUMERIC, 0) * 100,
      2
    ),
    (SELECT avg_delivery_seconds FROM sms_period)::NUMERIC;
END;
$function$
