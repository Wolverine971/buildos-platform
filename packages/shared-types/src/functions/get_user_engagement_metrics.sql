-- packages/shared-types/src/functions/get_user_engagement_metrics.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_user_engagement_metrics()
 RETURNS TABLE(total_users bigint, active_users_7d bigint, active_users_30d bigint, total_briefs bigint, avg_brief_length numeric, top_active_users json)
 LANGUAGE sql
 STABLE
AS $function$
  WITH activity AS (
    SELECT changed_by AS user_id, created_at
    FROM onto_project_logs
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    UNION ALL
    SELECT user_id, created_at
    FROM ontology_daily_briefs
    WHERE generation_status = 'completed'
      AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    UNION ALL
    SELECT user_id, created_at
    FROM onto_braindumps
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    UNION ALL
    SELECT user_id, created_at
    FROM agent_chat_sessions
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  ),
  top_users AS (
    SELECT
      u.email,
      COUNT(db.id) AS brief_count,
      MAX(db.created_at) AS last_brief
    FROM users u
    LEFT JOIN ontology_daily_briefs db
      ON u.id = db.user_id
      AND db.generation_status = 'completed'
      AND db.created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY u.id, u.email
    ORDER BY brief_count DESC
    LIMIT 10
  )
  SELECT
    (SELECT COUNT(*) FROM users) AS total_users,
    (SELECT COUNT(DISTINCT user_id) FROM activity
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS active_users_7d,
    (SELECT COUNT(DISTINCT user_id) FROM activity
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS active_users_30d,
    (SELECT COUNT(*) FROM ontology_daily_briefs
      WHERE generation_status = 'completed') AS total_briefs,
    (SELECT ROUND(AVG(LENGTH(COALESCE(executive_summary, ''))))::numeric
      FROM ontology_daily_briefs
      WHERE generation_status = 'completed') AS avg_brief_length,
    (SELECT json_agg(row_to_json(t)) FROM top_users t) AS top_active_users;
$function$
