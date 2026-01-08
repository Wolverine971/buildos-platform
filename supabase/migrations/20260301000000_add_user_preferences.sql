-- supabase/migrations/20260301000000_add_user_preferences.sql
-- Add preferences column to users table for AI behavior settings

ALTER TABLE users
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.preferences IS 'User preferences for AI behavior and communication style';
