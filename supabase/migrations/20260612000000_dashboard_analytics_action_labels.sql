-- supabase/migrations/20260612000000_dashboard_analytics_action_labels.sql
-- Update get_user_dashboard_analytics_v1 to include created_at and completed_at
-- in recent tasks, documents, and goals so the dashboard can derive action labels
-- (Created vs Updated vs Completed).

CREATE OR REPLACE FUNCTION get_user_dashboard_analytics_v1(
  p_actor_id uuid,
  p_user_id uuid,
  p_recent_limit integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_recent_limit integer := GREATEST(COALESCE(p_recent_limit, 12), 1);
  v_now timestamptz := NOW();
  v_payload jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'snapshot', jsonb_build_object(
        'totalProjects', 0,
        'activeProjects', 0,
        'totalTasks', 0,
        'totalGoals', 0,
        'totalDocuments', 0,
        'tasksUpdated24h', 0,
        'tasksUpdated7d', 0,
        'documentsUpdated24h', 0,
        'documentsUpdated7d', 0,
        'goalsUpdated24h', 0,
        'goalsUpdated7d', 0,
        'chatSessions24h', 0,
        'chatSessions7d', 0
      ),
      'attention', jsonb_build_object(
        'overdueTasks', 0,
        'staleProjects7d', 0,
        'staleProjects30d', 0
      ),
      'recent', jsonb_build_object(
        'projects', '[]'::jsonb,
        'tasks', '[]'::jsonb,
        'documents', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'chatSessions', '[]'::jsonb
      )
    );
  END IF;

  IF auth.role() = 'service_role' THEN
    v_actor_id := p_actor_id;
  ELSE
    v_actor_id := current_actor_id();
    IF v_actor_id IS NULL OR v_actor_id <> p_actor_id OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Actor/user mismatch for dashboard analytics access'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH project_summaries AS (
    SELECT * FROM get_onto_project_summaries_v1(v_actor_id)
  ),
  project_ids AS (
    SELECT id FROM project_summaries
  ),
  snapshot AS (
    SELECT
      COUNT(*)::int AS total_projects,
      COUNT(*) FILTER (
        WHERE LOWER(TRIM(COALESCE(state_key, ''))) NOT IN (
          'done', 'completed', 'canceled', 'cancelled', 'closed', 'archived', 'abandoned'
        )
      )::int AS active_projects,
      COALESCE(SUM(task_count), 0)::int AS total_tasks,
      COALESCE(SUM(goal_count), 0)::int AS total_goals,
      COALESCE(SUM(document_count), 0)::int AS total_documents,
      (
        SELECT COUNT(*)::int
        FROM onto_tasks t
        INNER JOIN project_ids p ON p.id = t.project_id
        WHERE t.deleted_at IS NULL
          AND t.updated_at >= (v_now - INTERVAL '24 hours')
      ) AS tasks_updated_24h,
      (
        SELECT COUNT(*)::int
        FROM onto_tasks t
        INNER JOIN project_ids p ON p.id = t.project_id
        WHERE t.deleted_at IS NULL
          AND t.updated_at >= (v_now - INTERVAL '7 days')
      ) AS tasks_updated_7d,
      (
        SELECT COUNT(*)::int
        FROM onto_documents d
        INNER JOIN project_ids p ON p.id = d.project_id
        WHERE d.deleted_at IS NULL
          AND d.updated_at >= (v_now - INTERVAL '24 hours')
      ) AS documents_updated_24h,
      (
        SELECT COUNT(*)::int
        FROM onto_documents d
        INNER JOIN project_ids p ON p.id = d.project_id
        WHERE d.deleted_at IS NULL
          AND d.updated_at >= (v_now - INTERVAL '7 days')
      ) AS documents_updated_7d,
      (
        SELECT COUNT(*)::int
        FROM onto_goals g
        INNER JOIN project_ids p ON p.id = g.project_id
        WHERE g.deleted_at IS NULL
          AND g.updated_at >= (v_now - INTERVAL '24 hours')
      ) AS goals_updated_24h,
      (
        SELECT COUNT(*)::int
        FROM onto_goals g
        INNER JOIN project_ids p ON p.id = g.project_id
        WHERE g.deleted_at IS NULL
          AND g.updated_at >= (v_now - INTERVAL '7 days')
      ) AS goals_updated_7d,
      (
        SELECT COUNT(*)::int
        FROM chat_sessions cs
        WHERE cs.user_id = p_user_id
          AND cs.status <> 'archived'
          AND COALESCE(cs.message_count, 0) >= 1
          AND (
            COALESCE(cs.last_message_at, '-infinity'::timestamptz) >= (v_now - INTERVAL '24 hours')
            OR cs.updated_at >= (v_now - INTERVAL '24 hours')
            OR cs.created_at >= (v_now - INTERVAL '24 hours')
          )
      ) AS chat_sessions_24h,
      (
        SELECT COUNT(*)::int
        FROM chat_sessions cs
        WHERE cs.user_id = p_user_id
          AND cs.status <> 'archived'
          AND COALESCE(cs.message_count, 0) >= 1
          AND (
            COALESCE(cs.last_message_at, '-infinity'::timestamptz) >= (v_now - INTERVAL '7 days')
            OR cs.updated_at >= (v_now - INTERVAL '7 days')
            OR cs.created_at >= (v_now - INTERVAL '7 days')
          )
      ) AS chat_sessions_7d
    FROM project_summaries
  ),
  attention AS (
    SELECT
      (
        SELECT COUNT(*)::int
        FROM onto_tasks t
        INNER JOIN project_ids p ON p.id = t.project_id
        WHERE t.deleted_at IS NULL
          AND t.due_at < v_now
          AND t.state_key IN ('todo', 'in_progress', 'blocked')
      ) AS overdue_tasks,
      (
        SELECT COUNT(*)::int
        FROM project_summaries ps
        WHERE COALESCE(ps.updated_at, 'epoch'::timestamptz) <= (v_now - INTERVAL '7 days')
      ) AS stale_projects_7d,
      (
        SELECT COUNT(*)::int
        FROM project_summaries ps
        WHERE COALESCE(ps.updated_at, 'epoch'::timestamptz) <= (v_now - INTERVAL '30 days')
      ) AS stale_projects_30d
  ),
  recent_projects AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', rp.id,
          'name', rp.name,
          'description', rp.description,
          'state_key', rp.state_key,
          'is_shared', rp.is_shared,
          'updated_at', rp.updated_at,
          'task_count', rp.task_count,
          'goal_count', rp.goal_count,
          'document_count', rp.document_count
        )
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT
        ps.id,
        ps.name,
        ps.description,
        ps.state_key,
        ps.is_shared,
        ps.updated_at,
        ps.task_count,
        ps.goal_count,
        ps.document_count
      FROM project_summaries ps
      ORDER BY ps.updated_at DESC NULLS LAST
      LIMIT v_recent_limit
    ) rp
  ),
  recent_tasks AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', rt.id,
          'project_id', rt.project_id,
          'project_name', rt.project_name,
          'title', rt.title,
          'description', rt.description,
          'state_key', rt.state_key,
          'due_at', rt.due_at,
          'created_at', rt.created_at,
          'completed_at', rt.completed_at,
          'updated_at', rt.updated_at
        )
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT
        t.id,
        t.project_id,
        ps.name AS project_name,
        t.title,
        t.description,
        t.state_key,
        t.due_at,
        t.created_at,
        t.completed_at,
        t.updated_at
      FROM onto_tasks t
      INNER JOIN project_summaries ps ON ps.id = t.project_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.updated_at DESC NULLS LAST
      LIMIT v_recent_limit
    ) rt
  ),
  recent_documents AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', rd.id,
          'project_id', rd.project_id,
          'project_name', rd.project_name,
          'title', rd.title,
          'description', rd.description,
          'state_key', rd.state_key,
          'created_at', rd.created_at,
          'updated_at', rd.updated_at
        )
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT
        d.id,
        d.project_id,
        ps.name AS project_name,
        d.title,
        d.description,
        d.state_key,
        d.created_at,
        d.updated_at
      FROM onto_documents d
      INNER JOIN project_summaries ps ON ps.id = d.project_id
      WHERE d.deleted_at IS NULL
      ORDER BY d.updated_at DESC NULLS LAST
      LIMIT v_recent_limit
    ) rd
  ),
  recent_goals AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', rg.id,
          'project_id', rg.project_id,
          'project_name', rg.project_name,
          'name', rg.name,
          'description', rg.description,
          'state_key', rg.state_key,
          'target_date', rg.target_date,
          'created_at', rg.created_at,
          'completed_at', rg.completed_at,
          'updated_at', rg.updated_at
        )
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT
        g.id,
        g.project_id,
        ps.name AS project_name,
        g.name,
        g.description,
        g.state_key,
        g.target_date,
        g.created_at,
        g.completed_at,
        g.updated_at
      FROM onto_goals g
      INNER JOIN project_summaries ps ON ps.id = g.project_id
      WHERE g.deleted_at IS NULL
      ORDER BY g.updated_at DESC NULLS LAST
      LIMIT v_recent_limit
    ) rg
  ),
  recent_chat_sessions AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', rc.id,
          'title', COALESCE(NULLIF(TRIM(rc.title), ''), NULLIF(TRIM(rc.auto_title), ''), 'Untitled chat session'),
          'summary', rc.summary,
          'status', COALESCE(rc.status, 'unknown'),
          'context_type', rc.context_type,
          'entity_id', rc.entity_id,
          'context_label',
            CASE
              WHEN rc.normalized_context = 'project' OR rc.normalized_context LIKE 'project_%' THEN
                CASE
                  WHEN rc.project_name IS NOT NULL THEN 'Chat session about project: ' || rc.project_name
                  WHEN rc.normalized_context = 'project_create' THEN 'Chat session about creating a project'
                  ELSE 'Chat session about a project'
                END
              WHEN rc.normalized_context = 'global' THEN 'Chat session in global context'
              WHEN rc.normalized_context = 'general' THEN 'Chat session in assistant context'
              WHEN rc.normalized_context = 'calendar' THEN 'Chat session about calendar'
              WHEN rc.normalized_context = 'brain_dump' THEN 'Chat session about brain dump'
              WHEN rc.normalized_context = 'ontology' THEN 'Chat session about ontology'
              WHEN rc.normalized_context = 'daily_brief_update' THEN 'Chat session about daily brief updates'
              ELSE 'Chat session in ' || REPLACE(rc.normalized_context, '_', ' ')
            END,
          'project_id',
            CASE
              WHEN (rc.normalized_context = 'project' OR rc.normalized_context LIKE 'project_%')
                AND rc.project_name IS NOT NULL
                THEN rc.project_id
              ELSE NULL
            END,
          'project_name',
            CASE
              WHEN (rc.normalized_context = 'project' OR rc.normalized_context LIKE 'project_%')
                AND rc.project_name IS NOT NULL
                THEN rc.project_name
              ELSE NULL
            END,
          'message_count', rc.message_count,
          'last_activity_at', rc.last_activity_at
        )
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT
        cs.id,
        cs.title,
        cs.auto_title,
        cs.summary,
        cs.status,
        cs.context_type,
        cs.entity_id,
        COALESCE(cs.message_count, 0) AS message_count,
        COALESCE(cs.last_message_at, cs.updated_at, cs.created_at, to_timestamp(0)) AS last_activity_at,
        LOWER(COALESCE(cs.context_type, 'global')) AS normalized_context,
        ps.id AS project_id,
        ps.name AS project_name
      FROM chat_sessions cs
      LEFT JOIN project_summaries ps ON ps.id = cs.entity_id
      WHERE cs.user_id = p_user_id
        AND cs.status <> 'archived'
        AND COALESCE(cs.message_count, 0) >= 1
      ORDER BY COALESCE(cs.last_message_at, cs.updated_at, cs.created_at) DESC NULLS LAST
      LIMIT v_recent_limit
    ) rc
  )
  SELECT jsonb_build_object(
    'snapshot', jsonb_build_object(
      'totalProjects', s.total_projects,
      'activeProjects', s.active_projects,
      'totalTasks', s.total_tasks,
      'totalGoals', s.total_goals,
      'totalDocuments', s.total_documents,
      'tasksUpdated24h', s.tasks_updated_24h,
      'tasksUpdated7d', s.tasks_updated_7d,
      'documentsUpdated24h', s.documents_updated_24h,
      'documentsUpdated7d', s.documents_updated_7d,
      'goalsUpdated24h', s.goals_updated_24h,
      'goalsUpdated7d', s.goals_updated_7d,
      'chatSessions24h', s.chat_sessions_24h,
      'chatSessions7d', s.chat_sessions_7d
    ),
    'attention', jsonb_build_object(
      'overdueTasks', a.overdue_tasks,
      'staleProjects7d', a.stale_projects_7d,
      'staleProjects30d', a.stale_projects_30d
    ),
    'recent', jsonb_build_object(
      'projects', (SELECT value FROM recent_projects),
      'tasks', (SELECT value FROM recent_tasks),
      'documents', (SELECT value FROM recent_documents),
      'goals', (SELECT value FROM recent_goals),
      'chatSessions', (SELECT value FROM recent_chat_sessions)
    )
  )
  INTO v_payload
  FROM snapshot s
  CROSS JOIN attention a;

  RETURN COALESCE(
    v_payload,
    jsonb_build_object(
      'snapshot', jsonb_build_object(
        'totalProjects', 0,
        'activeProjects', 0,
        'totalTasks', 0,
        'totalGoals', 0,
        'totalDocuments', 0,
        'tasksUpdated24h', 0,
        'tasksUpdated7d', 0,
        'documentsUpdated24h', 0,
        'documentsUpdated7d', 0,
        'goalsUpdated24h', 0,
        'goalsUpdated7d', 0,
        'chatSessions24h', 0,
        'chatSessions7d', 0
      ),
      'attention', jsonb_build_object(
        'overdueTasks', 0,
        'staleProjects7d', 0,
        'staleProjects30d', 0
      ),
      'recent', jsonb_build_object(
        'projects', '[]'::jsonb,
        'tasks', '[]'::jsonb,
        'documents', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'chatSessions', '[]'::jsonb
      )
    )
  );
END;
$$;
