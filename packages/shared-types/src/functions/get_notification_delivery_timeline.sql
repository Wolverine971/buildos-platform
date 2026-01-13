-- packages/shared-types/src/functions/get_notification_delivery_timeline.sql
-- get_notification_delivery_timeline(text, text)
-- Get notification delivery timeline
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_notification_delivery_timeline(
  p_interval text DEFAULT '24 hours',
  p_granularity text DEFAULT '1 hour'
)
RETURNS TABLE (
  time_bucket timestamptz,
  sent integer,
  delivered integer,
  opened integer,
  clicked integer,
  failed integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc(p_granularity, nd.created_at) as time_bucket,
    COUNT(*) FILTER (WHERE nd.status = 'sent')::INTEGER as sent,
    COUNT(*) FILTER (WHERE nd.status = 'delivered')::INTEGER as delivered,
    COUNT(*) FILTER (WHERE nd.status = 'opened')::INTEGER as opened,
    COUNT(*) FILTER (WHERE nd.status = 'clicked')::INTEGER as clicked,
    COUNT(*) FILTER (WHERE nd.status = 'failed')::INTEGER as failed
  FROM notification_deliveries nd
  WHERE nd.created_at > NOW() - p_interval::INTERVAL
  GROUP BY time_bucket
  ORDER BY time_bucket;
END;
$$;
