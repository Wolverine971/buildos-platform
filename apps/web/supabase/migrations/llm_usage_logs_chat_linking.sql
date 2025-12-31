-- apps/web/supabase/migrations/llm_usage_logs_chat_linking.sql
-- ============================================
-- LLM Usage Logs: Chat/Agent Linking + Flexible Operation Types
-- Purpose: Allow dynamic operation_type values and link LLM usage to chat/agent entities
-- ============================================

-- Drop dependent views to allow column type change
DROP VIEW IF EXISTS admin_llm_cost_analytics;

-- Allow dynamic operation types (chat_stream_* and agentic operations)
ALTER TABLE llm_usage_logs
	ALTER COLUMN operation_type TYPE TEXT
	USING operation_type::text;

-- Link LLM usage to chat + agentic entities
ALTER TABLE llm_usage_logs
	ADD COLUMN IF NOT EXISTS chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS agent_session_id UUID REFERENCES agent_chat_sessions(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS agent_plan_id UUID REFERENCES agent_plans(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS agent_execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL;

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_chat_session
	ON llm_usage_logs(chat_session_id, created_at DESC)
	WHERE chat_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_agent_session
	ON llm_usage_logs(agent_session_id, created_at DESC)
	WHERE agent_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_agent_plan
	ON llm_usage_logs(agent_plan_id, created_at DESC)
	WHERE agent_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_agent_execution
	ON llm_usage_logs(agent_execution_id, created_at DESC)
	WHERE agent_execution_id IS NOT NULL;

-- Recreate admin cost analytics view after type change
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
