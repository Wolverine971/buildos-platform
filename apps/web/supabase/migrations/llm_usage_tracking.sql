-- ============================================
-- LLM Usage Tracking Migration
-- Created: 2025-09-30
-- Purpose: Track all LLM API calls for cost attribution, analytics, and optimization
-- ============================================

-- Create enum for operation types
CREATE TYPE llm_operation_type AS ENUM (
  'brain_dump',
  'brain_dump_short',
  'brain_dump_context',
  'brain_dump_tasks',
  'daily_brief',
  'project_brief',
  'phase_generation',
  'task_scheduling',
  'calendar_analysis',
  'project_synthesis',
  'email_generation',
  'question_generation',
  'embedding',
  'other'
);

-- Create enum for request status
CREATE TYPE llm_request_status AS ENUM (
  'success',
  'failure',
  'timeout',
  'rate_limited',
  'invalid_response'
);

-- ============================================
-- Main LLM Usage Logs Table
-- ============================================
CREATE TABLE llm_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_type llm_operation_type NOT NULL,

  -- Model information
  model_requested VARCHAR(255) NOT NULL,
  model_used VARCHAR(255) NOT NULL, -- Actual model from OpenRouter (may differ due to routing)
  provider VARCHAR(100), -- e.g., 'openai', 'anthropic', 'google'

  -- Token usage
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,

  -- Cost tracking (in USD)
  input_cost_usd DECIMAL(12, 8) NOT NULL,
  output_cost_usd DECIMAL(12, 8) NOT NULL,
  total_cost_usd DECIMAL(12, 8) NOT NULL,

  -- Performance metrics
  response_time_ms INTEGER NOT NULL,
  request_started_at TIMESTAMPTZ NOT NULL,
  request_completed_at TIMESTAMPTZ NOT NULL,

  -- Request details
  status llm_request_status NOT NULL DEFAULT 'success',
  error_message TEXT,

  -- Request parameters
  temperature DECIMAL(3, 2),
  max_tokens INTEGER,
  profile VARCHAR(50), -- 'fast', 'balanced', 'powerful', etc.
  streaming BOOLEAN DEFAULT false,

  -- Related entities (for attribution and analysis)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  brain_dump_id UUID REFERENCES brain_dumps(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  brief_id UUID REFERENCES daily_briefs(id) ON DELETE SET NULL,

  -- OpenRouter metadata
  openrouter_request_id VARCHAR(255),
  openrouter_cache_status VARCHAR(50), -- 'hit', 'miss', etc.
  rate_limit_remaining INTEGER,

  -- Additional metadata (JSON for flexibility)
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Most common query: user's usage over time
CREATE INDEX idx_llm_usage_logs_user_created
  ON llm_usage_logs(user_id, created_at DESC);

-- Cost queries by user
CREATE INDEX idx_llm_usage_logs_user_cost
  ON llm_usage_logs(user_id, total_cost_usd);

-- Operation type analysis
CREATE INDEX idx_llm_usage_logs_operation
  ON llm_usage_logs(operation_type, created_at DESC);

-- Model performance analysis
CREATE INDEX idx_llm_usage_logs_model
  ON llm_usage_logs(model_used, created_at DESC);

-- Status filtering (for error analysis)
CREATE INDEX idx_llm_usage_logs_status
  ON llm_usage_logs(status, created_at DESC)
  WHERE status != 'success';

-- Related entity lookups
CREATE INDEX idx_llm_usage_logs_project
  ON llm_usage_logs(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX idx_llm_usage_logs_brain_dump
  ON llm_usage_logs(brain_dump_id, created_at DESC)
  WHERE brain_dump_id IS NOT NULL;

-- Date-based queries are covered by idx_llm_usage_logs_user_created
-- No separate date index needed since created_at timestamp can be filtered efficiently

-- ============================================
-- User Usage Summary Table (Aggregated)
-- ============================================
CREATE TABLE llm_usage_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Time period
  summary_date DATE NOT NULL,
  summary_type VARCHAR(20) NOT NULL, -- 'daily', 'monthly'

  -- Aggregated metrics
  total_requests INTEGER NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  failed_requests INTEGER NOT NULL DEFAULT 0,

  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
  total_completion_tokens INTEGER NOT NULL DEFAULT 0,

  total_cost_usd DECIMAL(12, 6) NOT NULL DEFAULT 0,

  -- Performance
  avg_response_time_ms INTEGER,
  min_response_time_ms INTEGER,
  max_response_time_ms INTEGER,

  -- Model breakdown (JSONB for flexibility)
  models_used JSONB, -- { "gpt-4o-mini": { "requests": 10, "cost": 0.05 }, ... }
  operations_breakdown JSONB, -- { "brain_dump": { "requests": 5, "cost": 0.03 }, ... }

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint to prevent duplicate summaries
  UNIQUE(user_id, summary_date, summary_type)
);

-- Indexes for summary table
CREATE INDEX idx_llm_usage_summary_user_date
  ON llm_usage_summary(user_id, summary_date DESC);

CREATE INDEX idx_llm_usage_summary_type
  ON llm_usage_summary(summary_type, summary_date DESC);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE llm_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage_summary ENABLE ROW LEVEL SECURITY;

-- Users can only see their own usage logs
CREATE POLICY llm_usage_logs_user_select
  ON llm_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert logs (API calls)
CREATE POLICY llm_usage_logs_service_insert
  ON llm_usage_logs FOR INSERT
  WITH CHECK (true);

-- Admins can see all logs
CREATE POLICY llm_usage_logs_admin_all
  ON llm_usage_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Users can see their own summaries
CREATE POLICY llm_usage_summary_user_select
  ON llm_usage_summary FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage summaries
CREATE POLICY llm_usage_summary_service_all
  ON llm_usage_summary FOR ALL
  WITH CHECK (true);

-- Admins can see all summaries
CREATE POLICY llm_usage_summary_admin_all
  ON llm_usage_summary FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get user's usage for a date range
CREATE OR REPLACE FUNCTION get_user_llm_usage(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_requests BIGINT,
  total_cost NUMERIC,
  total_tokens BIGINT,
  avg_response_time NUMERIC,
  by_operation JSONB,
  by_model JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_requests,
    SUM(total_cost_usd)::NUMERIC as total_cost,
    SUM(total_tokens)::BIGINT as total_tokens,
    AVG(response_time_ms)::NUMERIC as avg_response_time,

    -- Breakdown by operation
    jsonb_object_agg(
      operation_type::text,
      jsonb_build_object(
        'requests', op_stats.requests,
        'cost', op_stats.cost,
        'tokens', op_stats.tokens
      )
    ) FILTER (WHERE operation_type IS NOT NULL) as by_operation,

    -- Breakdown by model
    jsonb_object_agg(
      model_used,
      jsonb_build_object(
        'requests', model_stats.requests,
        'cost', model_stats.cost,
        'tokens', model_stats.tokens
      )
    ) FILTER (WHERE model_used IS NOT NULL) as by_model

  FROM llm_usage_logs l
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) as requests,
      SUM(total_cost_usd) as cost,
      SUM(total_tokens) as tokens
    FROM llm_usage_logs
    WHERE user_id = p_user_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND operation_type = l.operation_type
    GROUP BY operation_type
  ) op_stats ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) as requests,
      SUM(total_cost_usd) as cost,
      SUM(total_tokens) as tokens
    FROM llm_usage_logs
    WHERE user_id = p_user_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND model_used = l.model_used
    GROUP BY model_used
  ) model_stats ON true
  WHERE l.user_id = p_user_id
    AND l.created_at BETWEEN p_start_date AND p_end_date;
END;
$$;

-- Function to update daily summary
CREATE OR REPLACE FUNCTION update_llm_usage_summary(
  p_user_id UUID,
  p_date DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_models_breakdown JSONB;
  v_operations_breakdown JSONB;
BEGIN
  -- Build models breakdown
  SELECT jsonb_object_agg(
    model_used,
    jsonb_build_object(
      'requests', COUNT(*),
      'cost', SUM(total_cost_usd),
      'tokens', SUM(total_tokens)
    )
  )
  INTO v_models_breakdown
  FROM llm_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= p_date::timestamp
    AND created_at < (p_date + INTERVAL '1 day')::timestamp
  GROUP BY model_used;

  -- Build operations breakdown
  SELECT jsonb_object_agg(
    operation_type::text,
    jsonb_build_object(
      'requests', COUNT(*),
      'cost', SUM(total_cost_usd),
      'tokens', SUM(total_tokens)
    )
  )
  INTO v_operations_breakdown
  FROM llm_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= p_date::timestamp
    AND created_at < (p_date + INTERVAL '1 day')::timestamp
  GROUP BY operation_type;

  -- Upsert summary
  INSERT INTO llm_usage_summary (
    user_id,
    summary_date,
    summary_type,
    total_requests,
    successful_requests,
    failed_requests,
    total_tokens,
    total_prompt_tokens,
    total_completion_tokens,
    total_cost_usd,
    avg_response_time_ms,
    min_response_time_ms,
    max_response_time_ms,
    models_used,
    operations_breakdown
  )
  SELECT
    p_user_id,
    p_date,
    'daily',
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status != 'success'),
    SUM(total_tokens),
    SUM(prompt_tokens),
    SUM(completion_tokens),
    SUM(total_cost_usd),
    AVG(response_time_ms)::INTEGER,
    MIN(response_time_ms),
    MAX(response_time_ms),
    v_models_breakdown,
    v_operations_breakdown
  FROM llm_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= p_date::timestamp
    AND created_at < (p_date + INTERVAL '1 day')::timestamp
  ON CONFLICT (user_id, summary_date, summary_type)
  DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    successful_requests = EXCLUDED.successful_requests,
    failed_requests = EXCLUDED.failed_requests,
    total_tokens = EXCLUDED.total_tokens,
    total_prompt_tokens = EXCLUDED.total_prompt_tokens,
    total_completion_tokens = EXCLUDED.total_completion_tokens,
    total_cost_usd = EXCLUDED.total_cost_usd,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    min_response_time_ms = EXCLUDED.min_response_time_ms,
    max_response_time_ms = EXCLUDED.max_response_time_ms,
    models_used = EXCLUDED.models_used,
    operations_breakdown = EXCLUDED.operations_breakdown,
    updated_at = NOW();
END;
$$;

-- Trigger to auto-update summary after insert
CREATE OR REPLACE FUNCTION trigger_update_llm_usage_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update summary asynchronously (fire and forget)
  PERFORM update_llm_usage_summary(NEW.user_id, NEW.created_at::date);
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_llm_usage_log_insert
  AFTER INSERT ON llm_usage_logs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_llm_usage_summary();

-- ============================================
-- Admin Views for Analytics
-- ============================================

-- View for admin cost analytics
CREATE OR REPLACE VIEW admin_llm_cost_analytics AS
SELECT
  l.created_at::date as date,
  l.operation_type,
  l.model_used,
  COUNT(*) as total_requests,
  COUNT(DISTINCT l.user_id) as unique_users,
  SUM(l.total_tokens) as total_tokens,
  SUM(l.total_cost_usd) as total_cost,
  AVG(l.response_time_ms)::INTEGER as avg_response_time,
  COUNT(*) FILTER (WHERE l.status = 'success') as successful_requests,
  COUNT(*) FILTER (WHERE l.status != 'success') as failed_requests
FROM llm_usage_logs l
GROUP BY l.created_at::date, l.operation_type, l.model_used
ORDER BY date DESC, total_cost DESC;

-- View for user cost rankings
CREATE OR REPLACE VIEW admin_user_llm_costs AS
SELECT
  l.user_id,
  u.email,
  u.name,
  COUNT(*) as total_requests,
  SUM(l.total_cost_usd) as total_cost,
  SUM(l.total_tokens) as total_tokens,
  AVG(l.response_time_ms)::INTEGER as avg_response_time,
  MAX(l.created_at) as last_usage
FROM llm_usage_logs l
JOIN users u ON u.id = l.user_id
GROUP BY l.user_id, u.email, u.name
ORDER BY total_cost DESC;

-- ============================================
-- Admin RPC Functions
-- ============================================

-- Get model breakdown for admin dashboard
CREATE OR REPLACE FUNCTION get_admin_model_breakdown(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  model VARCHAR,
  requests BIGINT,
  total_cost NUMERIC,
  total_tokens BIGINT,
  avg_response_time INTEGER,
  success_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.model_used as model,
    COUNT(*)::BIGINT as requests,
    SUM(l.total_cost_usd)::NUMERIC as total_cost,
    SUM(l.total_tokens)::BIGINT as total_tokens,
    AVG(l.response_time_ms)::INTEGER as avg_response_time,
    (COUNT(*) FILTER (WHERE l.status = 'success')::NUMERIC / COUNT(*)::NUMERIC * 100) as success_rate
  FROM llm_usage_logs l
  WHERE l.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY l.model_used
  ORDER BY total_cost DESC;
END;
$$;

-- Get operation breakdown for admin dashboard
CREATE OR REPLACE FUNCTION get_admin_operation_breakdown(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  operation VARCHAR,
  requests BIGINT,
  total_cost NUMERIC,
  total_tokens BIGINT,
  avg_response_time INTEGER,
  success_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.operation_type::VARCHAR as operation,
    COUNT(*)::BIGINT as requests,
    SUM(l.total_cost_usd)::NUMERIC as total_cost,
    SUM(l.total_tokens)::BIGINT as total_tokens,
    AVG(l.response_time_ms)::INTEGER as avg_response_time,
    (COUNT(*) FILTER (WHERE l.status = 'success')::NUMERIC / COUNT(*)::NUMERIC * 100) as success_rate
  FROM llm_usage_logs l
  WHERE l.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY l.operation_type
  ORDER BY total_cost DESC;
END;
$$;

-- Get top users by cost
CREATE OR REPLACE FUNCTION get_admin_top_users(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  email VARCHAR,
  name VARCHAR,
  requests BIGINT,
  total_cost NUMERIC,
  total_tokens BIGINT,
  avg_response_time INTEGER,
  last_usage TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.user_id,
    u.email::VARCHAR,
    u.name::VARCHAR,
    COUNT(*)::BIGINT as requests,
    SUM(l.total_cost_usd)::NUMERIC as total_cost,
    SUM(l.total_tokens)::BIGINT as total_tokens,
    AVG(l.response_time_ms)::INTEGER as avg_response_time,
    MAX(l.created_at) as last_usage
  FROM llm_usage_logs l
  JOIN users u ON u.id = l.user_id
  WHERE l.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY l.user_id, u.email, u.name
  ORDER BY total_cost DESC
  LIMIT p_limit;
END;
$$;

-- ============================================
-- Comments for Documentation
-- ============================================

COMMENT ON TABLE llm_usage_logs IS
  'Detailed logs of all LLM API calls for cost attribution, analytics, and debugging';

COMMENT ON TABLE llm_usage_summary IS
  'Aggregated daily/monthly summaries of LLM usage per user for faster queries';

COMMENT ON COLUMN llm_usage_logs.model_requested IS
  'The model initially requested (may differ from model_used due to OpenRouter routing)';

COMMENT ON COLUMN llm_usage_logs.model_used IS
  'The actual model that processed the request (from OpenRouter response headers)';

COMMENT ON COLUMN llm_usage_logs.total_cost_usd IS
  'Total cost in USD calculated as: (prompt_tokens * input_cost) + (completion_tokens * output_cost)';

COMMENT ON FUNCTION get_user_llm_usage IS
  'Returns aggregated LLM usage statistics for a user within a date range';

COMMENT ON FUNCTION update_llm_usage_summary IS
  'Updates or creates the daily usage summary for a user and date';