-- packages/shared-types/src/functions/get_subscription_overview.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_subscription_overview()
 RETURNS TABLE(total_subscribers bigint, active_subscriptions bigint, trial_subscriptions bigint, canceled_subscriptions bigint, paused_subscriptions bigint, mrr numeric, arr numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT user_id) AS total_subscribers,
    COUNT(*) FILTER (WHERE status = 'active') AS active_subscriptions,
    COUNT(*) FILTER (WHERE status = 'trialing') AS trial_subscriptions,
    COUNT(*) FILTER (WHERE status = 'canceled') AS canceled_subscriptions,
    COUNT(*) FILTER (WHERE status = 'paused') AS paused_subscriptions,
    COALESCE(SUM(
      CASE 
        WHEN status = 'active' THEN 
          sp.price_cents / 100.0 / 
          CASE sp.billing_interval
            WHEN 'month' THEN 1
            WHEN 'year' THEN 12
            ELSE 1
          END
        ELSE 0
      END
    ), 0) AS mrr,
    COALESCE(SUM(
      CASE 
        WHEN status = 'active' THEN 
          sp.price_cents / 100.0 / 
          CASE sp.billing_interval
            WHEN 'month' THEN 1
            WHEN 'year' THEN 12
            ELSE 1
          END
        ELSE 0
      END
    ) * 12, 0) AS arr
  FROM customer_subscriptions cs
  LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id;
END;
$function$
