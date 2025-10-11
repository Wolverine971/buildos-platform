-- Fix column naming mismatch in user_sms_preferences
-- The code expects 'event_reminder_lead_time_minutes' but the migration created 'reminder_lead_time_minutes'
-- This migration renames the column to match the code expectations

-- Rename the column
ALTER TABLE user_sms_preferences
RENAME COLUMN reminder_lead_time_minutes TO event_reminder_lead_time_minutes;

-- Update the comment to be more descriptive
COMMENT ON COLUMN user_sms_preferences.event_reminder_lead_time_minutes IS
  'How many minutes before a calendar event to send an SMS reminder (default: 15)';

-- Verification query (commented out)
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_sms_preferences'
-- AND column_name = 'event_reminder_lead_time_minutes';
