-- packages/shared-types/src/functions/get_notification_channel_performance.sql
-- get_notification_channel_performance(text)
-- Get notification channel performance
-- Source: apps/web/supabase/migrations/20251011_fix_notification_analytics_bugs.sql

CREATE OR REPLACE FUNCTION get_notification_channel_performance(
  p_interval TEXT DEFAULT '7 days'
)
RETURNS TABLE (
  channel TEXT,
  total_sent BIGINT,
  sent BIGINT,
  delivered BIGINT,
  opened BIGINT,
  clicked BIGINT,
  failed BIGINT,
  success_rate NUMERIC,
  delivery_rate NUMERIC,
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
    COUNT(*) FILTER (WHERE nd.status = 'delivered') AS delivered,
    COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,
    COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,
    COUNT(*) FILTER (WHERE nd.status = 'failed') AS failed,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100),
      2
    ) AS success_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.status = 'delivered')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS delivery_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS open_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0) * 100),
      2
    ) AS click_rate,
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
