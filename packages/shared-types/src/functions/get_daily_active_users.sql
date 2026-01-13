-- packages/shared-types/src/functions/get_daily_active_users.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_daily_active_users(start_date date, end_date date)
 RETURNS TABLE(date date, active_users bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH activity AS (
    SELECT changed_by AS user_id, created_at
    FROM onto_project_logs
    WHERE created_at >= (start_date::timestamp at time zone 'UTC')
      AND created_at < ((end_date + 1)::timestamp at time zone 'UTC')
    UNION ALL
    SELECT user_id, created_at
    FROM ontology_daily_briefs
    WHERE generation_status = 'completed'
      AND created_at >= (start_date::timestamp at time zone 'UTC')
      AND created_at < ((end_date + 1)::timestamp at time zone 'UTC')
    UNION ALL
    SELECT user_id, created_at
    FROM onto_braindumps
    WHERE created_at >= (start_date::timestamp at time zone 'UTC')
      AND created_at < ((end_date + 1)::timestamp at time zone 'UTC')
    UNION ALL
    SELECT user_id, created_at
    FROM agent_chat_sessions
    WHERE created_at >= (start_date::timestamp at time zone 'UTC')
      AND created_at < ((end_date + 1)::timestamp at time zone 'UTC')
  )
  SELECT
    (created_at AT TIME ZONE 'UTC')::date AS date,
    COUNT(DISTINCT user_id) AS active_users
  FROM activity
  WHERE user_id IS NOT NULL
  GROUP BY (created_at AT TIME ZONE 'UTC')::date
  ORDER BY date;
$function$
