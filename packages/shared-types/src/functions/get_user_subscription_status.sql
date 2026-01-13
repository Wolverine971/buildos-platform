-- packages/shared-types/src/functions/get_user_subscription_status.sql
-- get_user_subscription_status(uuid)
-- Get user subscription status
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_user_subscription_status(user_uuid uuid)
RETURNS TABLE (
  has_subscription boolean,
  subscription_status text,
  current_period_end timestamptz,
  is_beta_user boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.id IS NOT NULL, false) as has_subscription,
    COALESCE(s.status, 'none')::text as subscription_status,
    s.current_period_end,
    COALESCE(u.is_beta_user, false) as is_beta_user
  FROM users u
  LEFT JOIN subscriptions s ON s.user_id = u.id
  WHERE u.id = user_uuid
  LIMIT 1;
END;
$$;
