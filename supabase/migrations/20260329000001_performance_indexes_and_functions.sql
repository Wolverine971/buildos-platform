-- supabase/migrations/20260329000001_performance_indexes_and_functions.sql
-- Performance indexes and function rewrites for common analytics/search/queue paths.

-- Enable trigram support for fuzzy search indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tasks (legacy) dashboard + filtering
CREATE INDEX IF NOT EXISTS idx_tasks_user_start_date_active
  ON tasks(user_id, start_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_active
  ON tasks(user_id, status)
  WHERE deleted_at IS NULL;

-- Projects (legacy) listing
CREATE INDEX IF NOT EXISTS idx_projects_user_status_created_at
  ON projects(user_id, status, created_at DESC);

-- Phases + task relations
CREATE INDEX IF NOT EXISTS idx_phases_project_order
  ON phases(project_id, "order");
CREATE INDEX IF NOT EXISTS idx_phase_tasks_phase_id
  ON phase_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_tasks_task_id
  ON phase_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_task_calendar_events_task_id
  ON task_calendar_events(task_id);

-- Queue jobs claim/reset
CREATE INDEX IF NOT EXISTS idx_queue_jobs_pending_claim
  ON queue_jobs(job_type, scheduled_for, priority DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_queue_jobs_status_updated_at
  ON queue_jobs(status, updated_at);

-- Notifications analytics
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_created_at
  ON notification_deliveries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_event_id
  ON notification_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recipient_created_at
  ON notification_deliveries(recipient_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel_created_at
  ON notification_deliveries(channel, created_at);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'notification_events'
      AND column_name = 'event_type'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notification_events_event_type_created_at ON notification_events(event_type, created_at)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'notification_subscriptions'
      AND column_name = 'event_type'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_active ON notification_subscriptions(user_id, event_type) WHERE is_active = true';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_notification_preferences'
      AND column_name = 'event_type'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_event ON user_notification_preferences(user_id, event_type)';
  END IF;
END
$$;

-- LLM usage analytics
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_created_at
  ON llm_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_user_created_at
  ON llm_usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_model_created_at
  ON llm_usage_logs(model_used, created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_operation_created_at
  ON llm_usage_logs(operation_type, created_at);

-- Visitor analytics
CREATE INDEX IF NOT EXISTS idx_visitors_created_at
  ON visitors(created_at);
CREATE INDEX IF NOT EXISTS idx_visitors_visitor_created_at
  ON visitors(visitor_id, created_at);

-- Daily brief analytics
CREATE INDEX IF NOT EXISTS idx_ontology_daily_briefs_user_date
  ON ontology_daily_briefs(user_id, brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_ontology_daily_briefs_completed_date
  ON ontology_daily_briefs(brief_date)
  WHERE generation_status = 'completed';

-- Ontology documents (soft-delete aware)
CREATE INDEX IF NOT EXISTS idx_onto_documents_project_active
  ON onto_documents(project_id)
  WHERE deleted_at IS NULL;

-- Ontology project members (active only)
CREATE INDEX IF NOT EXISTS idx_onto_project_members_actor_active
  ON onto_project_members(actor_id)
  WHERE removed_at IS NULL;

-- Search indexes for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_brain_dumps_title_trgm
  ON brain_dumps USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_brain_dumps_content_trgm
  ON brain_dumps USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_brain_dumps_ai_summary_trgm
  ON brain_dumps USING gin (ai_summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_brain_dumps_ai_insights_trgm
  ON brain_dumps USING gin (ai_insights gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_brain_dumps_tags
  ON brain_dumps USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_projects_name_trgm
  ON projects USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_description_trgm
  ON projects USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_executive_summary_trgm
  ON projects USING gin (executive_summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_context_trgm
  ON projects USING gin (context gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_tags
  ON projects USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm
  ON tasks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_description_trgm
  ON tasks USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_details_trgm
  ON tasks USING gin (details gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_task_steps_trgm
  ON tasks USING gin (task_steps gin_trgm_ops);

-- Function rewrites: range filters to allow index usage

CREATE OR REPLACE FUNCTION public.get_daily_visitors(start_date date, end_date date)
RETURNS TABLE(date date, visitor_count bigint)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(start_date::DATE, end_date::DATE, '1 day'::INTERVAL)::DATE AS date
    ),
    daily_counts AS (
        SELECT 
            (created_at AT TIME ZONE 'UTC')::date as visit_date,
            COUNT(DISTINCT visitor_id) as visitor_count
        FROM visitors 
        WHERE created_at >= (start_date::timestamp at time zone 'UTC')
          AND created_at < ((end_date + 1)::timestamp at time zone 'UTC')
        GROUP BY (created_at AT TIME ZONE 'UTC')::date
    )
    SELECT 
        ds.date,
        COALESCE(dc.visitor_count, 0) as visitor_count
    FROM date_series ds
    LEFT JOIN daily_counts dc ON ds.date = dc.visit_date
    ORDER BY ds.date ASC;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_visitor_overview()
RETURNS TABLE(total_visitors bigint, visitors_7d bigint, visitors_30d bigint, unique_visitors_today bigint)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_today_start_utc timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    v_today_end_utc timestamptz := v_today_start_utc + INTERVAL '1 day';
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors) as total_visitors,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE created_at >= NOW() - INTERVAL '7 days') as visitors_7d,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE created_at >= NOW() - INTERVAL '30 days') as visitors_30d,
        (SELECT COUNT(DISTINCT visitor_id) FROM visitors 
         WHERE created_at >= v_today_start_utc AND created_at < v_today_end_utc) as unique_visitors_today;
END;
$function$;
