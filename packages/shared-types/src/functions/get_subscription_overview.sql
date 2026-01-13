-- packages/shared-types/src/functions/get_subscription_overview.sql
-- get_subscription_overview()
-- Get subscription overview metrics
-- Source: Supabase database (function definition not in migration files)

-- Note: This function returns subscription metrics for admin analytics.
-- The SQL definition below is reconstructed from database.types.ts signature.

CREATE OR REPLACE FUNCTION get_subscription_overview()
RETURNS TABLE (
  total_subscribers integer,
  active_subscriptions integer,
  trial_subscriptions integer,
  paused_subscriptions integer,
  canceled_subscriptions integer,
  mrr numeric,
  arr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT s.user_id)::INTEGER as total_subscribers,
    COUNT(*) FILTER (WHERE s.status = 'active')::INTEGER as active_subscriptions,
    COUNT(*) FILTER (WHERE s.status = 'trialing')::INTEGER as trial_subscriptions,
    COUNT(*) FILTER (WHERE s.status = 'paused')::INTEGER as paused_subscriptions,
    COUNT(*) FILTER (WHERE s.status = 'canceled')::INTEGER as canceled_subscriptions,
    COALESCE(SUM(CASE WHEN s.status = 'active' THEN s.amount ELSE 0 END), 0) as mrr,
    COALESCE(SUM(CASE WHEN s.status = 'active' THEN s.amount * 12 ELSE 0 END), 0) as arr
  FROM subscriptions s;
END;
$$;
