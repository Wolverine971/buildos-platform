-- apps/web/supabase/diagnostics/check_latest_registration.sql
-- ============================================================================
-- QUICK CHECK: Verify Latest User Registration
-- Date: 2025-10-22
--
-- This automatically checks the most recently registered user
-- No need to modify anything - just run it!
-- ============================================================================

WITH latest_user AS (
  SELECT
    u.id,
    u.email,
    u.created_at,
    u.subscription_status,
    u.trial_ends_at,
    u.is_admin,
    u.trial_ends_at - NOW() as trial_remaining
  FROM users u
  ORDER BY u.created_at DESC
  LIMIT 1
)
SELECT
  '=== LATEST USER REGISTRATION ===' as section,
  NULL as status,
  NULL as details
UNION ALL
SELECT
  'Email' as section,
  '✅' as status,
  email as details
FROM latest_user
UNION ALL
SELECT
  'User ID' as section,
  '✅' as status,
  id::text as details
FROM latest_user
UNION ALL
SELECT
  'Created' as section,
  '✅' as status,
  to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as details
FROM latest_user
UNION ALL
SELECT
  'Subscription Status' as section,
  CASE
    WHEN subscription_status = 'trialing' THEN '✅'
    ELSE '❌'
  END as status,
  subscription_status as details
FROM latest_user
UNION ALL
SELECT
  'Trial End Date' as section,
  CASE
    WHEN trial_ends_at IS NOT NULL AND trial_ends_at > NOW() THEN '✅'
    WHEN trial_ends_at IS NULL THEN '❌'
    ELSE '⚠️'
  END as status,
  CASE
    WHEN trial_ends_at IS NOT NULL THEN
      to_char(trial_ends_at, 'YYYY-MM-DD') || ' (' ||
      ROUND(EXTRACT(EPOCH FROM trial_remaining)/86400) || ' days remaining)'
    ELSE 'Not set'
  END as details
FROM latest_user

UNION ALL
SELECT
  '=== AUTH PROVIDER ===' as section,
  NULL as status,
  NULL as details
UNION ALL
SELECT
  'Provider' as section,
  CASE
    WHEN ai.provider IS NOT NULL THEN '✅'
    ELSE '❌'
  END as status,
  COALESCE(ai.provider, 'Not found') as details
FROM latest_user lu
LEFT JOIN auth.identities ai ON ai.user_id = lu.id

UNION ALL
SELECT
  '=== NOTIFICATION EVENT ===' as section,
  NULL as status,
  NULL as details
UNION ALL
SELECT
  'Signup Event Created' as section,
  CASE
    WHEN ne.id IS NOT NULL THEN '✅'
    ELSE '⚠️'
  END as status,
  CASE
    WHEN ne.id IS NOT NULL THEN
      'Event ID: ' || SUBSTRING(ne.id::text, 1, 8) || '...'
    ELSE 'No event (check if subscriptions exist)'
  END as details
FROM latest_user lu
LEFT JOIN notification_events ne ON ne.actor_user_id = lu.id AND ne.event_type = 'user.signup'

UNION ALL
SELECT
  '=== TRIGGER STATUS ===' as section,
  NULL as status,
  NULL as details
UNION ALL
SELECT
  'BEFORE INSERT trigger' as section,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'before_user_insert_set_trial') THEN '✅'
    ELSE '❌'
  END as status,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'before_user_insert_set_trial') THEN 'set_user_trial_period()'
    ELSE 'Missing!'
  END as details
UNION ALL
SELECT
  'AFTER INSERT trigger' as section,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'after_user_insert_notify') THEN '✅'
    ELSE '❌'
  END as status,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'after_user_insert_notify') THEN 'notify_user_signup()'
    ELSE 'Missing!'
  END as details

UNION ALL
SELECT
  '=== ACTIVE SUBSCRIPTIONS ===' as section,
  NULL as status,
  NULL as details
UNION ALL
SELECT
  'Signup Subscriptions' as section,
  CASE
    WHEN COUNT(*) > 0 THEN '✅'
    ELSE '⚠️'
  END as status,
  COUNT(*)::text || ' active (admin: ' ||
  SUM(CASE WHEN admin_only = true THEN 1 ELSE 0 END)::text || ')' as details
FROM notification_subscriptions
WHERE event_type = 'user.signup' AND is_active = true;

-- ============================================================================
-- ADDITIONAL USEFUL QUERIES
-- ============================================================================

-- Show last 5 registered users
SELECT
  email,
  to_char(created_at, 'MM/DD HH24:MI') as registered,
  subscription_status as status,
  CASE
    WHEN trial_ends_at IS NOT NULL THEN
      ROUND(EXTRACT(EPOCH FROM (trial_ends_at - NOW()))/86400) || ' days'
    ELSE 'No trial'
  END as trial_remaining
FROM users
ORDER BY created_at DESC
LIMIT 5;

-- Show notification events for recent signups
SELECT
  to_char(ne.created_at, 'MM/DD HH24:MI') as event_time,
  u.email,
  ne.payload->>'signup_method' as signup_method,
  SUBSTRING(ne.id::text, 1, 8) as event_id
FROM notification_events ne
JOIN users u ON u.id = ne.actor_user_id
WHERE ne.event_type = 'user.signup'
ORDER BY ne.created_at DESC
LIMIT 5;

-- Check if notification tables exist and have proper foreign keys
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  CASE
    WHEN tc.constraint_type = 'FOREIGN KEY' THEN
      (SELECT table_name FROM information_schema.table_constraints WHERE constraint_name = rc.unique_constraint_name)
    ELSE NULL
  END as references_table
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.table_name IN ('notification_events', 'notification_subscriptions', 'notification_deliveries')
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
ORDER BY tc.table_name, tc.constraint_type;