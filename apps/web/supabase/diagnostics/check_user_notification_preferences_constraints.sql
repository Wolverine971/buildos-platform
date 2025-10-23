-- ============================================================================
-- CHECK: user_notification_preferences table constraints and structure
-- Date: 2025-10-22
-- ============================================================================

-- 1. Show table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_notification_preferences'
ORDER BY ordinal_position;

-- 2. Check constraints on the table
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  tc.is_deferrable,
  tc.initially_deferred
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'user_notification_preferences'
ORDER BY tc.constraint_type, tc.constraint_name;

-- 3. Check if there's a unique constraint on user_id
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'user_notification_preferences'
  AND constraint_type IN ('UNIQUE', 'PRIMARY KEY');

-- 4. Check all triggers that might be creating notification preferences
SELECT
  ns.nspname as schema_name,
  t.tgname as trigger_name,
  p.proname as function_name,
  CASE t.tgtype::integer & 66
    WHEN 2 THEN 'BEFORE'
    WHEN 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END as trigger_timing,
  CASE t.tgtype::integer & 28
    WHEN 4 THEN 'INSERT'
    WHEN 8 THEN 'DELETE'
    WHEN 16 THEN 'UPDATE'
    WHEN 20 THEN 'INSERT OR UPDATE'
    WHEN 24 THEN 'UPDATE OR DELETE'
    WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
  END as trigger_event,
  t.tgrelid::regclass as table_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE p.proname LIKE '%notification_pref%'
   OR p.proname LIKE '%create_default%'
   OR p.proname = 'auto_subscribe_user_to_brief_notifications'
ORDER BY table_name, trigger_name;