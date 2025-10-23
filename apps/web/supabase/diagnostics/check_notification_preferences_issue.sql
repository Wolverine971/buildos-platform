-- ============================================================================
-- DIAGNOSE: user_notification_preferences table structure issue
-- Date: 2025-10-22
--
-- Error: column "event_type" of relation "user_notification_preferences" does not exist
-- ============================================================================

-- 1. Check if user_notification_preferences table exists and its structure
\d user_notification_preferences

-- 2. Check all triggers on notification_subscriptions table
SELECT
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  proname as function_name,
  pg_get_functiondef(tgfoid) as function_definition
FROM pg_trigger
JOIN pg_proc ON pg_proc.oid = pg_trigger.tgfoid
WHERE tgrelid::regclass::text = 'notification_subscriptions'
ORDER BY tgname;

-- 3. Check the problematic function
SELECT pg_get_functiondef('create_default_notification_prefs'::regproc);

-- 4. Check triggers on users table that might be causing the cascade
SELECT
  tgname as trigger_name,
  proname as function_name
FROM pg_trigger
JOIN pg_proc ON pg_proc.oid = pg_trigger.tgfoid
WHERE tgrelid::regclass::text = 'users'
ORDER BY tgname;

-- 5. Check the auto_subscribe_user_to_brief_notifications function
SELECT pg_get_functiondef('auto_subscribe_user_to_brief_notifications'::regproc);

-- 6. Check actual columns in user_notification_preferences
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_notification_preferences'
ORDER BY ordinal_position;