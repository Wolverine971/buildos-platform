-- packages/shared-types/src/functions/build_fastchat_project_intelligence.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.build_fastchat_project_intelligence(
  p_context_type text,
  p_user_id uuid,
  p_project_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
