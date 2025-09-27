-- supabase/migrations/20250102_add_email_daily_brief_preference.sql
ALTER TABLE user_brief_preferences
ADD COLUMN IF NOT EXISTS email_daily_brief BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN user_brief_preferences.email_daily_brief IS 'Whether the user has opted in to receive daily briefs via email';

-- Update existing rows to have the default value
UPDATE user_brief_preferences 
SET email_daily_brief = FALSE 
WHERE email_daily_brief IS NULL;