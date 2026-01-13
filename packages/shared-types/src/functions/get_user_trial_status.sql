-- packages/shared-types/src/functions/get_user_trial_status.sql
-- get_user_trial_status(uuid)
-- Get user trial status
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_user_trial_status(p_user_id uuid)
RETURNS TABLE (
  is_in_trial boolean,
  is_trial_expired boolean,
  trial_end_date timestamptz,
  days_until_trial_end integer,
  has_active_subscription boolean,
  is_in_grace_period boolean,
  is_read_only boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trial_end timestamptz;
  v_has_subscription boolean;
BEGIN
  SELECT
    u.trial_ends_at,
    EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status IN ('active', 'trialing'))
  INTO v_trial_end, v_has_subscription
  FROM users u
  WHERE u.id = p_user_id;

  RETURN QUERY
  SELECT
    v_trial_end > NOW() AND NOT v_has_subscription as is_in_trial,
    v_trial_end <= NOW() AND NOT v_has_subscription as is_trial_expired,
    v_trial_end as trial_end_date,
    GREATEST(0, EXTRACT(DAY FROM v_trial_end - NOW())::INTEGER) as days_until_trial_end,
    v_has_subscription as has_active_subscription,
    v_trial_end <= NOW() AND v_trial_end > NOW() - INTERVAL '7 days' AND NOT v_has_subscription as is_in_grace_period,
    v_trial_end <= NOW() - INTERVAL '7 days' AND NOT v_has_subscription as is_read_only;
END;
$$;
