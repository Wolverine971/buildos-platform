-- apps/web/supabase/migrations/llm_usage_tracking_fix2.sql
-- ============================================
-- Fix for nested aggregate function error on INSERT
-- ============================================

-- Drop the problematic trigger that fires on every INSERT
-- This was causing "aggregate function calls cannot be nested" errors
-- Summary updates should be done via cron jobs or on-demand, not synchronously
DROP TRIGGER IF EXISTS after_llm_usage_log_insert ON llm_usage_logs;

-- Drop the trigger function as well
DROP FUNCTION IF EXISTS trigger_update_llm_usage_summary();

-- Note: The update_llm_usage_summary() function is kept for manual/cron updates
-- To update summaries, call: SELECT update_llm_usage_summary(user_id, date);