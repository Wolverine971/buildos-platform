-- =====================================================
-- NOTIFICATION SYSTEM - ANALYTICS RPC FUNCTIONS
-- =====================================================
-- Creates PostgreSQL functions for admin notification analytics dashboard
-- These functions power the /api/admin/notifications/analytics/* endpoints
-- =====================================================

-- =====================================================
-- 1. OVERVIEW METRICS
-- =====================================================

CREATE OR REPLACE FUNCTION get_notification_overview_metrics(
  p_interval TEXT DEFAULT '7 days',
  p_offset TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_sent BIGINT,
  delivery_success_rate NUMERIC,
  avg_open_rate NUMERIC,
  avg_click_rate NUMERIC
) AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
BEGIN
  -- Calculate time range
  IF p_offset IS NULL THEN
    v_end_time := NOW();
    v_start_time := NOW() - p_interval::INTERVAL;
  ELSE
    v_end_time := NOW() - p_offset::INTERVAL;
    v_start_time := v_end_time - p_interval::INTERVAL;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE nd.status = 'sent') AS total_sent,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100),
      2
    ) AS delivery_success_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS avg_open_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0) * 100),
      2
    ) AS avg_click_rate
  FROM notification_deliveries nd
  WHERE nd.created_at >= v_start_time
    AND nd.created_at < v_end_time;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_notification_overview_metrics IS 'Get high-level notification metrics for a time period';

-- =====================================================
-- 2. CHANNEL PERFORMANCE
-- =====================================================

CREATE OR REPLACE FUNCTION get_notification_channel_performance(
  p_interval TEXT DEFAULT '7 days'
)
RETURNS TABLE (
  channel TEXT,
  total_sent BIGINT,
  delivered BIGINT,
  opened BIGINT,
  clicked BIGINT,
  failed BIGINT,
  success_rate NUMERIC,
  open_rate NUMERIC,
  click_rate NUMERIC,
  avg_delivery_time_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    nd.channel,
    COUNT(*) AS total_sent,
    COUNT(*) FILTER (WHERE nd.status = 'sent') AS delivered,
    COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,
    COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,
    COUNT(*) FILTER (WHERE nd.status = 'failed') AS failed,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100),
      2
    ) AS success_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS open_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0) * 100),
      2
    ) AS click_rate,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)) * 1000)::NUMERIC,
      2
    ) AS avg_delivery_time_ms
  FROM notification_deliveries nd
  WHERE nd.created_at > NOW() - p_interval::INTERVAL
  GROUP BY nd.channel
  ORDER BY total_sent DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_notification_channel_performance IS 'Get performance metrics broken down by notification channel';

-- =====================================================
-- 3. EVENT TYPE PERFORMANCE
-- =====================================================

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
    ROUND(
      AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)))::NUMERIC,
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

COMMENT ON FUNCTION get_notification_event_performance IS 'Get performance metrics broken down by event type';

-- =====================================================
-- 4. DELIVERY TIMELINE
-- =====================================================

CREATE OR REPLACE FUNCTION get_notification_delivery_timeline(
  p_interval TEXT DEFAULT '7 days',
  p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (
  time_bucket TIMESTAMPTZ,
  sent BIGINT,
  delivered BIGINT,
  opened BIGINT,
  clicked BIGINT,
  failed BIGINT
) AS $$
DECLARE
  v_trunc_format TEXT;
BEGIN
  -- Set truncation format based on granularity
  v_trunc_format := CASE
    WHEN p_granularity = 'hour' THEN 'hour'
    ELSE 'day'
  END;

  RETURN QUERY
  EXECUTE format('
    SELECT
      DATE_TRUNC(%L, nd.created_at) AS time_bucket,
      COUNT(*) FILTER (WHERE nd.status = ''sent'') AS sent,
      COUNT(*) FILTER (WHERE nd.status = ''delivered'') AS delivered,
      COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,
      COUNT(*) FILTER (WHERE nd.status = ''failed'') AS failed
    FROM notification_deliveries nd
    WHERE nd.created_at > NOW() - %L::INTERVAL
    GROUP BY time_bucket
    ORDER BY time_bucket ASC
  ', v_trunc_format, p_interval);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_notification_delivery_timeline IS 'Get delivery metrics over time with configurable granularity';

-- =====================================================
-- 5. FAILED DELIVERIES
-- =====================================================

CREATE OR REPLACE FUNCTION get_notification_failed_deliveries(
  p_interval TEXT DEFAULT '24 hours',
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  delivery_id UUID,
  event_id UUID,
  event_type TEXT,
  channel TEXT,
  recipient_user_id UUID,
  recipient_email TEXT,
  last_error TEXT,
  attempts INTEGER,
  max_attempts INTEGER,
  created_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    nd.id AS delivery_id,
    ne.id AS event_id,
    ne.event_type,
    nd.channel,
    nd.recipient_user_id,
    u.email AS recipient_email,
    nd.last_error,
    nd.attempts,
    nd.max_attempts,
    nd.created_at,
    nd.failed_at
  FROM notification_deliveries nd
  JOIN notification_events ne ON ne.id = nd.event_id
  JOIN users u ON u.id = nd.recipient_user_id
  WHERE nd.status = 'failed'
    AND nd.created_at > NOW() - p_interval::INTERVAL
  ORDER BY nd.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_notification_failed_deliveries IS 'Get recent failed notification deliveries with details';

-- =====================================================
-- 6. ACTIVE SUBSCRIPTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION get_notification_active_subscriptions()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  subscribed_events TEXT[],
  push_enabled BOOLEAN,
  email_enabled BOOLEAN,
  sms_enabled BOOLEAN,
  in_app_enabled BOOLEAN,
  last_notification_sent TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email,
    u.name,
    ARRAY_AGG(DISTINCT ns.event_type) AS subscribed_events,
    BOOL_OR(unp.push_enabled) AS push_enabled,
    BOOL_OR(unp.email_enabled) AS email_enabled,
    BOOL_OR(unp.sms_enabled) AS sms_enabled,
    BOOL_OR(unp.in_app_enabled) AS in_app_enabled,
    MAX(nd.created_at) AS last_notification_sent
  FROM users u
  JOIN notification_subscriptions ns ON ns.user_id = u.id
  LEFT JOIN user_notification_preferences unp ON unp.user_id = u.id AND unp.event_type = ns.event_type
  LEFT JOIN notification_deliveries nd ON nd.recipient_user_id = u.id
  WHERE ns.is_active = true
  GROUP BY u.id, u.email, u.name
  ORDER BY last_notification_sent DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_notification_active_subscriptions IS 'Get all active notification subscriptions with user details and channel preferences';

-- =====================================================
-- 7. PERFORMANCE INDEXES (if not already exist)
-- =====================================================

-- Index for faster analytics queries
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at_status
  ON notification_deliveries(created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel_status
  ON notification_deliveries(channel, status);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_failed
  ON notification_deliveries(created_at DESC)
  WHERE status = 'failed';

-- Index for event type queries
CREATE INDEX IF NOT EXISTS idx_notification_events_type_created
  ON notification_events(event_type, created_at DESC);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Allow authenticated users to call these functions
-- (admin check happens in API layer)
GRANT EXECUTE ON FUNCTION get_notification_overview_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_channel_performance TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_event_performance TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_delivery_timeline TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_failed_deliveries TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_active_subscriptions TO authenticated;
