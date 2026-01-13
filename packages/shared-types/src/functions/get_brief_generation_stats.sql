-- packages/shared-types/src/functions/get_brief_generation_stats.sql
-- get_brief_generation_stats(date, date)
-- Get brief generation statistics
-- Source: supabase/migrations/20260127_admin_analytics_ontology_updates.sql

CREATE OR REPLACE FUNCTION get_brief_generation_stats(start_date date, end_date date)
RETURNS TABLE (
  date date,
  total_briefs bigint,
  unique_users bigint,
  avg_briefs_per_user numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH date_series AS (
    SELECT generate_series(start_date::date, end_date::date, '1 day'::interval)::date AS date
  ),
  brief_counts AS (
    SELECT
      brief_date AS date,
      COUNT(*) AS total_briefs,
      COUNT(DISTINCT user_id) AS unique_users
    FROM ontology_daily_briefs
    WHERE generation_status = 'completed'
      AND brief_date BETWEEN start_date AND end_date
    GROUP BY brief_date
  )
  SELECT
    ds.date,
    COALESCE(bc.total_briefs, 0) AS total_briefs,
    COALESCE(bc.unique_users, 0) AS unique_users,
    CASE
      WHEN COALESCE(bc.unique_users, 0) > 0
      THEN ROUND((bc.total_briefs::numeric / bc.unique_users)::numeric, 2)
      ELSE 0
    END AS avg_briefs_per_user
  FROM date_series ds
  LEFT JOIN brief_counts bc ON bc.date = ds.date
  ORDER BY ds.date;
$$;
