-- packages/shared-types/src/functions/get_revenue_metrics.sql
-- get_revenue_metrics()
-- Get revenue metrics
-- Source: Supabase database (function definition not in migration files)

CREATE OR REPLACE FUNCTION get_revenue_metrics()
RETURNS TABLE (
  current_mrr numeric,
  previous_mrr numeric,
  mrr_growth numeric,
  total_revenue numeric,
  average_revenue_per_user numeric,
  lifetime_value numeric,
  churn_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH current_month AS (
    SELECT COALESCE(SUM(amount), 0) as mrr
    FROM subscriptions
    WHERE status = 'active'
  ),
  previous_month AS (
    SELECT COALESCE(SUM(amount), 0) as mrr
    FROM subscriptions
    WHERE status = 'active'
      AND created_at < CURRENT_DATE - INTERVAL '30 days'
  ),
  totals AS (
    SELECT
      COALESCE(SUM(amount), 0) as total,
      COUNT(DISTINCT user_id)::NUMERIC as user_count
    FROM subscriptions
    WHERE status IN ('active', 'past_due')
  )
  SELECT
    cm.mrr as current_mrr,
    pm.mrr as previous_mrr,
    CASE WHEN pm.mrr > 0 THEN ((cm.mrr - pm.mrr) / pm.mrr * 100) ELSE 0 END as mrr_growth,
    t.total as total_revenue,
    CASE WHEN t.user_count > 0 THEN t.total / t.user_count ELSE 0 END as average_revenue_per_user,
    CASE WHEN t.user_count > 0 THEN (t.total / t.user_count) * 12 ELSE 0 END as lifetime_value,
    0::NUMERIC as churn_rate
  FROM current_month cm, previous_month pm, totals t;
END;
$$;
