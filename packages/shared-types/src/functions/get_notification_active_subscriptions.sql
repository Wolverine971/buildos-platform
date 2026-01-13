-- packages/shared-types/src/functions/get_notification_active_subscriptions.sql
-- get_notification_active_subscriptions()
-- Get active notification subscriptions
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_notification_active_subscriptions()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  email_enabled boolean,
  sms_enabled boolean,
  push_enabled boolean,
  in_app_enabled boolean,
  subscribed_events text[],
  last_notification_sent timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id as user_id,
    u.name,
    u.email,
    COALESCE(np.email_enabled, true) as email_enabled,
    COALESCE(np.sms_enabled, false) as sms_enabled,
    COALESCE(np.push_enabled, false) as push_enabled,
    COALESCE(np.in_app_enabled, true) as in_app_enabled,
    ARRAY(SELECT event_type FROM user_notification_preferences WHERE user_id = u.id) as subscribed_events,
    (SELECT MAX(created_at) FROM notification_deliveries WHERE user_id = u.id) as last_notification_sent
  FROM users u
  LEFT JOIN user_notification_preferences np ON np.user_id = u.id
  WHERE u.email_verified = true;
END;
$$;
