-- packages/shared-types/src/functions/get_notification_overview_metrics.sql
-- get_notification_overview_metrics(text, text)
-- Get notification overview metrics
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_notification_overview_metrics(
  p_interval text DEFAULT '24 hours',
  p_offset text DEFAULT '0 hours'
)
RETURNS TABLE (
  total_sent integer,
  delivery_success_rate numeric,
  avg_open_rate numeric,
  avg_click_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_sent,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / NULLIF(COUNT(*), 0), 2) as delivery_success_rate,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'opened') / NULLIF(COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')), 0), 2) as avg_open_rate,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'clicked') / NULLIF(COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')), 0), 2) as avg_click_rate
  FROM notification_deliveries
  WHERE created_at > NOW() - p_interval::INTERVAL - p_offset::INTERVAL
    AND created_at <= NOW() - p_offset::INTERVAL;
END;
$$;
