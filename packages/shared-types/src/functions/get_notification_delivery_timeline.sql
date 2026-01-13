-- packages/shared-types/src/functions/get_notification_delivery_timeline.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_notification_delivery_timeline(p_interval text DEFAULT '7 days'::text, p_granularity text DEFAULT 'day'::text)
 RETURNS TABLE(time_bucket timestamp with time zone, sent bigint, delivered bigint, opened bigint, clicked bigint, failed bigint)
 LANGUAGE plpgsql
AS $function$
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
$function$
