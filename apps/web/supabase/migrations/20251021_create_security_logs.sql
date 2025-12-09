-- apps/web/supabase/migrations/20251021_create_security_logs.sql
-- Create security_logs table for tracking prompt injection attempts and other security events
CREATE TABLE IF NOT EXISTS security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'prompt_injection_detected',
    'prompt_injection_false_positive',
    'prompt_injection_blocked',
    'rate_limit_exceeded'
  )),
  content TEXT NOT NULL,
  regex_patterns JSONB,
  llm_validation JSONB,
  was_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT
);

-- Create indexes for common queries
CREATE INDEX idx_security_logs_user_id ON security_logs(user_id);
CREATE INDEX idx_security_logs_event_type ON security_logs(event_type);
CREATE INDEX idx_security_logs_created_at ON security_logs(created_at DESC);
CREATE INDEX idx_security_logs_was_blocked ON security_logs(was_blocked);
CREATE INDEX idx_security_logs_user_event_created ON security_logs(user_id, event_type, created_at DESC);

-- Enable RLS
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

-- Admin policy - admins can view all security logs
CREATE POLICY "Admins can view all security logs"
  ON security_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Service role can insert security logs
CREATE POLICY "Service role can insert security logs"
  ON security_logs
  FOR INSERT
  WITH CHECK (true);

-- Add comments for documentation
COMMENT ON TABLE security_logs IS 'Logs security events including prompt injection detection attempts';
COMMENT ON COLUMN security_logs.event_type IS 'Type of security event: prompt_injection_detected, prompt_injection_false_positive, prompt_injection_blocked, rate_limit_exceeded';
COMMENT ON COLUMN security_logs.content IS 'The flagged content (brain dump text, etc.)';
COMMENT ON COLUMN security_logs.regex_patterns IS 'JSON array of regex patterns that matched';
COMMENT ON COLUMN security_logs.llm_validation IS 'JSON object containing LLM validation result';
COMMENT ON COLUMN security_logs.was_blocked IS 'Whether the action was blocked due to this security event';
COMMENT ON COLUMN security_logs.metadata IS 'Additional context (brain_dump_id, endpoint, etc.)';
