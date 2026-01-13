-- packages/shared-types/src/functions/get_revenue_metrics.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_revenue_metrics()
 RETURNS TABLE(current_mrr numeric, previous_mrr numeric, mrr_growth numeric, total_revenue numeric, average_revenue_per_user numeric, churn_rate numeric, lifetime_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_mrr NUMERIC;
  v_previous_mrr NUMERIC;
  v_total_users BIGINT;
  v_churned_users BIGINT;
BEGIN
  -- Calculate current MRR
  SELECT COALESCE(SUM(
    sp.price_cents / 100.0 / 
    CASE sp.billing_interval
      WHEN 'month' THEN 1
      WHEN 'year' THEN 12
      ELSE 1
    END
  ), 0) INTO v_current_mrr
  FROM customer_subscriptions cs
  JOIN subscription_plans sp ON cs.plan_id = sp.id
  WHERE cs.status = 'active';

  -- Calculate previous month MRR
  SELECT COALESCE(SUM(
    sp.price_cents / 100.0 / 
    CASE sp.billing_interval
      WHEN 'month' THEN 1
      WHEN 'year' THEN 12
      ELSE 1
    END
  ), 0) INTO v_previous_mrr
  FROM customer_subscriptions cs
  JOIN subscription_plans sp ON cs.plan_id = sp.id
  WHERE cs.status = 'active' 
    AND cs.created_at < date_trunc('month', CURRENT_DATE);

  -- Calculate total revenue
  SELECT COALESCE(SUM(amount_paid / 100.0), 0)
  FROM invoices
  WHERE status = 'paid'
  INTO total_revenue;

  -- Calculate active users
  SELECT COUNT(DISTINCT user_id) INTO v_total_users
  FROM customer_subscriptions
  WHERE status = 'active';

  -- Calculate churned users in last 30 days
  SELECT COUNT(DISTINCT user_id) INTO v_churned_users
  FROM customer_subscriptions
  WHERE status = 'canceled'
    AND canceled_at >= CURRENT_DATE - INTERVAL '30 days';

  RETURN QUERY
  SELECT
    v_current_mrr AS current_mrr,
    v_previous_mrr AS previous_mrr,
    CASE 
      WHEN v_previous_mrr > 0 THEN 
        ((v_current_mrr - v_previous_mrr) / v_previous_mrr * 100)
      ELSE 0 
    END AS mrr_growth,
    total_revenue,
    CASE 
      WHEN v_total_users > 0 THEN v_current_mrr / v_total_users
      ELSE 0
    END AS average_revenue_per_user,
    CASE 
      WHEN v_total_users > 0 THEN (v_churned_users::NUMERIC / v_total_users * 100)
      ELSE 0
    END AS churn_rate,
    CASE 
      WHEN v_total_users > 0 AND v_churned_users > 0 THEN
        (v_current_mrr / v_total_users) / (v_churned_users::NUMERIC / v_total_users / 30)
      ELSE 0
    END AS lifetime_value;
END;
$function$
