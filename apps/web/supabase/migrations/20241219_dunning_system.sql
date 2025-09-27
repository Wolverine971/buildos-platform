-- supabase/migrations/20241219_dunning_system.sql
CREATE TABLE IF NOT EXISTS failed_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES customer_subscriptions(id),
  invoice_id TEXT NOT NULL UNIQUE,
  amount_due INTEGER NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INTEGER DEFAULT 1,
  last_retry_at TIMESTAMPTZ,
  dunning_stage TEXT,
  last_dunning_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_type TEXT CHECK (resolution_type IN ('paid', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_notifications table for in-app warnings
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  action_url TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add access restriction fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_restricted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_restricted_at TIMESTAMPTZ;

-- Add cancellation reason to customer_subscriptions
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Indexes for performance
CREATE INDEX idx_failed_payments_user_id ON failed_payments(user_id);
CREATE INDEX idx_failed_payments_invoice_id ON failed_payments(invoice_id);
CREATE INDEX idx_failed_payments_resolved ON failed_payments(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX idx_user_notifications_read ON user_notifications(read_at) WHERE read_at IS NULL;

-- RLS policies for failed_payments
ALTER TABLE failed_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own failed payments" ON failed_payments
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin users can view all failed payments" ON failed_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- RLS policies for user_notifications
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON user_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to get active failed payments count for a user
CREATE OR REPLACE FUNCTION get_user_failed_payments_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM failed_payments
    WHERE user_id = p_user_id
    AND resolved_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has payment issues
CREATE OR REPLACE FUNCTION user_has_payment_issues(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM failed_payments
    WHERE user_id = p_user_id
    AND resolved_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_failed_payments_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_payment_issues(UUID) TO authenticated;

-- Create cron_logs table if not exists
CREATE TABLE IF NOT EXISTS cron_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  cc TEXT[],
  bcc TEXT[],
  reply_to TEXT,
  metadata JSONB,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'bounced', 'complaint')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cron logs
CREATE INDEX idx_cron_logs_job_name ON cron_logs(job_name);
CREATE INDEX idx_cron_logs_executed_at ON cron_logs(executed_at DESC);

-- RLS for cron logs (admin only)
ALTER TABLE cron_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view cron logs" ON cron_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Indexes for email logs
CREATE INDEX idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX idx_email_logs_to_email ON email_logs(to_email);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_sent_at ON email_logs(sent_at DESC);

-- RLS for email logs
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own email logs" ON email_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin users can view all email logs" ON email_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );