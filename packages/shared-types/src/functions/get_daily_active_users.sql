-- packages/shared-types/src/functions/get_daily_active_users.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_daily_active_users(start_date date, end_date date)
 RETURNS TABLE(date date, active_users bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH activity AS (
    SELECT changed_by AS user_id, created_at::date AS activity_date
    FROM onto_project_logs
    WHERE created_at::date BETWEEN start_date AND end_date
    UNION ALL
    SELECT user_id, created_at::date AS activity_date
    FROM ontology_daily_briefs
    WHERE generation_status = 'completed'
      AND created_at::date BETWEEN start_date AND end_date
    UNION ALL
    SELECT user_id, created_at::date AS activity_date
    FROM onto_braindumps
    WHERE created_at::date BETWEEN start_date AND end_date
    UNION ALL
    SELECT user_id, created_at::date AS activity_date
    FROM agent_chat_sessions
    WHERE created_at::date BETWEEN start_date AND end_date
  )
  SELECT
    activity_date AS date,
    COUNT(DISTINCT user_id) AS active_users
  FROM activity
  WHERE user_id IS NOT NULL
  GROUP BY activity_date
  ORDER BY activity_date;
$function$
