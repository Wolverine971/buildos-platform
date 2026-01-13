-- packages/shared-types/src/functions/get_sms_notification_stats.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_sms_notification_stats()
 RETURNS TABLE(total_users_with_phone bigint, users_phone_verified bigint, users_sms_enabled bigint, users_opted_out bigint, phone_verification_rate numeric, sms_adoption_rate numeric, opt_out_rate numeric, total_sms_sent_24h bigint, sms_delivery_rate_24h numeric, avg_sms_delivery_time_seconds numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH sms_prefs AS (
    SELECT
      COUNT(*) FILTER (WHERE phone_number IS NOT NULL) AS with_phone,
      COUNT(*) FILTER (WHERE phone_verified = true) AS verified,
      COUNT(*) FILTER (WHERE phone_verified = true) AS enabled,  -- Assuming verified = enabled
      COUNT(*) FILTER (WHERE opted_out = true) AS opted_out
    FROM user_sms_preferences
  ),
  sms_24h AS (
    SELECT
      COUNT(*) AS sent_count,
      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
      -- FIXED: Added explicit NULL filter for delivered_at
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
$function$
