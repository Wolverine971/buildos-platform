-- Create enums for SMS messaging
CREATE TYPE sms_status AS ENUM (
  'pending',
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'undelivered',
  'scheduled',
  'cancelled'
);

CREATE TYPE sms_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- SMS Templates table (follows existing pattern from notification templates)
CREATE TABLE sms_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Template content
  message_template TEXT NOT NULL CHECK (LENGTH(TRIM(message_template)) > 0),

  -- Variable configuration (follows BuildOS pattern)
  template_vars JSONB DEFAULT '{}',
  required_vars JSONB DEFAULT '[]',

  -- Settings
  max_length INTEGER DEFAULT 160,
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_template_key CHECK (template_key ~ '^[a-z0-9_]+$')
);

-- SMS Messages table (integrates with existing queue_jobs)
CREATE TABLE sms_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message details
  phone_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  template_vars JSONB,

  -- Status tracking
  status sms_status NOT NULL DEFAULT 'pending',
  priority sms_priority NOT NULL DEFAULT 'normal',

  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Twilio integration
  twilio_sid TEXT,
  twilio_status TEXT,
  twilio_error_code INTEGER,
  twilio_error_message TEXT,

  -- Retry logic
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Related data
  queue_job_id UUID REFERENCES queue_jobs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User SMS preferences (extends existing user preferences pattern)
CREATE TABLE user_sms_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contact info
  phone_number TEXT,
  phone_verified BOOLEAN DEFAULT false,
  phone_verified_at TIMESTAMPTZ,

  -- Notification preferences
  task_reminders BOOLEAN DEFAULT false,
  daily_brief_sms BOOLEAN DEFAULT false,
  urgent_alerts BOOLEAN DEFAULT true,

  -- Timing preferences (follows daily_brief pattern)
  quiet_hours_start TIME DEFAULT '21:00',
  quiet_hours_end TIME DEFAULT '08:00',
  timezone TEXT DEFAULT 'America/Los_Angeles',

  -- Rate limiting
  daily_sms_limit INTEGER DEFAULT 10,
  daily_sms_count INTEGER DEFAULT 0,
  daily_count_reset_at TIMESTAMPTZ DEFAULT NOW(),

  -- Opt-out
  opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  opt_out_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_sms_prefs UNIQUE(user_id)
);

-- Create indexes for performance (follows existing pattern)
CREATE INDEX idx_sms_messages_user_status ON sms_messages(user_id, status);
CREATE INDEX idx_sms_messages_scheduled ON sms_messages(scheduled_for)
  WHERE status IN ('pending', 'scheduled');
CREATE INDEX idx_sms_messages_queue_job ON sms_messages(queue_job_id);
CREATE INDEX idx_sms_templates_key ON sms_templates(template_key);
CREATE INDEX idx_sms_templates_active ON sms_templates(is_active, template_key);

-- Enable Row Level Security (follows BuildOS pattern)
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sms_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_messages
CREATE POLICY "Users can view their own SMS messages" ON sms_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SMS messages" ON sms_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role has full access to SMS messages" ON sms_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policies for user_sms_preferences
CREATE POLICY "Users can view their own SMS preferences" ON user_sms_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMS preferences" ON user_sms_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role has full access to SMS preferences" ON user_sms_preferences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policies for sms_templates (admin only for modifications)
CREATE POLICY "Everyone can view active SMS templates" ON sms_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admin users can manage SMS templates" ON sms_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

CREATE POLICY "Service role has full access to SMS templates" ON sms_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add triggers for updated_at (uses existing function)
CREATE TRIGGER update_sms_messages_updated_at
  BEFORE UPDATE ON sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sms_preferences_updated_at
  BEFORE UPDATE ON user_sms_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add SMS job type to existing queue_type enum
ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'send_sms';

-- Create helper function for queueing SMS
CREATE OR REPLACE FUNCTION queue_sms_message(
  p_user_id UUID,
  p_phone_number TEXT,
  p_message TEXT,
  p_priority sms_priority DEFAULT 'normal',
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_id UUID;
  v_job_id UUID;
  v_queue_priority INTEGER;
BEGIN
  -- Convert priority to numeric value for queue
  v_queue_priority := CASE p_priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 5
    WHEN 'normal' THEN 10
    WHEN 'low' THEN 20
  END;

  -- Create SMS message record
  INSERT INTO sms_messages (
    user_id,
    phone_number,
    message_content,
    priority,
    scheduled_for,
    metadata,
    status
  ) VALUES (
    p_user_id,
    p_phone_number,
    p_message,
    p_priority,
    p_scheduled_for,
    p_metadata,
    CASE
      WHEN p_scheduled_for IS NOT NULL AND p_scheduled_for > NOW()
      THEN 'scheduled'::sms_status
      ELSE 'pending'::sms_status
    END
  ) RETURNING id INTO v_message_id;

  -- Queue the job if it should be sent now or soon
  IF p_scheduled_for IS NULL OR p_scheduled_for <= NOW() + INTERVAL '5 minutes' THEN
    -- Use existing add_queue_job function
    v_job_id := add_queue_job(
      p_user_id := p_user_id,
      p_job_type := 'send_sms',
      p_metadata := jsonb_build_object(
        'message_id', v_message_id,
        'phone_number', p_phone_number,
        'message', p_message,
        'priority', p_priority
      ),
      p_scheduled_for := COALESCE(p_scheduled_for, NOW()),
      p_priority := v_queue_priority
    );

    -- Update message with queue job reference
    UPDATE sms_messages
    SET queue_job_id = v_job_id, status = 'queued'::sms_status
    WHERE id = v_message_id;
  END IF;

  RETURN v_message_id;
END;
$$;

-- Seed initial SMS templates
INSERT INTO sms_templates (template_key, name, message_template, template_vars) VALUES
  ('task_reminder', 'Task Reminder', 'BuildOS: {{task_name}} is due {{due_time}}. {{task_context}}',
   '{"task_name": "string", "due_time": "string", "task_context": "string"}'::jsonb),

  ('daily_brief_ready', 'Daily Brief Ready', 'Your BuildOS daily brief is ready! Key focus: {{main_focus}}. Check the app for details.',
   '{"main_focus": "string"}'::jsonb),

  ('urgent_task', 'Urgent Task Alert', 'URGENT: {{task_name}} needs attention. Due: {{due_date}}. Reply STOP to opt out.',
   '{"task_name": "string", "due_date": "string"}'::jsonb),

  ('welcome_sms', 'Welcome Message', 'Welcome to BuildOS! We''ll help you stay on track. Reply HELP for commands or STOP to opt out.',
   '{}'::jsonb);

-- Analyze tables for query optimization
ANALYZE sms_messages;
ANALYZE sms_templates;
ANALYZE user_sms_preferences;