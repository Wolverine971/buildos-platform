-- packages/shared-types/src/functions/get_notification_channel_performance.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_notification_channel_performance(p_interval text DEFAULT '7 days'::text)
 RETURNS TABLE(channel text, total_sent bigint, sent bigint, delivered bigint, opened bigint, clicked bigint, failed bigint, success_rate numeric, delivery_rate numeric, open_rate numeric, click_rate numeric, avg_delivery_time_ms numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    nd.channel,
    COUNT(*) FILTER (WHERE nd.status <> 'cancelled') AS total_sent,
    COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked')) AS sent,
    COUNT(*) FILTER (WHERE nd.status IN ('delivered', 'opened', 'clicked')) AS delivered,
    COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,
    COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,
    COUNT(*) FILTER (WHERE nd.status IN ('failed', 'bounced')) AS failed,
    ROUND(
      (
        COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC
        / NULLIF(COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced'))::NUMERIC, 0)
        * 100
      ),
      2
    ) AS success_rate,
    ROUND(
      (
        COUNT(*) FILTER (WHERE nd.status IN ('delivered', 'opened', 'clicked'))::NUMERIC
        / NULLIF(COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC, 0)
        * 100
      ),
      2
    ) AS delivery_rate,
    ROUND(
      (
        COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC
        / NULLIF(COUNT(*) FILTER (WHERE nd.status IN ('sent', 'delivered', 'opened', 'clicked'))::NUMERIC, 0)
        * 100
      ),
      2
    ) AS open_rate,
    ROUND(
      (
        COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC
        / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0)
        * 100
      ),
      2
    ) AS click_rate,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)) * 1000)
        FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC,
      2
    ) AS avg_delivery_time_ms
  FROM notification_deliveries nd
  WHERE nd.created_at > NOW() - p_interval::INTERVAL
  GROUP BY nd.channel
  ORDER BY total_sent DESC;
END;
$function$
