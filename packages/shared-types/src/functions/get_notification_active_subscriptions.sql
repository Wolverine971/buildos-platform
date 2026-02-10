-- packages/shared-types/src/functions/get_notification_active_subscriptions.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_notification_active_subscriptions()
 RETURNS TABLE(user_id uuid, email text, name text, subscribed_events text[], push_enabled boolean, email_enabled boolean, sms_enabled boolean, in_app_enabled boolean, last_notification_sent timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email,
    u.name,
    ARRAY_AGG(DISTINCT ns.event_type) AS subscribed_events,
    COALESCE(BOOL_OR(unp.push_enabled), false) AS push_enabled,
    COALESCE(BOOL_OR(unp.email_enabled), false) AS email_enabled,
    COALESCE(BOOL_OR(unp.sms_enabled), false) AS sms_enabled,
    COALESCE(BOOL_OR(unp.in_app_enabled), false) AS in_app_enabled,
    MAX(nd.created_at) AS last_notification_sent
  FROM users u
  JOIN notification_subscriptions ns ON ns.user_id = u.id
  LEFT JOIN user_notification_preferences unp ON unp.user_id = u.id
  LEFT JOIN notification_deliveries nd ON nd.recipient_user_id = u.id
  WHERE ns.is_active = true
  GROUP BY u.id, u.email, u.name
  ORDER BY last_notification_sent DESC NULLS LAST;
END;
$function$
