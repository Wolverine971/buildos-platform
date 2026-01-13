-- packages/shared-types/src/functions/get_notification_failed_deliveries.sql
-- get_notification_failed_deliveries(text, integer)
-- Get failed notification deliveries
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_notification_failed_deliveries(
  p_interval text DEFAULT '24 hours',
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  delivery_id uuid,
  event_id uuid,
  event_type text,
  channel text,
  recipient_user_id uuid,
  recipient_email text,
  last_error text,
  attempts integer,
  max_attempts integer,
  created_at timestamptz,
  failed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    nd.id as delivery_id,
    nd.event_id,
    ne.event_type,
    nd.channel,
    nd.user_id as recipient_user_id,
    u.email as recipient_email,
    nd.error_message as last_error,
    nd.attempts,
    nd.max_attempts,
    nd.created_at,
    nd.failed_at
  FROM notification_deliveries nd
  JOIN notification_events ne ON ne.id = nd.event_id
  LEFT JOIN users u ON u.id = nd.user_id
  WHERE nd.status = 'failed'
    AND nd.created_at > NOW() - p_interval::INTERVAL
  ORDER BY nd.created_at DESC
  LIMIT p_limit;
END;
$$;
