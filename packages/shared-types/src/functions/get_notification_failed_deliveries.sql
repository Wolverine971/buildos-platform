-- packages/shared-types/src/functions/get_notification_failed_deliveries.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_notification_failed_deliveries(p_interval text DEFAULT '24 hours'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(delivery_id uuid, event_id uuid, event_type text, channel text, recipient_user_id uuid, recipient_email text, last_error text, attempts integer, max_attempts integer, created_at timestamp with time zone, failed_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
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
$function$
