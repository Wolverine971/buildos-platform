-- packages/shared-types/src/functions/get_notification_overview_metrics.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_notification_overview_metrics(p_interval text DEFAULT '7 days'::text, p_offset text DEFAULT NULL::text)
 RETURNS TABLE(total_sent bigint, delivery_success_rate numeric, avg_open_rate numeric, avg_click_rate numeric)
 LANGUAGE plpgsql
AS $function$
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
$function$
