-- SMS Metrics Monitoring Infrastructure
-- Migration: 20251008_sms_metrics_monitoring.sql
-- Purpose: Implement comprehensive SMS metrics tracking, aggregation, and alerting
-- Phase: 6.2 (Production Readiness & Monitoring)
--
-- This migration creates:
-- 1. sms_metrics table - time-series metrics storage
-- 2. sms_metrics_daily materialized view - pre-aggregated daily metrics
-- 3. sms_alert_thresholds table - configurable alert thresholds
-- 4. sms_alert_history table - alert audit trail
-- 5. RPC functions for metrics recording and querying
-- 6. Indexes for optimal query performance
-- 7. RLS policies for data security

-- ============================================================================
-- 1. SMS Metrics Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Temporal dimensions
  metric_date DATE NOT NULL,
  metric_hour SMALLINT, -- 0-23 for hourly granularity, NULL for daily aggregates

  -- User dimension
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Metric data
  metric_type TEXT NOT NULL,
  metric_value NUMERIC(20, 6) NOT NULL DEFAULT 0, -- Supports both counts and costs with precision
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT sms_metrics_unique_key
    UNIQUE (metric_date, metric_hour, user_id, metric_type),

  CONSTRAINT sms_metrics_metric_hour_range
    CHECK (metric_hour IS NULL OR (metric_hour >= 0 AND metric_hour <= 23)),

  CONSTRAINT sms_metrics_metric_type_valid CHECK (
    metric_type IN (
      -- Operational metrics
      'scheduled_count',
      'sent_count',
      'delivered_count',
      'failed_count',
      'cancelled_count',

      -- Performance metrics (stored as sums, averaged in materialized view)
      'avg_delivery_time_ms',
      'avg_generation_time_ms',

      -- Quality metrics
      'llm_success_count',
      'template_fallback_count',

      -- Cost metrics
      'llm_cost_usd',
      'sms_cost_usd',

      -- Engagement metrics
      'opt_out_count',
      'quiet_hours_skip_count',
      'daily_limit_hit_count'
    )
  )
);

-- Indexes for optimal query performance
CREATE INDEX idx_sms_metrics_date ON sms_metrics(metric_date DESC);
CREATE INDEX idx_sms_metrics_user_date ON sms_metrics(user_id, metric_date DESC);
CREATE INDEX idx_sms_metrics_type ON sms_metrics(metric_type);
CREATE INDEX idx_sms_metrics_user_type_date ON sms_metrics(user_id, metric_type, metric_date DESC);

-- Add helpful comment
COMMENT ON TABLE sms_metrics IS 'Time-series metrics for SMS event scheduling system. Tracks operational, performance, quality, cost, and engagement metrics at user and system levels.';

-- ============================================================================
-- 2. RPC Function: record_sms_metric
-- ============================================================================
-- Atomic upsert with increment logic for concurrent metric recording

CREATE OR REPLACE FUNCTION record_sms_metric(
  p_metric_date DATE,
  p_metric_hour INTEGER,
  p_user_id UUID,
  p_metric_type TEXT,
  p_metric_value NUMERIC,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atomic upsert: insert or increment existing value
  INSERT INTO sms_metrics (
    metric_date,
    metric_hour,
    user_id,
    metric_type,
    metric_value,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    p_metric_date,
    p_metric_hour,
    p_user_id,
    p_metric_type,
    p_metric_value,
    p_metadata,
    NOW(),
    NOW()
  )
  ON CONFLICT (metric_date, metric_hour, user_id, metric_type)
  DO UPDATE SET
    -- Increment metric value (works for both counters and sum-based averages)
    metric_value = sms_metrics.metric_value + EXCLUDED.metric_value,
    -- Merge metadata (new keys added, existing preserved)
    metadata = sms_metrics.metadata || EXCLUDED.metadata,
    -- Update timestamp
    updated_at = NOW();

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail (metrics should never block core functionality)
    RAISE WARNING 'Error recording SMS metric: % (type: %, user: %)', SQLERRM, p_metric_type, p_user_id;
END;
$$;

COMMENT ON FUNCTION record_sms_metric IS 'Records or increments an SMS metric. Uses atomic upsert to handle concurrent writes. Non-blocking - logs errors without failing.';

-- ============================================================================
-- 3. SMS Metrics Daily Materialized View
-- ============================================================================
-- Pre-aggregated daily metrics for fast dashboard queries

CREATE MATERIALIZED VIEW sms_metrics_daily AS
SELECT
  metric_date,

  -- Operational metrics (sum across all users)
  COALESCE(SUM(CASE WHEN metric_type = 'scheduled_count' THEN metric_value ELSE 0 END), 0)::INTEGER as scheduled_count,
  COALESCE(SUM(CASE WHEN metric_type = 'sent_count' THEN metric_value ELSE 0 END), 0)::INTEGER as sent_count,
  COALESCE(SUM(CASE WHEN metric_type = 'delivered_count' THEN metric_value ELSE 0 END), 0)::INTEGER as delivered_count,
  COALESCE(SUM(CASE WHEN metric_type = 'failed_count' THEN metric_value ELSE 0 END), 0)::INTEGER as failed_count,
  COALESCE(SUM(CASE WHEN metric_type = 'cancelled_count' THEN metric_value ELSE 0 END), 0)::INTEGER as cancelled_count,

  -- Performance metrics (calculate true averages)
  -- avg_delivery_time_ms = sum of delivery times / count of deliveries
  CASE
    WHEN SUM(CASE WHEN metric_type = 'delivered_count' THEN metric_value ELSE 0 END) > 0
    THEN (SUM(CASE WHEN metric_type = 'avg_delivery_time_ms' THEN metric_value ELSE 0 END) /
          SUM(CASE WHEN metric_type = 'delivered_count' THEN metric_value ELSE 0 END))
    ELSE 0
  END::NUMERIC(10, 2) as avg_delivery_time_ms,

  -- avg_generation_time_ms = sum of generation times / count of generations
  CASE
    WHEN (SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END) +
          SUM(CASE WHEN metric_type = 'template_fallback_count' THEN metric_value ELSE 0 END)) > 0
    THEN (SUM(CASE WHEN metric_type = 'avg_generation_time_ms' THEN metric_value ELSE 0 END) /
          (SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END) +
           SUM(CASE WHEN metric_type = 'template_fallback_count' THEN metric_value ELSE 0 END)))
    ELSE 0
  END::NUMERIC(10, 2) as avg_generation_time_ms,

  -- Quality metrics
  COALESCE(SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END), 0)::INTEGER as llm_success_count,
  COALESCE(SUM(CASE WHEN metric_type = 'template_fallback_count' THEN metric_value ELSE 0 END), 0)::INTEGER as template_fallback_count,

  -- Calculated delivery rate (for SMSMetrics.delivery_success_rate field)
  CASE
    WHEN SUM(CASE WHEN metric_type = 'sent_count' THEN metric_value ELSE 0 END) > 0
    THEN (SUM(CASE WHEN metric_type = 'delivered_count' THEN metric_value ELSE 0 END)::NUMERIC /
          SUM(CASE WHEN metric_type = 'sent_count' THEN metric_value ELSE 0 END) * 100)
    ELSE 0
  END::NUMERIC(5, 2) as delivery_success_rate,

  -- Calculated LLM success rate (for SMSMetrics.llm_success_rate field)
  CASE
    WHEN (SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END) +
          SUM(CASE WHEN metric_type = 'template_fallback_count' THEN metric_value ELSE 0 END)) > 0
    THEN (SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END)::NUMERIC /
          (SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END) +
           SUM(CASE WHEN metric_type = 'template_fallback_count' THEN metric_value ELSE 0 END)) * 100)
    ELSE 0
  END::NUMERIC(5, 2) as llm_success_rate,

  -- Cost metrics
  COALESCE(SUM(CASE WHEN metric_type = 'llm_cost_usd' THEN metric_value ELSE 0 END), 0)::NUMERIC(10, 6) as llm_cost_usd,
  COALESCE(SUM(CASE WHEN metric_type = 'sms_cost_usd' THEN metric_value ELSE 0 END), 0)::NUMERIC(10, 6) as sms_cost_usd,

  -- Engagement metrics
  COALESCE(SUM(CASE WHEN metric_type = 'opt_out_count' THEN metric_value ELSE 0 END), 0)::INTEGER as opt_out_count,
  COALESCE(SUM(CASE WHEN metric_type = 'quiet_hours_skip_count' THEN metric_value ELSE 0 END), 0)::INTEGER as quiet_hours_skip_count,
  COALESCE(SUM(CASE WHEN metric_type = 'daily_limit_hit_count' THEN metric_value ELSE 0 END), 0)::INTEGER as daily_limit_hit_count,

  -- Additional calculated fields for DailyMetricsSummary interface
  CASE
    WHEN SUM(CASE WHEN metric_type = 'sent_count' THEN metric_value ELSE 0 END) > 0
    THEN (SUM(CASE WHEN metric_type = 'delivered_count' THEN metric_value ELSE 0 END)::NUMERIC /
          SUM(CASE WHEN metric_type = 'sent_count' THEN metric_value ELSE 0 END) * 100)
    ELSE 0
  END::NUMERIC(5, 2) as delivery_rate_percent,

  CASE
    WHEN (SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END) +
          SUM(CASE WHEN metric_type = 'template_fallback_count' THEN metric_value ELSE 0 END)) > 0
    THEN (SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END)::NUMERIC /
          (SUM(CASE WHEN metric_type = 'llm_success_count' THEN metric_value ELSE 0 END) +
           SUM(CASE WHEN metric_type = 'template_fallback_count' THEN metric_value ELSE 0 END)) * 100)
    ELSE 0
  END::NUMERIC(5, 2) as llm_success_rate_percent,

  -- Count of unique active users for this day
  COUNT(DISTINCT user_id)::INTEGER as active_users

FROM sms_metrics
WHERE metric_hour IS NULL  -- Only aggregate daily metrics (not hourly breakdowns)
GROUP BY metric_date;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_sms_metrics_daily_date ON sms_metrics_daily(metric_date);

-- Grant select to authenticated users (system-wide aggregates, no PII)
GRANT SELECT ON sms_metrics_daily TO authenticated;

COMMENT ON MATERIALIZED VIEW sms_metrics_daily IS 'Pre-aggregated daily SMS metrics across all users. Refreshed hourly via refresh_sms_metrics_daily() function. Optimized for fast dashboard queries.';

-- ============================================================================
-- 4. RPC Function: get_sms_daily_metrics
-- ============================================================================
-- Query daily metrics for a date range (used by SMSMetricsService.getDailyMetrics)

CREATE OR REPLACE FUNCTION get_sms_daily_metrics(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  metric_date DATE,
  scheduled_count INTEGER,
  sent_count INTEGER,
  delivered_count INTEGER,
  failed_count INTEGER,
  cancelled_count INTEGER,
  avg_delivery_time_ms NUMERIC,
  avg_generation_time_ms NUMERIC,
  llm_success_count INTEGER,
  template_fallback_count INTEGER,
  delivery_success_rate NUMERIC,
  llm_success_rate NUMERIC,
  llm_cost_usd NUMERIC,
  sms_cost_usd NUMERIC,
  opt_out_count INTEGER,
  quiet_hours_skip_count INTEGER,
  daily_limit_hit_count INTEGER,
  delivery_rate_percent NUMERIC,
  llm_success_rate_percent NUMERIC,
  active_users INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.metric_date,
    m.scheduled_count,
    m.sent_count,
    m.delivered_count,
    m.failed_count,
    m.cancelled_count,
    m.avg_delivery_time_ms,
    m.avg_generation_time_ms,
    m.llm_success_count,
    m.template_fallback_count,
    m.delivery_success_rate,
    m.llm_success_rate,
    m.llm_cost_usd,
    m.sms_cost_usd,
    m.opt_out_count,
    m.quiet_hours_skip_count,
    m.daily_limit_hit_count,
    m.delivery_rate_percent,
    m.llm_success_rate_percent,
    m.active_users
  FROM sms_metrics_daily m
  WHERE m.metric_date >= p_start_date
    AND m.metric_date <= p_end_date
  ORDER BY m.metric_date DESC;
END;
$$;

COMMENT ON FUNCTION get_sms_daily_metrics IS 'Retrieves aggregated daily SMS metrics for a date range. Queries the materialized view for optimal performance.';

-- ============================================================================
-- 5. RPC Function: get_user_sms_metrics
-- ============================================================================
-- Query user-specific metrics (used by SMSMetricsService.getUserMetrics)

CREATE OR REPLACE FUNCTION get_user_sms_metrics(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  metric_date DATE,
  scheduled_count INTEGER,
  sent_count INTEGER,
  delivered_count INTEGER,
  failed_count INTEGER,
  llm_cost_usd NUMERIC,
  delivery_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.metric_date,
    COALESCE(SUM(CASE WHEN m.metric_type = 'scheduled_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as scheduled_count,
    COALESCE(SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as sent_count,
    COALESCE(SUM(CASE WHEN m.metric_type = 'delivered_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as delivered_count,
    COALESCE(SUM(CASE WHEN m.metric_type = 'failed_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as failed_count,
    COALESCE(SUM(CASE WHEN m.metric_type = 'llm_cost_usd' THEN m.metric_value ELSE 0 END), 0)::NUMERIC(10, 6) as llm_cost_usd,
    CASE
      WHEN SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END) > 0
      THEN (SUM(CASE WHEN m.metric_type = 'delivered_count' THEN m.metric_value ELSE 0 END)::NUMERIC /
            SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END) * 100)
      ELSE 0
    END::NUMERIC(5, 2) as delivery_rate
  FROM sms_metrics m
  WHERE m.user_id = p_user_id
    AND m.metric_hour IS NULL  -- Only daily metrics
    AND m.metric_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  GROUP BY m.metric_date
  ORDER BY m.metric_date DESC;
END;
$$;

COMMENT ON FUNCTION get_user_sms_metrics IS 'Retrieves user-specific SMS metrics for the past N days. Aggregates from raw metrics table for flexibility.';

-- ============================================================================
-- 6. RPC Function: refresh_sms_metrics_daily
-- ============================================================================
-- Refresh the materialized view (called hourly by scheduler)

CREATE OR REPLACE FUNCTION refresh_sms_metrics_daily()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- CONCURRENTLY allows queries during refresh (requires unique index)
  REFRESH MATERIALIZED VIEW CONCURRENTLY sms_metrics_daily;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail (monitoring infrastructure should be resilient)
    RAISE WARNING 'Error refreshing sms_metrics_daily materialized view: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION refresh_sms_metrics_daily IS 'Refreshes the sms_metrics_daily materialized view. Called hourly by scheduler. Uses CONCURRENTLY to avoid blocking reads.';

-- ============================================================================
-- 7. SMS Alert Thresholds Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_alert_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert configuration
  alert_type TEXT NOT NULL UNIQUE,
  threshold_value NUMERIC(10, 2) NOT NULL,
  severity TEXT NOT NULL,
  notification_channels TEXT[] NOT NULL DEFAULT '{}',
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT sms_alert_thresholds_severity_valid CHECK (
    severity IN ('critical', 'warning', 'info')
  ),

  CONSTRAINT sms_alert_thresholds_alert_type_valid CHECK (
    alert_type IN (
      'delivery_rate_critical',
      'llm_failure_critical',
      'llm_cost_spike_warning',
      'opt_out_rate_warning',
      'daily_limit_hit_warning'
    )
  ),

  CONSTRAINT sms_alert_thresholds_cooldown_positive CHECK (
    cooldown_minutes > 0
  )
);

COMMENT ON TABLE sms_alert_thresholds IS 'Configurable alert thresholds for SMS metrics monitoring. Defines when alerts should trigger and where to send notifications.';

-- Insert default alert thresholds
INSERT INTO sms_alert_thresholds (alert_type, threshold_value, severity, notification_channels, cooldown_minutes)
VALUES
  ('delivery_rate_critical', 90.0, 'critical', ARRAY['pagerduty'], 60),
  ('llm_failure_critical', 50.0, 'critical', ARRAY['pagerduty'], 30),
  ('llm_cost_spike_warning', 200.0, 'warning', ARRAY['slack'], 120),
  ('opt_out_rate_warning', 10.0, 'warning', ARRAY['slack'], 240),
  ('daily_limit_hit_warning', 20.0, 'warning', ARRAY['slack'], 180)
ON CONFLICT (alert_type) DO NOTHING; -- Preserve existing customizations

-- ============================================================================
-- 8. SMS Alert History Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert details
  alert_type TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_value NUMERIC(10, 2) NOT NULL,
  threshold_value NUMERIC(10, 2) NOT NULL,
  severity TEXT NOT NULL,

  -- Notification status
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  notification_error TEXT,

  -- Resolution tracking
  resolved_at TIMESTAMPTZ,

  -- Additional context
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT sms_alert_history_severity_valid CHECK (
    severity IN ('critical', 'warning', 'info')
  )
);

-- Indexes for alert queries
CREATE INDEX idx_sms_alert_history_triggered ON sms_alert_history(triggered_at DESC);
CREATE INDEX idx_sms_alert_history_type ON sms_alert_history(alert_type);
CREATE INDEX idx_sms_alert_history_unresolved ON sms_alert_history(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_sms_alert_history_type_triggered ON sms_alert_history(alert_type, triggered_at DESC);

COMMENT ON TABLE sms_alert_history IS 'Audit trail of triggered SMS alerts. Tracks alert lifecycle from trigger to resolution.';

-- ============================================================================
-- 9. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on sms_metrics table
ALTER TABLE sms_metrics ENABLE ROW LEVEL SECURITY;

-- Users can select their own metrics
CREATE POLICY sms_metrics_select_own ON sms_metrics
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins can select all metrics
CREATE POLICY sms_metrics_select_admin ON sms_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = TRUE
    )
  );

-- Service role can insert (explicitly allow, though service role bypasses RLS)
CREATE POLICY sms_metrics_insert_service ON sms_metrics
  FOR INSERT
  WITH CHECK (TRUE);

-- Enable RLS on alert tables (admin-only access)
ALTER TABLE sms_alert_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_alert_thresholds_admin ON sms_alert_thresholds
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = TRUE
    )
  );

CREATE POLICY sms_alert_history_admin ON sms_alert_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = TRUE
    )
  );

-- ============================================================================
-- 10. Grant Permissions
-- ============================================================================

-- Grant execute permissions on RPC functions to authenticated users
GRANT EXECUTE ON FUNCTION record_sms_metric(DATE, INTEGER, UUID, TEXT, NUMERIC, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_sms_daily_metrics(DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_sms_metrics(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_sms_metrics_daily() TO service_role;

-- Grant table permissions
GRANT SELECT ON sms_metrics TO authenticated;
GRANT SELECT ON sms_metrics_daily TO authenticated;
GRANT ALL ON sms_metrics TO service_role;
GRANT ALL ON sms_alert_thresholds TO service_role;
GRANT ALL ON sms_alert_history TO service_role;

-- ============================================================================
-- Migration Complete
-- ============================================================================
--
-- Summary:
-- ✅ Created sms_metrics table with 15 metric types
-- ✅ Created sms_metrics_daily materialized view with optimized aggregations
-- ✅ Created sms_alert_thresholds table with 5 default alerts
-- ✅ Created sms_alert_history table for audit trail
-- ✅ Created 4 RPC functions: record, query daily, query user, refresh
-- ✅ Created indexes for optimal query performance
-- ✅ Enabled RLS with policies for users and admins
-- ✅ Granted appropriate permissions
--
-- Next Steps:
-- 1. Refresh materialized view: SELECT refresh_sms_metrics_daily();
-- 2. Test metric recording: SELECT record_sms_metric(CURRENT_DATE, NULL, '<user_id>', 'scheduled_count', 1, '{}');
-- 3. Test queries: SELECT * FROM get_sms_daily_metrics(CURRENT_DATE - 7, CURRENT_DATE);
-- 4. Configure SLACK_WEBHOOK_URL and PAGERDUTY_INTEGRATION_KEY in environment
-- 5. Verify hourly scheduler is calling refresh_sms_metrics_daily()
--
-- Documentation: /docs/features/sms-event-scheduling/MONITORING_GUIDE.md
