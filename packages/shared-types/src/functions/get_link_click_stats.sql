-- packages/shared-types/src/functions/get_link_click_stats.sql
-- get_link_click_stats(uuid, integer)
-- Get link click statistics
-- Source: supabase/migrations/20251007_notification_tracking_links.sql

CREATE OR REPLACE FUNCTION get_link_click_stats(
  p_delivery_id UUID DEFAULT NULL,
  p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_links BIGINT,
  total_clicks BIGINT,
  unique_clicked_links BIGINT,
  click_through_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_links,
    SUM(click_count)::BIGINT as total_clicks,
    COUNT(*) FILTER (WHERE click_count > 0)::BIGINT as unique_clicked_links,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND(100.0 * COUNT(*) FILTER (WHERE click_count > 0) / COUNT(*), 2)
      ELSE 0
    END as click_through_rate
  FROM notification_tracking_links
  WHERE
    (p_delivery_id IS NULL OR delivery_id = p_delivery_id)
    AND created_at > NOW() - (p_days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql STABLE;
