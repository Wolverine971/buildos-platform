-- packages/shared-types/src/functions/get_link_click_stats.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_link_click_stats(p_delivery_id uuid DEFAULT NULL::uuid, p_days_back integer DEFAULT 7)
 RETURNS TABLE(total_links bigint, total_clicks bigint, unique_clicked_links bigint, click_through_rate numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
