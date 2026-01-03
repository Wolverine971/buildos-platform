-- supabase/migrations/20260127_admin_analytics_ontology_updates.sql
-- Migration: Admin analytics ontology updates
-- Date: 2026-01-27
-- Description: Add admin read policies for ontology/agent tables and update analytics RPCs

-- ============================================
-- 1) Admin read access for analytics sources
-- ============================================

-- Ontology daily briefs + related tables
DROP POLICY IF EXISTS "ontology_daily_briefs_select_admin" ON ontology_daily_briefs;
CREATE POLICY "ontology_daily_briefs_select_admin"
  ON ontology_daily_briefs FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "ontology_project_briefs_select_admin" ON ontology_project_briefs;
CREATE POLICY "ontology_project_briefs_select_admin"
  ON ontology_project_briefs FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "ontology_brief_entities_select_admin" ON ontology_brief_entities;
CREATE POLICY "ontology_brief_entities_select_admin"
  ON ontology_brief_entities FOR SELECT
  USING (is_admin());

-- Ontology braindumps
DROP POLICY IF EXISTS "onto_braindumps_select_admin" ON onto_braindumps;
CREATE POLICY "onto_braindumps_select_admin"
  ON onto_braindumps FOR SELECT
  USING (is_admin());

-- Agent chat tables
DROP POLICY IF EXISTS "agents_select_admin" ON agents;
CREATE POLICY "agents_select_admin"
  ON agents FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "agent_plans_select_admin" ON agent_plans;
CREATE POLICY "agent_plans_select_admin"
  ON agent_plans FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "agent_chat_sessions_select_admin" ON agent_chat_sessions;
CREATE POLICY "agent_chat_sessions_select_admin"
  ON agent_chat_sessions FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "agent_chat_messages_select_admin" ON agent_chat_messages;
CREATE POLICY "agent_chat_messages_select_admin"
  ON agent_chat_messages FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "agent_executions_select_admin" ON agent_executions;
CREATE POLICY "agent_executions_select_admin"
  ON agent_executions FOR SELECT
  USING (is_admin());

-- ============================================
-- 2) Analytics RPCs (ontology-first)
-- ============================================

CREATE OR REPLACE FUNCTION get_user_engagement_metrics()
RETURNS TABLE (
  total_users bigint,
  active_users_7d bigint,
  active_users_30d bigint,
  total_briefs bigint,
  avg_brief_length numeric,
  top_active_users json
)
LANGUAGE sql
STABLE
AS $$
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
$$;

CREATE OR REPLACE FUNCTION get_daily_active_users(start_date date, end_date date)
RETURNS TABLE (
  date date,
  active_users bigint
)
LANGUAGE sql
STABLE
AS $$
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
$$;

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
