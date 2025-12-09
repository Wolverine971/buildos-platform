-- supabase/migrations/20251016_000_PRE_MIGRATION_VERIFICATION.sql
-- =====================================================
-- PRE-MIGRATION VERIFICATION SCRIPT
-- =====================================================
-- Run these queries BEFORE executing the migration
-- to understand the current state of the database
-- =====================================================

-- Save output to a file for comparison after migration
-- \o /tmp/pre_migration_verification.txt

\echo '============================================================'
\echo 'PRE-MIGRATION VERIFICATION - NOTIFICATION PREFERENCES REFACTOR'
\echo 'Date: 2025-10-16'
\echo '============================================================'
\echo ''

-- =====================================================
-- 1. Current Table Structure
-- =====================================================
\echo '1. Current user_notification_preferences table structure:'
\echo '   (Should have event_type column)'
\echo ''
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_notification_preferences'
ORDER BY ordinal_position;

\echo ''

-- =====================================================
-- 2. Current Constraints
-- =====================================================
\echo '2. Current constraints on user_notification_preferences:'
\echo '   (Should have composite UNIQUE on user_id, event_type)'
\echo ''
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'user_notification_preferences'
ORDER BY constraint_type, constraint_name;

\echo ''

-- =====================================================
-- 3. Current Indexes
-- =====================================================
\echo '3. Current indexes on user_notification_preferences:'
\echo ''
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'user_notification_preferences'
ORDER BY indexname;

\echo ''

-- =====================================================
-- 4. Row Count Statistics
-- =====================================================
\echo '4. Current row count statistics:'
\echo ''
SELECT
  COUNT(*) as total_rows,
  COUNT(DISTINCT user_id) as distinct_users,
  COUNT(DISTINCT event_type) as distinct_event_types,
  ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT user_id), 0), 2) as avg_rows_per_user
FROM user_notification_preferences;

\echo ''

-- =====================================================
-- 5. Users with Multiple Preference Rows
-- =====================================================
\echo '5. Top 10 users with most preference rows (will be consolidated):'
\echo ''
SELECT
  user_id,
  COUNT(*) as row_count,
  ARRAY_AGG(event_type ORDER BY event_type) as event_types
FROM user_notification_preferences
GROUP BY user_id
ORDER BY COUNT(*) DESC
LIMIT 10;

\echo ''

-- =====================================================
-- 6. Event Type Distribution
-- =====================================================
\echo '6. Distribution of preferences by event_type:'
\echo ''
SELECT
  event_type,
  COUNT(*) as user_count,
  SUM(CASE WHEN push_enabled THEN 1 ELSE 0 END) as push_enabled_count,
  SUM(CASE WHEN email_enabled THEN 1 ELSE 0 END) as email_enabled_count,
  SUM(CASE WHEN sms_enabled THEN 1 ELSE 0 END) as sms_enabled_count,
  SUM(CASE WHEN in_app_enabled THEN 1 ELSE 0 END) as in_app_enabled_count
FROM user_notification_preferences
GROUP BY event_type
ORDER BY user_count DESC;

\echo ''

-- =====================================================
-- 7. Sample User Data (Before Consolidation)
-- =====================================================
\echo '7. Sample user data (first user with multiple rows):'
\echo ''
SELECT
  user_id,
  event_type,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled,
  should_email_daily_brief,
  should_sms_daily_brief,
  created_at
FROM user_notification_preferences
WHERE user_id IN (
  SELECT user_id
  FROM user_notification_preferences
  GROUP BY user_id
  HAVING COUNT(*) > 1
  LIMIT 1
)
ORDER BY event_type;

\echo ''

-- =====================================================
-- 8. Channel Enable Statistics
-- =====================================================
\echo '8. Channel enable statistics (overall):'
\echo ''
SELECT
  ROUND(AVG(CASE WHEN push_enabled THEN 1 ELSE 0 END) * 100, 2) as push_enabled_pct,
  ROUND(AVG(CASE WHEN email_enabled THEN 1 ELSE 0 END) * 100, 2) as email_enabled_pct,
  ROUND(AVG(CASE WHEN sms_enabled THEN 1 ELSE 0 END) * 100, 2) as sms_enabled_pct,
  ROUND(AVG(CASE WHEN in_app_enabled THEN 1 ELSE 0 END) * 100, 2) as in_app_enabled_pct
FROM user_notification_preferences;

\echo ''

-- =====================================================
-- 9. Conflicting Preferences Check
-- =====================================================
\echo '9. Users with CONFLICTING preferences across event types:'
\echo '   (These will be consolidated using MAX strategy)'
\echo ''
SELECT
  user_id,
  COUNT(DISTINCT push_enabled) as push_conflict,
  COUNT(DISTINCT email_enabled) as email_conflict,
  COUNT(DISTINCT sms_enabled) as sms_conflict,
  COUNT(DISTINCT in_app_enabled) as in_app_conflict,
  MAX(push_enabled::int) as max_push,
  MIN(push_enabled::int) as min_push
FROM user_notification_preferences
GROUP BY user_id
HAVING
  COUNT(DISTINCT push_enabled) > 1 OR
  COUNT(DISTINCT email_enabled) > 1 OR
  COUNT(DISTINCT sms_enabled) > 1 OR
  COUNT(DISTINCT in_app_enabled) > 1
LIMIT 10;

\echo ''

-- =====================================================
-- 10. Storage Impact
-- =====================================================
\echo '10. Current table size (will be reduced after migration):'
\echo ''
SELECT
  pg_size_pretty(pg_total_relation_size('user_notification_preferences')) as total_size,
  pg_size_pretty(pg_relation_size('user_notification_preferences')) as table_size,
  pg_size_pretty(pg_indexes_size('user_notification_preferences')) as indexes_size;

\echo ''

-- =====================================================
-- SUMMARY
-- =====================================================
\echo '============================================================'
\echo 'PRE-MIGRATION VERIFICATION COMPLETE'
\echo '============================================================'
\echo ''
\echo 'Key Metrics to Save:'
\echo '  1. Total rows in user_notification_preferences'
\echo '  2. Distinct user count'
\echo '  3. Average rows per user'
\echo '  4. Users with conflicting preferences'
\echo ''
\echo 'Next Steps:'
\echo '  1. Save this output for comparison'
\echo '  2. Run Phase 1 migration (prepare)'
\echo '  3. Run Phase 3 migration (consolidate)'
\echo '  4. Run Phase 4 migration (update function)'
\echo '  5. Run POST-MIGRATION verification'
\echo '============================================================'

-- \o
