-- packages/shared-types/src/functions/get_notification_event_performance.sql
-- get_notification_event_performance(text)
-- Get notification event performance
-- Source: apps/web/supabase/migrations/20251011_fix_notification_analytics_bugs.sql

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
