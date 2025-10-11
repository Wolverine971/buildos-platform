-- =====================================================
-- FIX NOTIFICATION ANALYTICS BUGS
-- =====================================================
-- Fixes:
-- 1. Channel performance "delivered" metric counting "sent" instead of "delivered"
-- 2. Adds separate "sent" metric
-- 3. Adds NULL checks to delivery time calculations
-- 4. Fixes SMS stats delivery time NULL handling
-- =====================================================

-- =====================================================
-- 1. FIX CHANNEL PERFORMANCE FUNCTION
-- =====================================================
-- Must drop first because we're changing the return type (adding columns)

DROP FUNCTION IF EXISTS get_notification_channel_performance(TEXT);

CREATE OR REPLACE FUNCTION get_notification_channel_performance(
  p_interval TEXT DEFAULT '7 days'
)
RETURNS TABLE (
  channel TEXT,
  total_sent BIGINT,
  sent BIGINT,              -- NEW: Explicit sent count
  delivered BIGINT,         -- FIXED: Now counts 'delivered' status correctly
  opened BIGINT,
  clicked BIGINT,
  failed BIGINT,
  success_rate NUMERIC,     -- Based on 'sent'
  delivery_rate NUMERIC,    -- NEW: Based on 'delivered'
  open_rate NUMERIC,
  click_rate NUMERIC,
  avg_delivery_time_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    nd.channel,
    COUNT(*) AS total_sent,
    COUNT(*) FILTER (WHERE nd.status = 'sent') AS sent,
    COUNT(*) FILTER (WHERE nd.status = 'delivered') AS delivered,  -- FIXED
    COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,
    COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,
    COUNT(*) FILTER (WHERE nd.status = 'failed') AS failed,
    -- Success rate: % that were sent successfully
    ROUND(
      (COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100),
      2
    ) AS success_rate,
    -- Delivery rate: % that were confirmed delivered (NEW)
    ROUND(
      (COUNT(*) FILTER (WHERE nd.status = 'delivered')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS delivery_rate,
    -- Open rate: % of sent that were opened
    ROUND(
      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS open_rate,
    -- Click rate: % of opened that were clicked
    ROUND(
      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0) * 100),
      2
    ) AS click_rate,
    -- Average delivery time with explicit NULL filter (FIXED)
    ROUND(
      AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)) * 1000) FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC,
      2
    ) AS avg_delivery_time_ms
  FROM notification_deliveries nd
  WHERE nd.created_at > NOW() - p_interval::INTERVAL
  GROUP BY nd.channel
  ORDER BY total_sent DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_notification_channel_performance IS 'Get performance metrics broken down by notification channel (FIXED: delivered metric now accurate)';

-- =====================================================
-- 2. FIX EVENT PERFORMANCE FUNCTION
-- =====================================================
-- Add NULL check to delivery time calculation
-- Drop first as a safety measure to ensure clean migration

DROP FUNCTION IF EXISTS get_notification_event_performance(TEXT);

CREATE OR REPLACE FUNCTION get_notification_event_performance(
  p_interval TEXT DEFAULT '30 days'
)
RETURNS TABLE (
  event_type TEXT,
  total_events BIGINT,
  total_deliveries BIGINT,
  unique_subscribers BIGINT,
  avg_delivery_time_seconds NUMERIC,
  open_rate NUMERIC,
  click_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ne.event_type,
    COUNT(DISTINCT ne.id) AS total_events,
    COUNT(nd.id) AS total_deliveries,
    COUNT(DISTINCT ns.user_id) AS unique_subscribers,
    -- FIXED: Added explicit NULL filter
    ROUND(
      AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at))) FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC,
      2
    ) AS avg_delivery_time_seconds,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS open_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0) * 100),
      2
    ) AS click_rate
  FROM notification_events ne
  LEFT JOIN notification_deliveries nd ON nd.event_id = ne.id
  LEFT JOIN notification_subscriptions ns ON ns.event_type = ne.event_type
  WHERE ne.created_at > NOW() - p_interval::INTERVAL
  GROUP BY ne.event_type
  ORDER BY total_events DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_notification_event_performance IS 'Get performance metrics broken down by event type (FIXED: NULL checks added)';

-- =====================================================
-- 3. FIX SMS NOTIFICATION STATS FUNCTION
-- =====================================================
-- Add NULL check to SMS delivery time calculation
-- Drop first as a safety measure to ensure clean migration

DROP FUNCTION IF EXISTS get_sms_notification_stats();

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
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_sms_notification_stats IS 'Get SMS notification statistics (FIXED: NULL checks added to delivery time)';

-- =====================================================
-- NOTES
-- =====================================================
-- Changes made:
-- 1. Added separate "sent" column to channel performance (previously mislabeled as "delivered")
-- 2. Fixed "delivered" column to count status='delivered' instead of status='sent'
-- 3. Added new "delivery_rate" metric showing % of sent that were confirmed delivered
-- 4. Added explicit NULL filters to all AVG(sent_at - created_at) calculations
-- 5. Fixed SMS stats to only calculate delivery time for actually delivered messages
--
-- BREAKING CHANGE WARNING:
-- The channel performance function now returns an additional column "sent" and "delivery_rate".
-- The API endpoint may need to be updated to handle this new structure.
-- However, the "delivered" column now shows accurate data instead of misleading data.

-- =====================================================
-- RE-GRANT PERMISSIONS AFTER DROP
-- =====================================================
-- Functions need permissions re-granted after being dropped

GRANT EXECUTE ON FUNCTION get_notification_channel_performance(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_event_performance(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sms_notification_stats() TO authenticated;
