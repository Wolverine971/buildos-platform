-- supabase/migrations/20260929150000_chat_reads_exclude_archived.sql
-- Tasker 113: Agentic Chat reads the present, not the archive.
--
-- The chat context packet (load_fastchat_context), its "overdue / due soon" digest
-- (build_fastchat_project_intelligence) and both search RPCs filtered only deleted_at.
-- A record archived through the connector has archived_at set and deleted_at NULL, so
-- on DJ's project all 18 packet tasks were archived and ranked as overdue live work.
--
-- Current rows are now deleted_at IS NULL AND archived_at IS NULL; a document is also
-- current only when its state_key is not 'archived' (the tree archives by state).
-- Calendar events owned by an archived or deleted task stay out of the packet, the
-- digest and semantic search. The focused record itself is still loaded: opening chat
-- on a record is the user's explicit choice. Archived records reach chat only through
-- its explicit archive read.
--
-- Bodies are prod's live definitions (pg_get_functiondef, 2026-09-29) with only those
-- filters added. CREATE OR REPLACE keeps each function's owner and grants. Mirrors:
-- packages/shared-types/src/functions/{load_fastchat_context,build_fastchat_project_intelligence,
-- onto_search_entities,onto_search_semantic}.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.build_fastchat_project_intelligence(p_context_type text, p_user_id uuid, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
  v_scope text := CASE WHEN p_context_type = 'project' THEN 'project' ELSE 'global' END;
  v_now timestamptz := now();
  v_due_soon_days integer := 7;
  v_upcoming_days integer := 30;
  v_recent_days integer := 7;
  v_recent_max_lookback_days integer := 21;
  v_attention_limit integer := CASE WHEN p_context_type = 'project' THEN 12 ELSE 16 END;
  v_project_limit integer := CASE WHEN p_context_type = 'project' THEN 1 ELSE 8 END;
  v_project_name text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'generated_at', v_now,
      'scope', v_scope,
      'project_id', p_project_id,
      'project_name', NULL,
      'timezone', 'UTC',
      'windows', jsonb_build_object(
        'due_soon_days', v_due_soon_days,
        'upcoming_days', v_upcoming_days,
        'recent_changes_days', v_recent_days,
        'recent_changes_max_lookback_days', v_recent_max_lookback_days
      ),
      'counts', jsonb_build_object(
        'accessible_projects', 0,
        'projects_returned', 0,
        'overdue_total', 0,
        'due_soon_total', 0,
        'upcoming_total', 0,
        'recent_change_total', 0
      ),
      'overdue_or_due_soon', '[]'::jsonb,
      'upcoming_work', '[]'::jsonb,
      'recent_changes', '[]'::jsonb,
      'project_summaries', '[]'::jsonb,
      'limits', jsonb_build_object(
        'overdue_or_due_soon', v_attention_limit,
        'upcoming_work', v_attention_limit,
        'recent_changes', v_attention_limit,
        'project_summaries', v_project_limit
      ),
      'maybe_more', jsonb_build_object(
        'overdue_or_due_soon', false,
        'upcoming_work', false,
        'recent_changes', false,
        'project_summaries', false
      ),
      'source', 'load_fastchat_context'
    );
  END IF;

  IF auth.role() = 'service_role' THEN
    v_actor_id := ensure_actor_for_user(p_user_id);
  ELSE
    v_actor_id := current_actor_id();
    IF v_actor_id IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Actor/user mismatch for fastchat project intelligence'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_scope = 'project' AND p_project_id IS NOT NULL THEN
    SELECT ps.name
    INTO v_project_name
    FROM get_onto_project_summaries_v1(v_actor_id) ps
    WHERE ps.id = p_project_id
    LIMIT 1;
  END IF;

  RETURN (
    WITH project_summaries AS (
      SELECT *
      FROM get_onto_project_summaries_v1(v_actor_id)
    ),
    project_scope AS (
      SELECT *
      FROM project_summaries ps
      WHERE v_scope = 'global'
         OR ps.id = p_project_id
    ),
    work_candidates AS (
      SELECT
        'task'::text AS kind,
        t.id,
        t.project_id,
        ps.name AS project_name,
        t.title AS title,
        t.state_key::text AS state_key,
        CASE WHEN t.due_at IS NOT NULL THEN 'due_at' ELSE 'start_at' END AS date_kind,
        COALESCE(t.due_at, t.start_at) AS date_at,
        t.priority,
        t.updated_at,
        (
          t.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(t.state_key::text, ''))) IN (
            'done', 'completed', 'closed', 'archived', 'cancelled', 'canceled', 'abandoned'
          )
        ) AS is_completed
      FROM onto_tasks t
      INNER JOIN project_scope ps ON ps.id = t.project_id
      WHERE t.deleted_at IS NULL
        AND t.archived_at IS NULL
        AND (t.due_at IS NOT NULL OR t.start_at IS NOT NULL)

      UNION ALL

      SELECT
        'milestone'::text AS kind,
        m.id,
        m.project_id,
        ps.name AS project_name,
        m.title AS title,
        m.state_key::text AS state_key,
        'due_at'::text AS date_kind,
        m.due_at AS date_at,
        NULL::integer AS priority,
        m.updated_at,
        (
          m.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(m.state_key::text, ''))) IN (
            'done', 'completed', 'closed', 'archived', 'cancelled', 'canceled', 'abandoned'
          )
        ) AS is_completed
      FROM onto_milestones m
      INNER JOIN project_scope ps ON ps.id = m.project_id
      WHERE m.deleted_at IS NULL
        AND m.archived_at IS NULL
        AND m.due_at IS NOT NULL

      UNION ALL

      SELECT
        'goal'::text AS kind,
        g.id,
        g.project_id,
        ps.name AS project_name,
        g.name AS title,
        g.state_key::text AS state_key,
        'target_date'::text AS date_kind,
        g.target_date AS date_at,
        NULL::integer AS priority,
        g.updated_at,
        (
          g.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(g.state_key::text, ''))) IN (
            'done', 'completed', 'closed', 'archived', 'cancelled', 'canceled', 'abandoned'
          )
        ) AS is_completed
      FROM onto_goals g
      INNER JOIN project_scope ps ON ps.id = g.project_id
      WHERE g.deleted_at IS NULL
        AND g.archived_at IS NULL
        AND g.target_date IS NOT NULL

      UNION ALL

      SELECT
        'event'::text AS kind,
        e.id,
        e.project_id,
        ps.name AS project_name,
        e.title AS title,
        e.state_key::text AS state_key,
        'start_at'::text AS date_kind,
        e.start_at AS date_at,
        NULL::integer AS priority,
        e.updated_at,
        lower(btrim(COALESCE(e.state_key::text, ''))) IN (
          'done', 'completed', 'closed', 'archived', 'cancelled', 'canceled', 'abandoned'
        ) AS is_completed
      FROM onto_events e
      INNER JOIN project_scope ps ON ps.id = e.project_id
      WHERE e.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM onto_tasks owner_task
          WHERE e.owner_entity_type = 'task'
            AND owner_task.id = e.owner_entity_id
            AND (owner_task.deleted_at IS NOT NULL OR owner_task.archived_at IS NOT NULL)
        )
        AND e.start_at IS NOT NULL
    ),
    bucketed_work AS (
      SELECT
        wc.*,
        CASE
          WHEN wc.kind = 'event' AND wc.date_at >= v_now AND wc.date_at <= (v_now + make_interval(days => v_upcoming_days)) THEN 'upcoming'
          WHEN wc.kind = 'event' THEN NULL
          WHEN wc.kind = 'task' AND wc.date_kind = 'start_at' AND wc.date_at < v_now THEN NULL
          WHEN wc.date_at < v_now THEN 'overdue'
          WHEN wc.date_at <= (v_now + make_interval(days => v_due_soon_days)) THEN 'due_soon'
          WHEN wc.date_at <= (v_now + make_interval(days => v_upcoming_days)) THEN 'upcoming'
          ELSE NULL
        END AS bucket
      FROM work_candidates wc
      WHERE NOT wc.is_completed
    ),
    filtered_work AS (
      SELECT *
      FROM bucketed_work
      WHERE bucket IS NOT NULL
        AND date_at >= TIMESTAMPTZ '2020-01-01'
        AND date_at < TIMESTAMPTZ '2101-01-01'
    ),
    recent_candidates AS (
      SELECT
        l.project_id,
        l.entity_type,
        l.entity_id,
        l.action,
        l.created_at,
        COALESCE(
          l.after_data ->> 'title',
          l.after_data ->> 'name',
          l.after_data ->> 'text',
          l.after_data ->> 'summary',
          l.after_data ->> 'display_name',
          l.before_data ->> 'title',
          l.before_data ->> 'name',
          l.before_data ->> 'text',
          l.before_data ->> 'summary',
          l.before_data ->> 'display_name'
        ) AS title,
        ps.name AS project_name
      FROM onto_project_logs l
      INNER JOIN project_scope ps ON ps.id = l.project_id
      WHERE l.action IN ('created', 'updated')
        AND l.created_at >= (v_now - make_interval(days => v_recent_max_lookback_days))
    ),
    recent_window AS (
      SELECT COUNT(*) AS count
      FROM recent_candidates
      WHERE created_at >= (v_now - make_interval(days => v_recent_days))
    ),
    recent_changes AS (
      SELECT *
      FROM recent_candidates rc
      WHERE rc.created_at >= (
        CASE
          WHEN (SELECT count FROM recent_window) > 0
            THEN v_now - make_interval(days => v_recent_days)
          ELSE v_now - make_interval(days => v_recent_max_lookback_days)
        END
      )
    ),
    project_signal_counts AS (
      SELECT
        ps.id AS project_id,
        ps.name AS project_name,
        ps.state_key,
        ps.next_step_short,
        ps.updated_at,
        COUNT(*) FILTER (WHERE fw.bucket = 'overdue')::integer AS overdue,
        COUNT(*) FILTER (WHERE fw.bucket = 'due_soon')::integer AS due_soon,
        COUNT(*) FILTER (WHERE fw.bucket = 'upcoming')::integer AS upcoming,
        (
          SELECT COUNT(*)::integer
          FROM recent_changes rc
          WHERE rc.project_id = ps.id
        ) AS recent_changes
      FROM project_scope ps
      LEFT JOIN filtered_work fw ON fw.project_id = ps.id
      GROUP BY ps.id, ps.name, ps.state_key, ps.next_step_short, ps.updated_at
    ),
    project_summaries_json AS (
      SELECT COALESCE(jsonb_agg((to_jsonb(s) - 'attention_score') ORDER BY s.attention_score DESC, s.updated_at DESC NULLS LAST), '[]'::jsonb) AS value
      FROM (
        SELECT
          psc.project_id,
          psc.project_name,
          psc.state_key,
          psc.next_step_short,
          psc.updated_at,
          jsonb_build_object(
            'overdue', psc.overdue,
            'due_soon', psc.due_soon,
            'upcoming', psc.upcoming,
            'recent_changes', psc.recent_changes
          ) AS counts,
          (LEAST(psc.overdue, 5) + psc.due_soon * 6 + psc.upcoming * 2 + psc.recent_changes) AS attention_score
        FROM project_signal_counts psc
        ORDER BY attention_score DESC, psc.updated_at DESC NULLS LAST
        LIMIT v_project_limit
      ) s
    ),
    overdue_due_soon_json AS (
      SELECT COALESCE(jsonb_agg(
        (to_jsonb(w) - 'bucket_rank')
        ORDER BY
          w.bucket_rank,
          CASE WHEN w.bucket = 'due_soon' THEN w.date END ASC NULLS LAST,
          CASE WHEN w.bucket = 'overdue' THEN w.date END DESC NULLS LAST,
          w.priority DESC NULLS LAST,
          w.updated_at DESC NULLS LAST,
          w.title
      ), '[]'::jsonb) AS value
      FROM (
        SELECT
          kind,
          id,
          project_id,
          project_name,
          title,
          state_key,
          date_kind,
          date_at AS date,
          bucket,
          CEIL(EXTRACT(EPOCH FROM (date_trunc('day', date_at) - date_trunc('day', v_now))) / 86400)::integer AS days_delta,
          priority,
          updated_at,
          CASE bucket WHEN 'due_soon' THEN 0 ELSE 1 END AS bucket_rank
        FROM filtered_work
        WHERE bucket IN ('overdue', 'due_soon')
        ORDER BY
          bucket_rank,
          CASE WHEN bucket = 'due_soon' THEN date_at END ASC NULLS LAST,
          CASE WHEN bucket = 'overdue' THEN date_at END DESC NULLS LAST,
          priority DESC NULLS LAST,
          updated_at DESC NULLS LAST,
          title ASC
        LIMIT v_attention_limit
      ) w
    ),
    upcoming_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.date, w.title), '[]'::jsonb) AS value
      FROM (
        SELECT
          kind,
          id,
          project_id,
          project_name,
          title,
          state_key,
          date_kind,
          date_at AS date,
          bucket,
          CEIL(EXTRACT(EPOCH FROM (date_trunc('day', date_at) - date_trunc('day', v_now))) / 86400)::integer AS days_delta,
          priority,
          updated_at
        FROM filtered_work
        WHERE bucket = 'upcoming'
        ORDER BY date_at ASC, title ASC
        LIMIT v_attention_limit
      ) w
    ),
    recent_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.changed_at DESC), '[]'::jsonb) AS value
      FROM (
        SELECT
          entity_type AS kind,
          entity_id AS id,
          project_id,
          project_name,
          title,
          action,
          created_at AS changed_at
        FROM recent_changes
        ORDER BY created_at DESC
        LIMIT v_attention_limit
      ) r
    ),
    totals AS (
      SELECT
        COUNT(*) FILTER (WHERE bucket = 'overdue')::integer AS overdue_total,
        COUNT(*) FILTER (WHERE bucket = 'due_soon')::integer AS due_soon_total,
        COUNT(*) FILTER (WHERE bucket = 'upcoming')::integer AS upcoming_total,
        (SELECT COUNT(*)::integer FROM recent_changes) AS recent_change_total,
        (SELECT COUNT(*)::integer FROM project_scope) AS accessible_projects
      FROM filtered_work
    )
    SELECT jsonb_build_object(
      'generated_at', v_now,
      'scope', v_scope,
      'project_id', CASE WHEN v_scope = 'project' THEN p_project_id ELSE NULL END,
      'project_name', CASE WHEN v_scope = 'project' THEN v_project_name ELSE NULL END,
      'timezone', 'UTC',
      'windows', jsonb_build_object(
        'due_soon_days', v_due_soon_days,
        'upcoming_days', v_upcoming_days,
        'recent_changes_days', v_recent_days,
        'recent_changes_max_lookback_days', v_recent_max_lookback_days
      ),
      'counts', jsonb_build_object(
        'accessible_projects', CASE WHEN v_scope = 'global' THEN totals.accessible_projects ELSE NULL END,
        'projects_returned', jsonb_array_length((SELECT value FROM project_summaries_json)),
        'overdue_total', totals.overdue_total,
        'due_soon_total', totals.due_soon_total,
        'upcoming_total', totals.upcoming_total,
        'recent_change_total', totals.recent_change_total
      ),
      'overdue_or_due_soon', (SELECT value FROM overdue_due_soon_json),
      'upcoming_work', (SELECT value FROM upcoming_json),
      'recent_changes', (SELECT value FROM recent_json),
      'project_summaries', (SELECT value FROM project_summaries_json),
      'limits', jsonb_build_object(
        'overdue_or_due_soon', v_attention_limit,
        'upcoming_work', v_attention_limit,
        'recent_changes', v_attention_limit,
        'project_summaries', v_project_limit
      ),
      'maybe_more', jsonb_build_object(
        'overdue_or_due_soon', (totals.overdue_total + totals.due_soon_total) > v_attention_limit,
        'upcoming_work', totals.upcoming_total > v_attention_limit,
        'recent_changes', totals.recent_change_total > v_attention_limit,
        'project_summaries', totals.accessible_projects > v_project_limit
      ),
      'source', 'load_fastchat_context'
    )
    FROM totals
  );
END;
$function$;

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
  v_user_id uuid;
  v_actor_id uuid;
BEGIN
  v_user_id := p_user_id;
  IF auth.role() <> 'service_role' THEN
    v_user_id := auth.uid();
  END IF;
  IF v_user_id IS NOT NULL THEN
    IF auth.role() = 'service_role' THEN
      v_actor_id := ensure_actor_for_user(v_user_id);
    ELSE
      v_actor_id := current_actor_id();
    END IF;
  END IF;

  IF p_context_type = 'global' THEN
    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'projects', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'milestones', '[]'::jsonb,
        'plans', '[]'::jsonb,
        'project_logs', '[]'::jsonb,
        'project_intelligence', public.build_fastchat_project_intelligence('global', v_user_id, NULL)
      );
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    INTO v_projects
    FROM (
      SELECT
        ps.id,
        ps.name,
        ps.state_key,
        ps.description,
        p.start_at,
        p.end_at,
        ps.next_step_short,
        ps.updated_at
      FROM get_onto_project_summaries_v1(v_actor_id) ps
      INNER JOIN onto_projects p ON p.id = ps.id
      ORDER BY ps.updated_at DESC
    ) p;

    SELECT array_agg(id ORDER BY updated_at DESC)
    INTO v_project_ids
    FROM get_onto_project_summaries_v1(v_actor_id);

    IF v_project_ids IS NULL OR array_length(v_project_ids, 1) IS NULL THEN
      RETURN jsonb_build_object(
        'projects', v_projects,
        'goals', '[]'::jsonb,
        'milestones', '[]'::jsonb,
        'plans', '[]'::jsonb,
        'project_logs', '[]'::jsonb,
        'project_intelligence', public.build_fastchat_project_intelligence('global', v_user_id, NULL)
      );
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
    INTO v_goals
    FROM (
      SELECT id, project_id, name, description, state_key, target_date, completed_at, updated_at
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
          row_number() OVER (
            PARTITION BY g.project_id
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
          ) AS project_rank
        FROM (
          SELECT
            id,
            project_id,
            name,
            description,
            state_key,
            target_date,
            completed_at,
            updated_at,
            lower(btrim(COALESCE(state_key::text, ''))) AS state_norm,
            (
              completed_at IS NOT NULL
              OR lower(btrim(COALESCE(state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
            ) AS is_completed
          FROM onto_goals
          WHERE project_id = ANY(v_project_ids)
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) g
      ) g
      WHERE g.project_rank <= 4
      ORDER BY array_position(v_project_ids, g.project_id), g.project_rank
    ) g;

    SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
    INTO v_milestones
    FROM (
      SELECT id, project_id, title, description, state_key, due_at, completed_at, updated_at
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
          row_number() OVER (
            PARTITION BY m.project_id
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
          ) AS project_rank
        FROM (
          SELECT
            id,
            project_id,
            title,
            description,
            state_key,
            due_at,
            completed_at,
            updated_at,
            lower(btrim(COALESCE(state_key::text, ''))) AS state_norm,
            (
              completed_at IS NOT NULL
              OR lower(btrim(COALESCE(state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
            ) AS is_completed
          FROM onto_milestones
          WHERE project_id = ANY(v_project_ids)
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) m
      ) m
      WHERE m.project_rank <= 4
      ORDER BY array_position(v_project_ids, m.project_id), m.project_rank
    ) m;

    SELECT COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
    INTO v_plans
    FROM (
      SELECT id, project_id, name, description, state_key, updated_at
      FROM (
        SELECT
          pl.id,
          pl.project_id,
          pl.name,
          pl.description,
          pl.state_key,
          pl.updated_at,
          row_number() OVER (
            PARTITION BY pl.project_id
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
          ) AS project_rank
        FROM (
          SELECT
            id,
            project_id,
            name,
            description,
            state_key,
            updated_at,
            lower(btrim(COALESCE(state_key::text, ''))) AS state_norm,
            lower(btrim(COALESCE(state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled') AS is_completed
          FROM onto_plans
          WHERE project_id = ANY(v_project_ids)
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) pl
      ) pl
      WHERE pl.project_rank <= 4
      ORDER BY array_position(v_project_ids, pl.project_id), pl.project_rank
    ) pl;

    SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
    INTO v_logs
    FROM (
      SELECT project_id, entity_type, entity_id, action, created_at, after_data, before_data
      FROM (
        SELECT
          l.project_id,
          l.entity_type,
          l.entity_id,
          l.action,
          l.created_at,
          l.after_data,
          l.before_data,
          row_number() OVER (
            PARTITION BY l.project_id
            ORDER BY l.created_at DESC, l.entity_id ASC
          ) AS project_rank
        FROM onto_project_logs l
        WHERE l.project_id = ANY(v_project_ids)
      ) l
      WHERE l.project_rank <= 6
      ORDER BY array_position(v_project_ids, l.project_id), l.project_rank
    ) l;

    RETURN jsonb_build_object(
      'projects', v_projects,
      'goals', v_goals,
      'milestones', v_milestones,
      'plans', v_plans,
      'project_logs', v_logs,
      'project_intelligence', public.build_fastchat_project_intelligence('global', v_user_id, NULL)
    );
  END IF;

  IF p_project_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT actor_has_project_member_access(v_actor_id, p_project_id, 'read') THEN
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
        lower(btrim(COALESCE(g.state_key::text, ''))) AS state_norm,
        (
          g.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(g.state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_goals g
      WHERE g.project_id = p_project_id
        AND g.deleted_at IS NULL
        AND g.archived_at IS NULL
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
        lower(btrim(COALESCE(m.state_key::text, ''))) AS state_norm,
        (
          m.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(m.state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_milestones m
      WHERE m.project_id = p_project_id
        AND m.deleted_at IS NULL
        AND m.archived_at IS NULL
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
        lower(btrim(COALESCE(pl.state_key::text, ''))) AS state_norm,
        lower(btrim(COALESCE(pl.state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled') AS is_completed
      FROM onto_plans pl
      WHERE pl.project_id = p_project_id
        AND pl.deleted_at IS NULL
        AND pl.archived_at IS NULL
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
        lower(btrim(COALESCE(t.state_key::text, ''))) AS state_norm,
        (
          t.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(t.state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_tasks t
      WHERE t.project_id = p_project_id
        AND t.deleted_at IS NULL
        AND t.archived_at IS NULL
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
      AND d.archived_at IS NULL
      AND COALESCE(d.state_key::text, '') <> 'archived'
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
        AND NOT EXISTS (
          SELECT 1 FROM onto_tasks owner_task
          WHERE e.owner_entity_type = 'task'
            AND owner_task.id = e.owner_entity_id
            AND (owner_task.deleted_at IS NOT NULL OR owner_task.archived_at IS NOT NULL)
        )
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
            AND archived_at IS NULL
        ) t
      ), '[]'::jsonb),
      'plan', COALESCE((
        SELECT jsonb_agg(to_jsonb(pl))
        FROM (
          SELECT id, name, description, state_key, updated_at
          FROM onto_plans
          WHERE id IN (SELECT id FROM linked WHERE kind = 'plan')
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) pl
      ), '[]'::jsonb),
      'goal', COALESCE((
        SELECT jsonb_agg(to_jsonb(g))
        FROM (
          SELECT id, name, description, state_key, target_date, completed_at, updated_at
          FROM onto_goals
          WHERE id IN (SELECT id FROM linked WHERE kind = 'goal')
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) g
      ), '[]'::jsonb),
      'milestone', COALESCE((
        SELECT jsonb_agg(to_jsonb(m))
        FROM (
          SELECT id, title, description, state_key, due_at, completed_at, updated_at
          FROM onto_milestones
          WHERE id IN (SELECT id FROM linked WHERE kind = 'milestone')
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) m
      ), '[]'::jsonb),
      'document', COALESCE((
        SELECT jsonb_agg(to_jsonb(d))
        FROM (
          SELECT id, title, description, state_key, updated_at
          FROM onto_documents
          WHERE id IN (SELECT id FROM linked WHERE kind = 'document')
            AND deleted_at IS NULL
            AND archived_at IS NULL
            AND COALESCE(state_key::text, '') <> 'archived'
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
            AND archived_at IS NULL
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
    'linked_edges', v_linked_edges,
    'project_intelligence', public.build_fastchat_project_intelligence('project', v_user_id, p_project_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.onto_search_entities(p_actor_id uuid, p_query text, p_project_id uuid DEFAULT NULL::uuid, p_types text[] DEFAULT NULL::text[], p_limit integer DEFAULT 50)
 RETURNS TABLE(type text, id uuid, project_id uuid, project_name text, title text, snippet text, score double precision, state_key text, type_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
	v_limit int := least(coalesce(p_limit, 50), 50);
	v_query tsquery;
	v_claims_text text;
	v_jwt_role text;
begin
	if coalesce(trim(p_query), '') = '' then
		return;
	end if;

	-- A service caller may search for an explicit actor; authenticated callers
	-- may only search as their own actor. The SECURITY DEFINER body below then
	-- applies owner/member access explicitly instead of relying on caller RLS.
	v_claims_text := nullif(current_setting('request.jwt.claims', true), '');
	if v_claims_text is not null then
		v_jwt_role := nullif((v_claims_text::jsonb) ->> 'role', '');
	end if;
	v_jwt_role := coalesce(
		v_jwt_role,
		nullif(current_setting('request.jwt.claim.role', true), '')
	);

	if v_jwt_role = 'service_role' then
		null;
	elsif v_jwt_role = 'authenticated' then
		if public.current_actor_id() is null
			or public.current_actor_id() is distinct from p_actor_id then
			raise exception 'onto_search_entities may only search as the authenticated actor'
				using errcode = '42501';
		end if;
	elsif v_jwt_role is not null then
		raise exception 'onto_search_entities requires authentication'
			using errcode = '42501';
	elsif session_user not in ('postgres', 'supabase_admin') then
		raise exception 'onto_search_entities requires a trusted database session'
			using errcode = '42501';
	end if;

	v_query := websearch_to_tsquery('english', p_query);

	return query
	with params as (select v_query as tsq),
	accessible as (
		select p.id, p.name
		from onto_projects p
		where p.deleted_at is null
			and (p_project_id is null or p.id = p_project_id)
			and (
				p.created_by = p_actor_id
				or exists (
					select 1
					from onto_project_members m
					where m.project_id = p.id
						and m.actor_id = p_actor_id
						and m.removed_at is null
						and m.access in ('read', 'write', 'admin')
				)
			)
	)
	select *
	from (
		-- Projects
		select
			'project'::text as type,
			p.id,
			p.id as project_id,
			p.name as project_name,
			p.name as title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(p.name, ''), coalesce(p.description, ''), coalesce(p.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(p.search_vector, params.tsq), 0) * 0.7) +
			(greatest(
				similarity(coalesce(p.name, ''), p_query),
				similarity(coalesce(p.description, ''), p_query)
			) * 0.3) as score,
			p.state_key::text as state_key,
			p.type_key::text as type_key
		from onto_projects p
		join params on true
		join accessible access on access.id = p.id
		where p.deleted_at is null
			and (p_types is null or 'project' = any(p_types))
			and (
				params.tsq @@ p.search_vector
				or similarity(coalesce(p.name, ''), p_query) >= 0.2
				or similarity(coalesce(p.description, ''), p_query) >= 0.12
			)

		union all

		-- Tasks
		select
			'task'::text as type,
			t.id,
			t.project_id,
			p.name as project_name,
			t.title as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(t.title, ''),
					coalesce(t.description, ''),
					coalesce(t.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(t.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(t.title, ''), p_query),
				similarity(coalesce(t.description, ''), p_query)
			) * 0.35) as score,
			t.state_key::text as state_key,
			t.type_key::text as type_key
		from onto_tasks t
		join params on true
		join accessible p on p.id = t.project_id
		where t.deleted_at is null
			and t.archived_at is null
			and (p_types is null or 'task' = any(p_types))
			and (
				params.tsq @@ t.search_vector
				or similarity(coalesce(t.title, ''), p_query) >= 0.2
				or similarity(coalesce(t.description, ''), p_query) >= 0.12
			)

		union all

		-- Plans
		select
			'plan'::text as type,
			pl.id,
			pl.project_id,
			p.name as project_name,
			pl.name as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(pl.name, ''),
					coalesce(pl.description, ''),
					coalesce(pl.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(pl.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(pl.name, ''), p_query),
				similarity(coalesce(pl.description, ''), p_query)
			) * 0.35) as score,
			pl.state_key::text as state_key,
			pl.type_key::text as type_key
		from onto_plans pl
		join params on true
		join accessible p on p.id = pl.project_id
		where pl.deleted_at is null
			and pl.archived_at is null
			and (p_types is null or 'plan' = any(p_types))
			and (
				params.tsq @@ pl.search_vector
				or similarity(coalesce(pl.name, ''), p_query) >= 0.2
				or similarity(coalesce(pl.description, ''), p_query) >= 0.12
			)

		union all

		-- Goals
		select
			'goal'::text as type,
			g.id,
			g.project_id,
			p.name as project_name,
			g.name as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(g.name, ''),
					coalesce(g.description, ''),
					coalesce(g.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(g.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(g.name, ''), p_query),
				similarity(coalesce(g.description, ''), p_query)
			) * 0.35) as score,
			g.state_key::text as state_key,
			g.type_key::text as type_key
		from onto_goals g
		join params on true
		join accessible p on p.id = g.project_id
		where g.deleted_at is null
			and g.archived_at is null
			and (p_types is null or 'goal' = any(p_types))
			and (
				params.tsq @@ g.search_vector
				or similarity(coalesce(g.name, ''), p_query) >= 0.2
				or similarity(coalesce(g.description, ''), p_query) >= 0.12
			)

		union all

		-- Milestones
		select
			'milestone'::text as type,
			m.id,
			m.project_id,
			p.name as project_name,
			m.title as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(m.title, ''),
					coalesce(m.description, ''),
					coalesce(m.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(m.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(m.title, ''), p_query),
				similarity(coalesce(m.description, ''), p_query)
			) * 0.35) as score,
			m.state_key::text as state_key,
			m.type_key::text as type_key
		from onto_milestones m
		join params on true
		join accessible p on p.id = m.project_id
		where m.deleted_at is null
			and m.archived_at is null
			and (p_types is null or 'milestone' = any(p_types))
			and (
				params.tsq @@ m.search_vector
				or similarity(coalesce(m.title, ''), p_query) >= 0.2
				or similarity(coalesce(m.description, ''), p_query) >= 0.12
			)

		union all

		-- Documents
		select
			'document'::text as type,
			d.id,
			d.project_id,
			p.name as project_name,
			d.title as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(d.title, ''),
					coalesce(d.description, ''),
					coalesce(d.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(d.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(d.title, ''), p_query),
				similarity(coalesce(d.description, ''), p_query)
			) * 0.35) as score,
			d.state_key::text as state_key,
			d.type_key::text as type_key
		from onto_documents d
		join params on true
		join accessible p on p.id = d.project_id
		where d.deleted_at is null
			and d.archived_at is null
			and COALESCE(d.state_key::text, '') <> 'archived'
			and (p_types is null or 'document' = any(p_types))
			and (
				params.tsq @@ d.search_vector
				or similarity(coalesce(d.title, ''), p_query) >= 0.2
				or similarity(coalesce(d.description, ''), p_query) >= 0.12
			)

		union all

		-- Risks
		select
			'risk'::text as type,
			rk.id,
			rk.project_id,
			p.name as project_name,
			rk.title as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(rk.title, ''),
					coalesce(rk.content, ''),
					coalesce(rk.props::text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(rk.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(rk.title, ''), p_query),
				similarity(coalesce(rk.content, ''), p_query)
			) * 0.35) as score,
			rk.state_key::text as state_key,
			rk.type_key::text as type_key
		from onto_risks rk
		join params on true
		join accessible p on p.id = rk.project_id
		where rk.deleted_at is null
			and rk.archived_at is null
			and (p_types is null or 'risk' = any(p_types))
			and (
				params.tsq @@ rk.search_vector
				or similarity(coalesce(rk.title, ''), p_query) >= 0.2
				or similarity(coalesce(rk.content, ''), p_query) >= 0.12
			)

		union all

		-- Images
		select
			'image'::text as type,
			a.id,
			a.project_id,
			p.name as project_name,
			coalesce(a.caption, a.alt_text, a.original_filename, 'Image') as title,
			ts_headline(
				'english',
				concat_ws(
					' ',
					coalesce(a.caption, ''),
					coalesce(a.alt_text, ''),
					coalesce(a.extraction_summary, ''),
					coalesce(a.extracted_text, '')
				),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(a.search_vector, params.tsq), 0) * 0.65) +
			(greatest(
				similarity(coalesce(a.caption, ''), p_query),
				similarity(coalesce(a.alt_text, ''), p_query),
				similarity(coalesce(a.original_filename, ''), p_query)
			) * 0.35) as score,
			a.ocr_status::text as state_key,
			a.kind::text as type_key
		from onto_assets a
		join params on true
		join accessible p on p.id = a.project_id
		where a.deleted_at is null
			and (p_types is null or 'image' = any(p_types))
			and (
				params.tsq @@ a.search_vector
				or similarity(coalesce(a.caption, ''), p_query) >= 0.2
				or similarity(coalesce(a.alt_text, ''), p_query) >= 0.2
				or similarity(coalesce(a.original_filename, ''), p_query) >= 0.2
			)

		union all

		-- Requirements
		select
			'requirement'::text as type,
			r.id,
			r.project_id,
			p.name as project_name,
			r."text" as title,
			ts_headline(
				'english',
				concat_ws(' ', coalesce(r."text", ''), coalesce(r.props::text, '')),
				params.tsq,
				'MaxFragments=2,MinWords=5,MaxWords=18'
			) as snippet,
			(coalesce(ts_rank(r.search_vector, params.tsq), 0) * 0.7) +
			(similarity(coalesce(r."text", ''), p_query) * 0.3) as score,
			null::text as state_key,
			r.type_key::text as type_key
		from onto_requirements r
		join params on true
		join accessible p on p.id = r.project_id
		where r.deleted_at is null
			and (p_types is null or 'requirement' = any(p_types))
			and (
				params.tsq @@ r.search_vector
				or similarity(coalesce(r."text", ''), p_query) >= 0.2
			)
	) as results
	order by score desc, title asc nulls last
	limit v_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.onto_search_semantic(p_actor_id uuid, p_query_embedding vector, p_project_id uuid DEFAULT NULL::uuid, p_types text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20, p_min_similarity double precision DEFAULT 0.15)
 RETURNS TABLE(type text, id uuid, project_id uuid, project_name text, title text, snippet text, score double precision, state_key text, type_key text, chunk_anchor text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
	v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
	v_claims_text text;
	v_jwt_role text;
BEGIN
	IF p_actor_id IS NULL OR p_query_embedding IS NULL THEN
		RETURN;
	END IF;

	-- Caller-identity guard, mirroring 20260825181727: service_role may search
	-- as any actor; an authenticated caller only as itself.
	v_claims_text := NULLIF(current_setting('request.jwt.claims', true), '');
	IF v_claims_text IS NOT NULL THEN
		v_jwt_role := NULLIF((v_claims_text::jsonb) ->> 'role', '');
	END IF;
	v_jwt_role := COALESCE(
		v_jwt_role,
		NULLIF(current_setting('request.jwt.claim.role', true), '')
	);

	IF v_jwt_role = 'service_role' THEN
		NULL;
	ELSIF v_jwt_role = 'authenticated' THEN
		IF public.current_actor_id() IS NULL
			OR public.current_actor_id() IS DISTINCT FROM p_actor_id THEN
			RAISE EXCEPTION 'onto_search_semantic may only search as the authenticated actor'
				USING ERRCODE = '42501';
		END IF;
	ELSIF v_jwt_role IS NOT NULL THEN
		RAISE EXCEPTION 'onto_search_semantic requires authentication'
			USING ERRCODE = '42501';
	ELSIF session_user NOT IN ('postgres', 'supabase_admin') THEN
		RAISE EXCEPTION 'onto_search_semantic requires a trusted database session'
			USING ERRCODE = '42501';
	END IF;

	-- The HNSW index scan returns candidates in distance order; widen its
	-- horizon so membership/type filters applied after the scan cannot starve
	-- results.
	PERFORM set_config('hnsw.ef_search', '200', true);

	RETURN QUERY
	WITH accessible AS (
		SELECT p.id AS accessible_project_id, p.name AS accessible_project_name
		FROM public.onto_projects p
		WHERE p.deleted_at IS NULL
			AND (p_project_id IS NULL OR p.id = p_project_id)
			AND (
				p.created_by = p_actor_id
				OR EXISTS (
					SELECT 1
					FROM public.onto_project_members m
					WHERE m.project_id = p.id
						AND m.actor_id = p_actor_id
						AND m.removed_at IS NULL
						AND m.access IN ('read', 'write', 'admin')
				)
			)
	),
	candidates AS (
		SELECT
			e.entity_type,
			e.entity_id,
			e.project_id AS candidate_project_id,
			e.chunk_anchor,
			e.content_text,
			1 - (e.embedding <=> p_query_embedding) AS similarity
		FROM public.onto_embeddings e
		ORDER BY e.embedding <=> p_query_embedding
		LIMIT 400
	),
	matches AS (
		SELECT DISTINCT ON (c.entity_type, c.entity_id)
			c.entity_type,
			c.entity_id,
			c.candidate_project_id,
			a.accessible_project_name,
			c.chunk_anchor,
			c.content_text,
			c.similarity
		FROM candidates c
		JOIN accessible a ON a.accessible_project_id = c.candidate_project_id
		WHERE (p_types IS NULL OR c.entity_type = ANY (p_types))
			AND c.similarity >= coalesce(p_min_similarity, 0.15)
		ORDER BY c.entity_type, c.entity_id, c.similarity DESC
	)
	SELECT * FROM (
		SELECT
			'project'::text AS type, p.id, p.id AS project_id,
			m.accessible_project_name AS project_name, p.name AS title,
			left(m.content_text, 280) AS snippet, m.similarity AS score,
			p.state_key::text AS state_key, p.type_key::text AS type_key,
			m.chunk_anchor
		FROM matches m
		JOIN public.onto_projects p ON p.id = m.entity_id AND p.deleted_at IS NULL
		WHERE m.entity_type = 'project'

		UNION ALL

		SELECT
			'task', t.id, t.project_id, m.accessible_project_name, t.title,
			left(m.content_text, 280), m.similarity,
			t.state_key::text, t.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_tasks t ON t.id = m.entity_id AND t.deleted_at IS NULL AND t.archived_at IS NULL
		WHERE m.entity_type = 'task'

		UNION ALL

		SELECT
			'goal', g.id, g.project_id, m.accessible_project_name, g.name,
			left(m.content_text, 280), m.similarity,
			g.state_key::text, g.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_goals g ON g.id = m.entity_id AND g.deleted_at IS NULL AND g.archived_at IS NULL
		WHERE m.entity_type = 'goal'

		UNION ALL

		SELECT
			'plan', pl.id, pl.project_id, m.accessible_project_name, pl.name,
			left(m.content_text, 280), m.similarity,
			pl.state_key::text, pl.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_plans pl ON pl.id = m.entity_id AND pl.deleted_at IS NULL AND pl.archived_at IS NULL
		WHERE m.entity_type = 'plan'

		UNION ALL

		SELECT
			'milestone', ms.id, ms.project_id, m.accessible_project_name, ms.title,
			left(m.content_text, 280), m.similarity,
			ms.state_key::text, ms.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_milestones ms ON ms.id = m.entity_id AND ms.deleted_at IS NULL AND ms.archived_at IS NULL
		WHERE m.entity_type = 'milestone'

		UNION ALL

		SELECT
			'document', d.id, d.project_id, m.accessible_project_name, d.title,
			left(m.content_text, 280), m.similarity,
			d.state_key::text, d.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_documents d ON d.id = m.entity_id AND d.deleted_at IS NULL AND d.archived_at IS NULL
			AND COALESCE(d.state_key::text, '') <> 'archived'
		WHERE m.entity_type = 'document'

		UNION ALL

		SELECT
			'risk', rk.id, rk.project_id, m.accessible_project_name, rk.title,
			left(m.content_text, 280), m.similarity,
			rk.state_key::text, rk.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_risks rk ON rk.id = m.entity_id AND rk.deleted_at IS NULL AND rk.archived_at IS NULL
		WHERE m.entity_type = 'risk'

		UNION ALL

		SELECT
			'requirement', r.id, r.project_id, m.accessible_project_name, r."text",
			left(m.content_text, 280), m.similarity,
			NULL::text, r.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_requirements r ON r.id = m.entity_id AND r.deleted_at IS NULL
		WHERE m.entity_type = 'requirement'

		UNION ALL

		SELECT
			'event', ev.id, ev.project_id, m.accessible_project_name, ev.title,
			left(m.content_text, 280), m.similarity,
			ev.state_key::text, ev.type_key::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_events ev ON ev.id = m.entity_id AND ev.deleted_at IS NULL
			AND NOT EXISTS (
			  SELECT 1 FROM onto_tasks owner_task
			  WHERE ev.owner_entity_type = 'task'
			    AND owner_task.id = ev.owner_entity_id
			    AND (owner_task.deleted_at IS NOT NULL OR owner_task.archived_at IS NOT NULL)
			)
		WHERE m.entity_type = 'event'

		UNION ALL

		SELECT
			'image', a.id, a.project_id, m.accessible_project_name,
			coalesce(a.caption, a.alt_text, a.original_filename, 'Image'),
			left(m.content_text, 280), m.similarity,
			a.ocr_status::text, a.kind::text, m.chunk_anchor
		FROM matches m
		JOIN public.onto_assets a ON a.id = m.entity_id AND a.deleted_at IS NULL
		WHERE m.entity_type = 'image'
	) AS results
	ORDER BY results.score DESC, results.title ASC NULLS LAST
	LIMIT v_limit;
END;
$function$;

COMMIT;
