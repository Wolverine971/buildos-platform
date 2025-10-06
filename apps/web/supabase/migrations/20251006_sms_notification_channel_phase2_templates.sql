-- Migration: SMS Notification Channel Integration - Phase 2 Templates
-- Description: Adds SMS templates for notification events
-- Date: 2025-10-06
-- Related: /docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md

-- ============================================================================
-- SMS Notification Templates
-- ============================================================================

-- Add SMS templates for notification events
-- These are distinct from standalone SMS templates (task reminders, etc.)
INSERT INTO sms_templates (template_key, name, message_template, template_vars, description, max_length, is_active) VALUES

-- Admin notification templates
('notif_user_signup', 'Admin: New User Signup',
 'BuildOS: New user {{user_email}} signed up via {{signup_method}}',
 '{"user_email": "string", "signup_method": "string"}'::jsonb,
 'Notification template for admin when new user signs up',
 160, true),

-- User notification templates
('notif_brief_completed', 'User: Brief Ready',
 'Your BuildOS brief is ready! {{task_count}} tasks planned for {{brief_date}}. Open app to view.',
 '{"task_count": "number", "brief_date": "string"}'::jsonb,
 'Notification when daily brief generation completes',
 160, true),

('notif_brief_failed', 'User: Brief Generation Failed',
 'Your daily brief failed to generate. Please check the app or contact support.',
 '{}'::jsonb,
 'Notification when daily brief generation fails',
 160, true),

('notif_task_due_soon', 'User: Task Due Soon',
 '⏰ {{task_name}} is due {{due_time}}',
 '{"task_name": "string", "due_time": "string"}'::jsonb,
 'Notification for tasks due soon',
 160, true),

('notif_urgent_alert', 'User: Urgent Alert',
 '🚨 URGENT: {{alert_message}}',
 '{"alert_message": "string"}'::jsonb,
 'Urgent alert notification',
 160, true),

('notif_project_milestone', 'User: Project Milestone',
 '🎉 Milestone reached: {{milestone_name}} in {{project_name}}',
 '{"milestone_name": "string", "project_name": "string"}'::jsonb,
 'Notification for project milestone completion',
 160, true)

ON CONFLICT (template_key) DO UPDATE SET
  name = EXCLUDED.name,
  message_template = EXCLUDED.message_template,
  template_vars = EXCLUDED.template_vars,
  description = EXCLUDED.description,
  max_length = EXCLUDED.max_length,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- Verification
-- ============================================================================

-- Log success
DO $$
DECLARE
  v_template_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_template_count
  FROM sms_templates
  WHERE template_key LIKE 'notif_%';

  RAISE NOTICE 'SMS Notification Templates Phase 2 migration completed';
  RAISE NOTICE '- Added/updated % notification templates', v_template_count;
  RAISE NOTICE 'Templates: notif_user_signup, notif_brief_completed, notif_brief_failed, notif_task_due_soon, notif_urgent_alert, notif_project_milestone';
END $$;
