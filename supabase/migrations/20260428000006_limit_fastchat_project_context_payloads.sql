-- supabase/migrations/20260428000006_limit_fastchat_project_context_payloads.sql
-- Limit project-context payload volume inside load_fastchat_context and return entity counts.

CREATE OR REPLACE FUNCTION public.load_fastchat_context(p_context_type text, p_user_id uuid, p_project_id uuid DEFAULT NULL::uuid, p_focus_type text DEFAULT NULL::text, p_focus_entity_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_projects jsonb;
  v_project jsonb;
  v_goals jsonb;
  v_goals_total integer := 0;
  v_milestones jsonb;
  v_milestones_total integer := 0;
  v_plans jsonb;
  v_plans_total integer := 0;
  v_tasks jsonb;
  v_tasks_total integer := 0;
  v_documents jsonb;
  v_documents_total integer := 0;
  v_documents_linked_total integer := 0;
  v_documents_unlinked_total integer := 0;
  v_events jsonb;
  v_events_total integer := 0;
  v_members jsonb;
  v_logs jsonb;
  v_focus_entity jsonb;
  v_linked_edges jsonb;
  v_linked_entities jsonb;
  v_project_ids uuid[];
  v_limit integer;
  v_user_id uuid;
BEGIN
  v_user_id := p_user_id;
  IF auth.role() <> 'service_role' THEN
    v_user_id := auth.uid();
  END IF;

  IF p_context_type = 'global' THEN
    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'projects', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'milestones', '[]'::jsonb,
        'plans', '[]'::jsonb,
        'project_logs', '[]'::jsonb
      );
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    INTO v_projects
    FROM (
      SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure
      FROM onto_projects
      WHERE deleted_at IS NULL
        AND created_by = v_user_id
      ORDER BY updated_at DESC
    ) p;

    SELECT array_agg(id)
    INTO v_project_ids
    FROM onto_projects
    WHERE deleted_at IS NULL
      AND created_by = v_user_id;

    IF v_project_ids IS NULL OR array_length(v_project_ids, 1) IS NULL THEN
      RETURN jsonb_build_object(
        'projects', v_projects,
        'goals', '[]'::jsonb,
        'milestones', '[]'::jsonb,
        'plans', '[]'::jsonb,
        'project_logs', '[]'::jsonb
      );
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
    INTO v_goals
    FROM (
      SELECT id, project_id, name, description, state_key, target_date, completed_at, updated_at
      FROM onto_goals
      WHERE project_id = ANY(v_project_ids)
        AND deleted_at IS NULL
    ) g;

    SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
    INTO v_milestones
    FROM (
      SELECT id, project_id, title, description, state_key, due_at, completed_at, updated_at
      FROM onto_milestones
      WHERE project_id = ANY(v_project_ids)
        AND deleted_at IS NULL
    ) m;

    SELECT COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
    INTO v_plans
    FROM (
      SELECT id, project_id, name, description, state_key, updated_at
      FROM onto_plans
      WHERE project_id = ANY(v_project_ids)
        AND deleted_at IS NULL
    ) pl;

    v_limit := array_length(v_project_ids, 1) * 6;

    SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
    INTO v_logs
    FROM (
      SELECT project_id, entity_type, entity_id, action, created_at, after_data, before_data
      FROM onto_project_logs
      WHERE project_id = ANY(v_project_ids)
      ORDER BY created_at DESC
      LIMIT v_limit
    ) l;

    RETURN jsonb_build_object(
      'projects', v_projects,
      'goals', v_goals,
      'milestones', v_milestones,
      'plans', v_plans,
      'project_logs', v_logs
    );
  END IF;

  IF p_project_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(p)
  INTO v_project
  FROM (
    SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure
    FROM onto_projects
    WHERE id = p_project_id
      AND deleted_at IS NULL
  ) p;

  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb),
    COALESCE(MAX(g.total_count), 0)
  INTO v_goals, v_goals_total
  FROM (
    SELECT id, project_id, name, description, state_key, target_date, completed_at, updated_at, total_count
    FROM (
      SELECT
        g.id,
        g.project_id,
        g.name,
        g.description,
        g.state_key,
        g.target_date,
        g.completed_at,
        g.updated_at,
        count(*) OVER () AS total_count,
        lower(btrim(COALESCE(g.state_key, ''))) AS state_norm,
        (
          g.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(g.state_key, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_goals g
      WHERE g.project_id = p_project_id
        AND g.deleted_at IS NULL
    ) g
    ORDER BY
      CASE WHEN g.is_completed THEN 1 ELSE 0 END ASC,
      CASE
        WHEN g.is_completed THEN NULL
        WHEN g.target_date IS NULL THEN 3
        WHEN g.target_date < now() THEN 0
        WHEN g.target_date <= (now() + interval '7 days') THEN 1
        ELSE 2
      END ASC NULLS LAST,
      CASE
        WHEN g.is_completed THEN NULL
        WHEN g.state_norm IN ('active', 'in_progress') THEN 0
        WHEN g.state_norm IN ('todo', 'pending', 'draft') THEN 1
        WHEN g.state_norm = 'blocked' THEN 2
        ELSE 3
      END ASC NULLS LAST,
      CASE WHEN g.is_completed THEN g.completed_at ELSE NULL END DESC NULLS LAST,
      g.updated_at DESC NULLS LAST,
      g.id ASC
    LIMIT 12
  ) g;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb),
    COALESCE(MAX(m.total_count), 0)
  INTO v_milestones, v_milestones_total
  FROM (
    SELECT id, project_id, title, description, state_key, due_at, completed_at, updated_at, total_count
    FROM (
      SELECT
        m.id,
        m.project_id,
        m.title,
        m.description,
        m.state_key,
        m.due_at,
        m.completed_at,
        m.updated_at,
        count(*) OVER () AS total_count,
        lower(btrim(COALESCE(m.state_key, ''))) AS state_norm,
        (
          m.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(m.state_key, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_milestones m
      WHERE m.project_id = p_project_id
        AND m.deleted_at IS NULL
    ) m
    ORDER BY
      CASE WHEN m.is_completed THEN 1 ELSE 0 END ASC,
      CASE
        WHEN m.is_completed THEN NULL
        WHEN m.due_at IS NULL THEN 3
        WHEN m.due_at < now() THEN 0
        WHEN m.due_at <= (now() + interval '7 days') THEN 1
        ELSE 2
      END ASC NULLS LAST,
      CASE
        WHEN m.is_completed THEN NULL
        WHEN m.state_norm = 'missed' THEN 0
        WHEN m.state_norm = 'in_progress' THEN 1
        WHEN m.state_norm IN ('pending', 'todo') THEN 2
        WHEN m.state_norm = 'draft' THEN 3
        ELSE 4
      END ASC NULLS LAST,
      CASE WHEN m.is_completed THEN m.completed_at ELSE NULL END DESC NULLS LAST,
      m.updated_at DESC NULLS LAST,
      m.id ASC
    LIMIT 12
  ) m;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb),
    COALESCE(MAX(pl.total_count), 0)
  INTO v_plans, v_plans_total
  FROM (
    SELECT id, project_id, name, description, state_key, updated_at, total_count
    FROM (
      SELECT
        pl.id,
        pl.project_id,
        pl.name,
        pl.description,
        pl.state_key,
        pl.updated_at,
        count(*) OVER () AS total_count,
        lower(btrim(COALESCE(pl.state_key, ''))) AS state_norm,
        lower(btrim(COALESCE(pl.state_key, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled') AS is_completed
      FROM onto_plans pl
      WHERE pl.project_id = p_project_id
        AND pl.deleted_at IS NULL
    ) pl
    ORDER BY
      CASE WHEN pl.is_completed THEN 1 ELSE 0 END ASC,
      CASE
        WHEN pl.state_norm IN ('active', 'in_progress') THEN 0
        WHEN pl.state_norm = 'blocked' THEN 1
        WHEN pl.state_norm IN ('todo', 'pending', 'draft') THEN 2
        ELSE 3
      END ASC,
      pl.updated_at DESC NULLS LAST,
      pl.id ASC
    LIMIT 12
  ) pl;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb),
    COALESCE(MAX(t.total_count), 0)
  INTO v_tasks, v_tasks_total
  FROM (
    SELECT
      id,
      project_id,
      title,
      description,
      state_key,
      priority,
      start_at,
      due_at,
      completed_at,
      updated_at,
      total_count
    FROM (
      SELECT
        t.id,
        t.project_id,
        t.title,
        t.description,
        t.state_key,
        t.priority,
        t.start_at,
        t.due_at,
        t.completed_at,
        t.updated_at,
        count(*) OVER () AS total_count,
        lower(btrim(COALESCE(t.state_key, ''))) AS state_norm,
        (
          t.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(t.state_key, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_tasks t
      WHERE t.project_id = p_project_id
        AND t.deleted_at IS NULL
    ) t
    ORDER BY
      CASE WHEN t.is_completed THEN 1 ELSE 0 END ASC,
      CASE
        WHEN t.is_completed THEN NULL
        WHEN t.due_at IS NULL THEN 3
        WHEN t.due_at < now() THEN 0
        WHEN t.due_at <= (now() + interval '7 days') THEN 1
        ELSE 2
      END ASC NULLS LAST,
      CASE
        WHEN t.is_completed THEN NULL
        WHEN t.state_norm = 'in_progress' THEN 0
        WHEN t.state_norm = 'blocked' THEN 1
        WHEN t.state_norm IN ('todo', 'pending') THEN 2
        WHEN t.state_norm IN ('draft', 'backlog') THEN 3
        ELSE 4
      END ASC NULLS LAST,
      CASE WHEN t.is_completed THEN NULL ELSE t.priority END DESC NULLS LAST,
      CASE WHEN t.is_completed THEN t.completed_at ELSE NULL END DESC NULLS LAST,
      t.updated_at DESC NULLS LAST,
      t.start_at ASC NULLS LAST,
      t.id ASC
    LIMIT 18
  ) t;

  WITH RECURSIVE doc_nodes AS (
    SELECT root.node
    FROM jsonb_array_elements(COALESCE(v_project -> 'doc_structure' -> 'root', '[]'::jsonb)) AS root(node)

    UNION ALL

    SELECT child.node
    FROM doc_nodes
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(doc_nodes.node -> 'children', '[]'::jsonb)) AS child(node)
  ),
  linked_doc_ids AS (
    SELECT DISTINCT node ->> 'id' AS id
    FROM doc_nodes
    WHERE node ? 'id'
  ),
  ranked_documents AS (
    SELECT
      d.id,
      d.project_id,
      d.title,
      d.state_key,
      d.created_at,
      d.updated_at,
      count(*) OVER () AS total_count,
      sum(CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END) OVER () AS linked_total,
      sum(CASE WHEN l.id IS NULL THEN 1 ELSE 0 END) OVER () AS unlinked_total,
      (l.id IS NOT NULL) AS is_linked,
      GREATEST(
        COALESCE(EXTRACT(EPOCH FROM d.updated_at), '-Infinity'::double precision),
        COALESCE(EXTRACT(EPOCH FROM d.created_at), '-Infinity'::double precision)
      ) AS recency_rank
    FROM onto_documents d
    LEFT JOIN linked_doc_ids l ON l.id = d.id::text
    WHERE d.project_id = p_project_id
      AND d.deleted_at IS NULL
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb),
    COALESCE(MAX(d.total_count), 0),
    COALESCE(MAX(d.linked_total), 0),
    COALESCE(MAX(d.unlinked_total), 0)
  INTO v_documents, v_documents_total, v_documents_linked_total, v_documents_unlinked_total
  FROM (
    SELECT id, project_id, title, state_key, created_at, updated_at, total_count, linked_total, unlinked_total
    FROM ranked_documents d
    ORDER BY
      CASE WHEN d.is_linked THEN 1 ELSE 0 END ASC,
      d.recency_rank DESC,
      COALESCE(d.title, '') ASC
    LIMIT 20
  ) d;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb),
    COALESCE(MAX(e.total_count), 0)
  INTO v_events, v_events_total
  FROM (
    SELECT
      id,
      project_id,
      title,
      description,
      state_key,
      start_at,
      end_at,
      all_day,
      location,
      updated_at,
      total_count
    FROM (
      SELECT
        e.id,
        e.project_id,
        e.title,
        e.description,
        e.state_key,
        e.start_at,
        e.end_at,
        e.all_day,
        e.location,
        e.updated_at,
        count(*) OVER () AS total_count
      FROM onto_events e
      WHERE e.project_id = p_project_id
        AND e.deleted_at IS NULL
        AND e.start_at >= (now() - interval '7 days')
        AND e.start_at <= (now() + interval '14 days')
    ) e
    ORDER BY e.start_at ASC NULLS LAST, e.id ASC
    LIMIT 16
  ) e;

  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
  INTO v_members
  FROM (
    SELECT
      pm.id,
      pm.project_id,
      pm.actor_id,
      pm.role_key,
      pm.access,
      pm.role_name,
      pm.role_description,
      pm.created_at,
      a.name AS actor_name,
      a.email AS actor_email
    FROM onto_project_members pm
    LEFT JOIN onto_actors a ON a.id = pm.actor_id
    WHERE pm.project_id = p_project_id
      AND pm.removed_at IS NULL
    ORDER BY
      CASE pm.role_key
        WHEN 'owner' THEN 0
        WHEN 'editor' THEN 1
        ELSE 2
      END,
      pm.created_at ASC
  ) m;

  IF p_focus_type IS NOT NULL AND p_focus_entity_id IS NOT NULL THEN
    CASE p_focus_type
      WHEN 'task' THEN
        SELECT to_jsonb(t) INTO v_focus_entity
        FROM onto_tasks t
        WHERE t.id = p_focus_entity_id AND t.project_id = p_project_id AND t.deleted_at IS NULL;
      WHEN 'goal' THEN
        SELECT to_jsonb(g) INTO v_focus_entity
        FROM onto_goals g
        WHERE g.id = p_focus_entity_id AND g.project_id = p_project_id AND g.deleted_at IS NULL;
      WHEN 'plan' THEN
        SELECT to_jsonb(pl) INTO v_focus_entity
        FROM onto_plans pl
        WHERE pl.id = p_focus_entity_id AND pl.project_id = p_project_id AND pl.deleted_at IS NULL;
      WHEN 'document' THEN
        SELECT to_jsonb(d) INTO v_focus_entity
        FROM onto_documents d
        WHERE d.id = p_focus_entity_id AND d.project_id = p_project_id AND d.deleted_at IS NULL;
      WHEN 'milestone' THEN
        SELECT to_jsonb(m) INTO v_focus_entity
        FROM onto_milestones m
        WHERE m.id = p_focus_entity_id AND m.project_id = p_project_id AND m.deleted_at IS NULL;
      WHEN 'risk' THEN
        SELECT to_jsonb(r) INTO v_focus_entity
        FROM onto_risks r
        WHERE r.id = p_focus_entity_id AND r.project_id = p_project_id AND r.deleted_at IS NULL;
      WHEN 'requirement' THEN
        SELECT to_jsonb(rq) INTO v_focus_entity
        FROM onto_requirements rq
        WHERE rq.id = p_focus_entity_id AND rq.project_id = p_project_id AND rq.deleted_at IS NULL;
      ELSE
        v_focus_entity := NULL;
    END CASE;

    WITH edges AS (
      SELECT src_id, src_kind, dst_id, dst_kind, rel
      FROM onto_edges
      WHERE project_id = p_project_id
        AND (src_id = p_focus_entity_id OR dst_id = p_focus_entity_id)
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
    INTO v_linked_edges
    FROM (SELECT * FROM edges) e;

    WITH edges AS (
      SELECT src_id, src_kind, dst_id, dst_kind, rel
      FROM onto_edges
      WHERE project_id = p_project_id
        AND (src_id = p_focus_entity_id OR dst_id = p_focus_entity_id)
    ),
    linked AS (
      SELECT dst_kind AS kind, dst_id AS id
      FROM edges
      WHERE src_id = p_focus_entity_id
      UNION
      SELECT src_kind AS kind, src_id AS id
      FROM edges
      WHERE dst_id = p_focus_entity_id
    )
    SELECT jsonb_build_object(
      'project', COALESCE((
        SELECT jsonb_agg(to_jsonb(p))
        FROM (
          SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at
          FROM onto_projects
          WHERE id IN (SELECT id FROM linked WHERE kind = 'project')
            AND deleted_at IS NULL
        ) p
      ), '[]'::jsonb),
      'task', COALESCE((
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at
          FROM onto_tasks
          WHERE id IN (SELECT id FROM linked WHERE kind = 'task')
            AND deleted_at IS NULL
        ) t
      ), '[]'::jsonb),
      'plan', COALESCE((
        SELECT jsonb_agg(to_jsonb(pl))
        FROM (
          SELECT id, name, description, state_key, updated_at
          FROM onto_plans
          WHERE id IN (SELECT id FROM linked WHERE kind = 'plan')
            AND deleted_at IS NULL
        ) pl
      ), '[]'::jsonb),
      'goal', COALESCE((
        SELECT jsonb_agg(to_jsonb(g))
        FROM (
          SELECT id, name, description, state_key, target_date, completed_at, updated_at
          FROM onto_goals
          WHERE id IN (SELECT id FROM linked WHERE kind = 'goal')
            AND deleted_at IS NULL
        ) g
      ), '[]'::jsonb),
      'milestone', COALESCE((
        SELECT jsonb_agg(to_jsonb(m))
        FROM (
          SELECT id, title, description, state_key, due_at, completed_at, updated_at
          FROM onto_milestones
          WHERE id IN (SELECT id FROM linked WHERE kind = 'milestone')
            AND deleted_at IS NULL
        ) m
      ), '[]'::jsonb),
      'document', COALESCE((
        SELECT jsonb_agg(to_jsonb(d))
        FROM (
          SELECT id, title, description, state_key, updated_at
          FROM onto_documents
          WHERE id IN (SELECT id FROM linked WHERE kind = 'document')
            AND deleted_at IS NULL
        ) d
      ), '[]'::jsonb),
      'event', COALESCE((
        SELECT jsonb_agg(to_jsonb(e))
        FROM (
          SELECT id, title, description, state_key, start_at, end_at, all_day, location, updated_at
          FROM onto_events
          WHERE id IN (SELECT id FROM linked WHERE kind = 'event')
            AND deleted_at IS NULL
        ) e
      ), '[]'::jsonb),
      'risk', COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
        FROM (
          SELECT id, title, content, state_key, impact, probability, updated_at
          FROM onto_risks
          WHERE id IN (SELECT id FROM linked WHERE kind = 'risk')
            AND deleted_at IS NULL
        ) r
      ), '[]'::jsonb),
      'requirement', COALESCE((
        SELECT jsonb_agg(to_jsonb(rq))
        FROM (
          SELECT id, text, priority, updated_at
          FROM onto_requirements
          WHERE id IN (SELECT id FROM linked WHERE kind = 'requirement')
            AND deleted_at IS NULL
        ) rq
      ), '[]'::jsonb)
    )
    INTO v_linked_entities;
  ELSE
    v_linked_edges := '[]'::jsonb;
    v_linked_entities := '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'project', v_project,
    'goals', v_goals,
    'milestones', v_milestones,
    'plans', v_plans,
    'tasks', v_tasks,
    'documents', v_documents,
    'events', v_events,
    'entity_counts', jsonb_build_object(
      'goals_total', v_goals_total,
      'milestones_total', v_milestones_total,
      'plans_total', v_plans_total,
      'tasks_total', v_tasks_total,
      'documents_total', v_documents_total,
      'document_linked_total', v_documents_linked_total,
      'document_unlinked_total', v_documents_unlinked_total,
      'events_total', v_events_total
    ),
    'members', v_members,
    'focus_entity_full', v_focus_entity,
    'focus_entity_type', p_focus_type,
    'focus_entity_id', p_focus_entity_id,
    'linked_entities', v_linked_entities,
    'linked_edges', v_linked_edges
  );
END;
$function$;
