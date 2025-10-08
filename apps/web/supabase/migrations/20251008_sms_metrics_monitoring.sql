-- Migration: SMS Metrics & Monitoring System
-- Created: 2025-10-08
-- Purpose: Track operational metrics, performance, quality, and costs for SMS event scheduling
-- Phase: 6.2 (Monitoring & Metrics)

-- =====================================================
-- SMS Metrics Table
-- =====================================================

CREATE TABLE IF NOT EXISTS sms_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Temporal
  metric_date DATE NOT NULL,
  metric_hour INTEGER CHECK (metric_hour BETWEEN 0 AND 23), -- NULL for daily aggregates

  -- User association (NULL for system-wide metrics)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Metric type and value
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    -- Operational metrics
    'scheduled_count',
    'sent_count',
    'delivered_count',
    'failed_count',
    'cancelled_count',

    -- Performance metrics
    'avg_delivery_time_ms',
    'avg_generation_time_ms',

    -- Quality metrics
    'llm_success_count',
    'template_fallback_count',
    'delivery_success_rate',

    -- Cost metrics
    'llm_cost_usd',
    'sms_cost_usd',

    -- User engagement
    'opt_out_count',
    'quiet_hours_skip_count',
    'daily_limit_hit_count'
  )),

  metric_value DECIMAL(12, 6) NOT NULL,

  -- Additional context
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint for aggregation
  CONSTRAINT unique_metric_entry UNIQUE(metric_date, metric_hour, user_id, metric_type)
);

-- Indexes for performance
CREATE INDEX idx_sms_metrics_date ON sms_metrics(metric_date DESC);
CREATE INDEX idx_sms_metrics_type ON sms_metrics(metric_type);
CREATE INDEX idx_sms_metrics_user_date ON sms_metrics(user_id, metric_date) WHERE user_id IS NOT NULL;
CREATE INDEX idx_sms_metrics_date_type ON sms_metrics(metric_date, metric_type);

-- Auto-update timestamp trigger
CREATE TRIGGER update_sms_metrics_updated_at
  BEFORE UPDATE ON sms_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Materialized View: Daily Metrics Summary
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS sms_metrics_daily AS
SELECT
  metric_date,

  -- Operational metrics
  SUM(metric_value) FILTER (WHERE metric_type = 'scheduled_count') as scheduled_count,
  SUM(metric_value) FILTER (WHERE metric_type = 'sent_count') as sent_count,
  SUM(metric_value) FILTER (WHERE metric_type = 'delivered_count') as delivered_count,
  SUM(metric_value) FILTER (WHERE metric_type = 'failed_count') as failed_count,
  SUM(metric_value) FILTER (WHERE metric_type = 'cancelled_count') as cancelled_count,

  -- Performance metrics
  AVG(metric_value) FILTER (WHERE metric_type = 'avg_delivery_time_ms') as avg_delivery_time_ms,
  AVG(metric_value) FILTER (WHERE metric_type = 'avg_generation_time_ms') as avg_generation_time_ms,

  -- Quality metrics
  SUM(metric_value) FILTER (WHERE metric_type = 'llm_success_count') as llm_success_count,
  SUM(metric_value) FILTER (WHERE metric_type = 'template_fallback_count') as template_fallback_count,
  AVG(metric_value) FILTER (WHERE metric_type = 'delivery_success_rate') as delivery_success_rate,

  -- Cost metrics
  SUM(metric_value) FILTER (WHERE metric_type = 'llm_cost_usd') as total_llm_cost_usd,
  SUM(metric_value) FILTER (WHERE metric_type = 'sms_cost_usd') as total_sms_cost_usd,

  -- User engagement
  SUM(metric_value) FILTER (WHERE metric_type = 'opt_out_count') as opt_out_count,
  SUM(metric_value) FILTER (WHERE metric_type = 'quiet_hours_skip_count') as quiet_hours_skip_count,
  SUM(metric_value) FILTER (WHERE metric_type = 'daily_limit_hit_count') as daily_limit_hit_count,

  -- Calculated metrics
  CASE
    WHEN SUM(metric_value) FILTER (WHERE metric_type = 'sent_count') > 0
    THEN (SUM(metric_value) FILTER (WHERE metric_type = 'delivered_count')::DECIMAL /
          SUM(metric_value) FILTER (WHERE metric_type = 'sent_count')) * 100
    ELSE 0
  END as delivery_rate_percent,

  CASE
    WHEN (SUM(metric_value) FILTER (WHERE metric_type = 'llm_success_count') +
          SUM(metric_value) FILTER (WHERE metric_type = 'template_fallback_count')) > 0
    THEN (SUM(metric_value) FILTER (WHERE metric_type = 'llm_success_count')::DECIMAL /
          (SUM(metric_value) FILTER (WHERE metric_type = 'llm_success_count') +
           SUM(metric_value) FILTER (WHERE metric_type = 'template_fallback_count'))) * 100
    ELSE 0
  END as llm_success_rate_percent,

  COUNT(DISTINCT user_id) as active_users,
  NOW() as last_refreshed
FROM sms_metrics
WHERE user_id IS NOT NULL
GROUP BY metric_date
ORDER BY metric_date DESC;

-- Index on materialized view
CREATE UNIQUE INDEX idx_sms_metrics_daily_date ON sms_metrics_daily(metric_date DESC);

-- =====================================================
-- RPC Functions for Metrics
-- =====================================================

-- Record a metric value (upsert)
CREATE OR REPLACE FUNCTION record_sms_metric(
  p_metric_date DATE,
  p_metric_hour INTEGER,
  p_user_id UUID,
  p_metric_type TEXT,
  p_metric_value DECIMAL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_metric_id UUID;
BEGIN
  INSERT INTO sms_metrics (
    metric_date,
    metric_hour,
    user_id,
    metric_type,
    metric_value,
    metadata
  ) VALUES (
    p_metric_date,
    p_metric_hour,
    p_user_id,
    p_metric_type,
    p_metric_value,
    p_metadata
  )
  ON CONFLICT (metric_date, metric_hour, user_id, metric_type)
  DO UPDATE SET
    metric_value = sms_metrics.metric_value + EXCLUDED.metric_value,
    metadata = sms_metrics.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO v_metric_id;

  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get daily metrics for a date range
CREATE OR REPLACE FUNCTION get_sms_daily_metrics(
  p_start_date DATE,
  p_end_date DATE DEFAULT NULL
) RETURNS TABLE (
  metric_date DATE,
  scheduled_count BIGINT,
  sent_count BIGINT,
  delivered_count BIGINT,
  failed_count BIGINT,
  cancelled_count BIGINT,
  avg_delivery_time_ms NUMERIC,
  llm_success_count BIGINT,
  template_fallback_count BIGINT,
  total_llm_cost_usd NUMERIC,
  delivery_rate_percent NUMERIC,
  llm_success_rate_percent NUMERIC,
  active_users BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.metric_date,
    m.scheduled_count::BIGINT,
    m.sent_count::BIGINT,
    m.delivered_count::BIGINT,
    m.failed_count::BIGINT,
    m.cancelled_count::BIGINT,
    m.avg_delivery_time_ms,
    m.llm_success_count::BIGINT,
    m.template_fallback_count::BIGINT,
    m.total_llm_cost_usd,
    m.delivery_rate_percent,
    m.llm_success_rate_percent,
    m.active_users::BIGINT
  FROM sms_metrics_daily m
  WHERE m.metric_date >= p_start_date
    AND (p_end_date IS NULL OR m.metric_date <= p_end_date)
  ORDER BY m.metric_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user-specific metrics
CREATE OR REPLACE FUNCTION get_user_sms_metrics(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30
) RETURNS TABLE (
  metric_date DATE,
  scheduled_count NUMERIC,
  sent_count NUMERIC,
  delivered_count NUMERIC,
  failed_count NUMERIC,
  llm_cost_usd NUMERIC,
  delivery_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.metric_date,
    SUM(m.metric_value) FILTER (WHERE m.metric_type = 'scheduled_count') as scheduled_count,
    SUM(m.metric_value) FILTER (WHERE m.metric_type = 'sent_count') as sent_count,
    SUM(m.metric_value) FILTER (WHERE m.metric_type = 'delivered_count') as delivered_count,
    SUM(m.metric_value) FILTER (WHERE m.metric_type = 'failed_count') as failed_count,
    SUM(m.metric_value) FILTER (WHERE m.metric_type = 'llm_cost_usd') as llm_cost_usd,
    AVG(m.metric_value) FILTER (WHERE m.metric_type = 'delivery_success_rate') as delivery_rate
  FROM sms_metrics m
  WHERE m.user_id = p_user_id
    AND m.metric_date >= CURRENT_DATE - p_days
  GROUP BY m.metric_date
  ORDER BY m.metric_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh materialized view
CREATE OR REPLACE FUNCTION refresh_sms_metrics_daily()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY sms_metrics_daily;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Alert Thresholds Table
-- =====================================================

CREATE TABLE IF NOT EXISTS sms_alert_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  alert_type TEXT NOT NULL UNIQUE CHECK (alert_type IN (
    'delivery_rate_critical',
    'llm_failure_critical',
    'llm_cost_spike_warning',
    'opt_out_rate_warning',
    'daily_limit_hit_warning'
  )),

  threshold_value DECIMAL(10, 4) NOT NULL,
  comparison_operator TEXT NOT NULL CHECK (comparison_operator IN ('<', '>', '<=', '>=', '=')),

  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  notification_channel TEXT NOT NULL CHECK (notification_channel IN ('pagerduty', 'slack', 'email')),

  enabled BOOLEAN DEFAULT true,

  -- Cooldown to prevent alert spam
  cooldown_minutes INTEGER DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default alert thresholds
INSERT INTO sms_alert_thresholds (alert_type, threshold_value, comparison_operator, severity, notification_channel, cooldown_minutes) VALUES
  ('delivery_rate_critical', 90.0, '<', 'critical', 'pagerduty', 60),
  ('llm_failure_critical', 50.0, '>', 'critical', 'pagerduty', 30),
  ('llm_cost_spike_warning', 2.0, '>', 'warning', 'slack', 120),
  ('opt_out_rate_warning', 10.0, '>', 'warning', 'slack', 240),
  ('daily_limit_hit_warning', 20.0, '>', 'warning', 'slack', 180)
ON CONFLICT (alert_type) DO NOTHING;

-- Index
CREATE INDEX idx_sms_alert_thresholds_enabled ON sms_alert_thresholds(enabled) WHERE enabled = true;

-- Auto-update timestamp trigger
CREATE TRIGGER update_sms_alert_thresholds_updated_at
  BEFORE UPDATE ON sms_alert_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Alert History Table
-- =====================================================

CREATE TABLE IF NOT EXISTS sms_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,

  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  metric_value DECIMAL(10, 4),
  threshold_value DECIMAL(10, 4),

  message TEXT NOT NULL,
  notification_channel TEXT NOT NULL,
  notification_sent BOOLEAN DEFAULT false,
  notification_error TEXT,

  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX idx_sms_alert_history_triggered ON sms_alert_history(triggered_at DESC);
CREATE INDEX idx_sms_alert_history_type ON sms_alert_history(alert_type);
CREATE INDEX idx_sms_alert_history_unresolved ON sms_alert_history(resolved_at) WHERE resolved_at IS NULL;

-- =====================================================
-- RLS Policies
-- =====================================================

-- Enable RLS
ALTER TABLE sms_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_alert_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_alert_history ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY service_role_all_sms_metrics ON sms_metrics FOR ALL USING (true);
CREATE POLICY service_role_all_sms_alert_thresholds ON sms_alert_thresholds FOR ALL USING (true);
CREATE POLICY service_role_all_sms_alert_history ON sms_alert_history FOR ALL USING (true);

-- Users can view their own metrics
CREATE POLICY users_view_own_metrics ON sms_metrics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view alert history (read-only)
CREATE POLICY users_view_alert_history ON sms_alert_history
  FOR SELECT
  USING (true);

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE sms_metrics IS 'Tracks SMS event scheduling metrics for monitoring and alerting';
COMMENT ON TABLE sms_alert_thresholds IS 'Configurable alert thresholds for SMS system monitoring';
COMMENT ON TABLE sms_alert_history IS 'History of triggered alerts for SMS monitoring';
COMMENT ON MATERIALIZED VIEW sms_metrics_daily IS 'Daily aggregated SMS metrics for dashboard';

COMMENT ON FUNCTION record_sms_metric IS 'Upsert a metric value (increments if exists, creates if new)';
COMMENT ON FUNCTION get_sms_daily_metrics IS 'Retrieve daily metrics for a date range';
COMMENT ON FUNCTION get_user_sms_metrics IS 'Retrieve user-specific metrics for analysis';
COMMENT ON FUNCTION refresh_sms_metrics_daily IS 'Refresh the materialized view (call hourly via cron)';
