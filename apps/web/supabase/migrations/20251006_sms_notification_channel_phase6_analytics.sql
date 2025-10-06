-- =====================================================
-- SMS NOTIFICATION CHANNEL - PHASE 6: ADMIN DASHBOARD ANALYTICS
-- =====================================================
-- Adds SMS-specific analytics function for admin dashboard
-- =====================================================

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
  WITH phone_stats AS (
    SELECT
      COUNT(*) AS total_with_phone,
      COUNT(*) FILTER (WHERE phone_verified = true) AS verified,
      COUNT(*) FILTER (WHERE opted_out = true) AS opted_out
    FROM user_sms_preferences
    WHERE phone_number IS NOT NULL
  ),
  sms_preference_stats AS (
    SELECT
      COUNT(DISTINCT unp.user_id) AS sms_enabled_users
    FROM user_notification_preferences unp
    JOIN user_sms_preferences usp ON usp.user_id = unp.user_id
    WHERE unp.sms_enabled = true
      AND usp.phone_verified = true
  ),
  recent_sms_stats AS (
    SELECT
      COUNT(*) AS total_sent,
      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
      AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) AS avg_delivery_seconds
    FROM notification_deliveries
    WHERE channel = 'sms'
      AND created_at > NOW() - INTERVAL '24 hours'
  )
  SELECT
    ps.total_with_phone,
    ps.verified,
    COALESCE(sps.sms_enabled_users, 0),
    ps.opted_out,
    -- Phone verification rate
    ROUND(
      (ps.verified::NUMERIC / NULLIF(ps.total_with_phone::NUMERIC, 0) * 100),
      2
    ),
    -- SMS adoption rate (SMS enabled / verified phones)
    ROUND(
      (COALESCE(sps.sms_enabled_users, 0)::NUMERIC / NULLIF(ps.verified::NUMERIC, 0) * 100),
      2
    ),
    -- Opt-out rate
    ROUND(
      (ps.opted_out::NUMERIC / NULLIF(ps.verified::NUMERIC, 0) * 100),
      2
    ),
    COALESCE(rss.total_sent, 0),
    -- SMS delivery rate (24h)
    ROUND(
      (COALESCE(rss.delivered, 0)::NUMERIC / NULLIF(COALESCE(rss.total_sent, 0)::NUMERIC, 0) * 100),
      2
    ),
    ROUND(COALESCE(rss.avg_delivery_seconds, 0)::NUMERIC, 2)
  FROM phone_stats ps
  CROSS JOIN sms_preference_stats sps
  CROSS JOIN recent_sms_stats rss;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_sms_notification_stats IS 'Get SMS-specific notification statistics including phone verification, adoption, and delivery metrics';

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_sms_notification_stats TO authenticated;
