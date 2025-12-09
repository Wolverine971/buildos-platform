-- apps/worker/migrations/engagement_analytics_rpc.sql
-- Engagement Analytics RPC Function
-- Optional analytics function for the admin dashboard
-- This provides aggregated engagement metrics across all users
--
-- To install: Run this SQL in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_engagement_analytics()
RETURNS TABLE (
  total_users INTEGER,
  active_users INTEGER,
  cooling_off_users INTEGER,
  inactive_4_10_days INTEGER,
  inactive_10_31_days INTEGER,
  inactive_31_plus_days INTEGER,
  briefs_sent_today INTEGER,
  briefs_sent_week INTEGER,
  avg_days_inactive DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_status AS (
    SELECT
      u.id,
      u.last_visit,
      CASE
        WHEN u.last_visit IS NULL THEN NULL
        ELSE EXTRACT(EPOCH FROM (NOW() - u.last_visit::timestamptz)) / 86400
      END as days_inactive
    FROM users u
  )
  SELECT
    COUNT(*)::INTEGER as total_users,
    COUNT(CASE WHEN days_inactive <= 2 THEN 1 END)::INTEGER as active_users,
    COUNT(CASE WHEN days_inactive > 2 AND days_inactive <= 4 THEN 1 END)::INTEGER as cooling_off_users,
    COUNT(CASE WHEN days_inactive > 4 AND days_inactive <= 10 THEN 1 END)::INTEGER as inactive_4_10_days,
    COUNT(CASE WHEN days_inactive > 10 AND days_inactive <= 31 THEN 1 END)::INTEGER as inactive_10_31_days,
    COUNT(CASE WHEN days_inactive > 31 THEN 1 END)::INTEGER as inactive_31_plus_days,
    (SELECT COUNT(*)::INTEGER FROM daily_briefs WHERE brief_date = CURRENT_DATE) as briefs_sent_today,
    (SELECT COUNT(*)::INTEGER FROM daily_briefs WHERE brief_date >= CURRENT_DATE - INTERVAL '7 days') as briefs_sent_week,
    AVG(days_inactive)::DECIMAL(10,2) as avg_days_inactive
  FROM user_status;
END;
$$;

-- Grant execute permission to authenticated users (adjust as needed)
GRANT EXECUTE ON FUNCTION get_engagement_analytics() TO authenticated;

-- Usage example:
-- SELECT * FROM get_engagement_analytics();