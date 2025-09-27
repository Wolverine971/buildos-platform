-- supabase/migrations/20241218_subscription_analytics.sql

-- Function to get subscription overview
CREATE OR REPLACE FUNCTION get_subscription_overview()
RETURNS TABLE (
  total_subscribers BIGINT,
  active_subscriptions BIGINT,
  trial_subscriptions BIGINT,
  canceled_subscriptions BIGINT,
  paused_subscriptions BIGINT,
  mrr NUMERIC,
  arr NUMERIC
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get revenue metrics
CREATE OR REPLACE FUNCTION get_revenue_metrics()
RETURNS TABLE (
  current_mrr NUMERIC,
  previous_mrr NUMERIC,
  mrr_growth NUMERIC,
  total_revenue NUMERIC,
  average_revenue_per_user NUMERIC,
  churn_rate NUMERIC,
  lifetime_value NUMERIC
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create webhook events table for logging if it doesn't exist in previous migration
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'webhook_events') THEN
    CREATE TABLE webhook_events (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload JSONB,
      error_message TEXT,
      attempts INTEGER DEFAULT 1,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    -- Add attempts column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_name = 'webhook_events' AND column_name = 'attempts') THEN
      ALTER TABLE webhook_events ADD COLUMN attempts INTEGER DEFAULT 1;
    END IF;
  END IF;
END $$;

-- Index for webhook events
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);

-- Add RLS for webhook events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Admin-only access to webhook events
CREATE POLICY "Admin users can view webhook events" ON webhook_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Function to get subscription changes over time
CREATE OR REPLACE FUNCTION get_subscription_changes(
  p_timeframe TEXT DEFAULT '30d'
)
RETURNS TABLE (
  date DATE,
  new_subscriptions BIGINT,
  cancellations BIGINT,
  net_change BIGINT
) AS $$
DECLARE
  v_days INTEGER;
BEGIN
  -- Parse timeframe
  v_days := CASE p_timeframe
    WHEN '7d' THEN 7
    WHEN '30d' THEN 30
    WHEN '90d' THEN 90
    ELSE 30
  END;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - INTERVAL '1 day' * v_days,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE AS date
  ),
  new_subs AS (
    SELECT 
      DATE(created_at) AS date,
      COUNT(*) AS count
    FROM customer_subscriptions
    WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' * v_days
    GROUP BY DATE(created_at)
  ),
  cancellations AS (
    SELECT 
      DATE(canceled_at) AS date,
      COUNT(*) AS count
    FROM customer_subscriptions
    WHERE canceled_at >= CURRENT_DATE - INTERVAL '1 day' * v_days
    GROUP BY DATE(canceled_at)
  )
  SELECT
    ds.date,
    COALESCE(ns.count, 0) AS new_subscriptions,
    COALESCE(c.count, 0) AS cancellations,
    COALESCE(ns.count, 0) - COALESCE(c.count, 0) AS net_change
  FROM date_series ds
  LEFT JOIN new_subs ns ON ds.date = ns.date
  LEFT JOIN cancellations c ON ds.date = c.date
  ORDER BY ds.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_subscription_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION get_revenue_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_subscription_changes(TEXT) TO authenticated;