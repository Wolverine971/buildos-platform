-- supabase/migrations/20260429000004_fastchat_actionable_project_intelligence.sql
-- Keep FastChat prewarm intelligence focused on actionable near-term work.

DO $$
DECLARE
  v_function_sql text;
  v_updated_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.build_fastchat_project_intelligence(text, uuid, uuid)'::regprocedure
  )
  INTO v_function_sql;

  IF v_function_sql IS NULL THEN
    RAISE EXCEPTION 'Function public.build_fastchat_project_intelligence(text, uuid, uuid) not found';
  END IF;

  v_updated_sql := v_function_sql;

  IF position('WHEN wc.kind = ''event'' THEN NULL' in v_updated_sql) = 0 THEN
    v_updated_sql := replace(
      v_updated_sql,
      '          WHEN wc.kind = ''event'' AND wc.date_at >= v_now AND wc.date_at <= (v_now + make_interval(days => v_upcoming_days)) THEN ''upcoming''
          WHEN wc.kind = ''task'' AND wc.date_kind = ''start_at'' AND wc.date_at < v_now THEN NULL',
      '          WHEN wc.kind = ''event'' AND wc.date_at >= v_now AND wc.date_at <= (v_now + make_interval(days => v_upcoming_days)) THEN ''upcoming''
          WHEN wc.kind = ''event'' THEN NULL
          WHEN wc.kind = ''task'' AND wc.date_kind = ''start_at'' AND wc.date_at < v_now THEN NULL'
    );
  END IF;

  IF position('date_at >= TIMESTAMPTZ ''2020-01-01''' in v_updated_sql) = 0 THEN
    v_updated_sql := replace(
      v_updated_sql,
      '      WHERE bucket IS NOT NULL',
      '      WHERE bucket IS NOT NULL
        AND date_at >= TIMESTAMPTZ ''2020-01-01''
        AND date_at < TIMESTAMPTZ ''2101-01-01'''
    );
  END IF;

  v_updated_sql := replace(
    v_updated_sql,
    '(psc.overdue * 4 + psc.due_soon * 3 + psc.upcoming + psc.recent_changes) AS attention_score',
    '(LEAST(psc.overdue, 5) + psc.due_soon * 6 + psc.upcoming * 2 + psc.recent_changes) AS attention_score'
  );

  v_updated_sql := replace(
    v_updated_sql,
    'SELECT COALESCE(jsonb_agg((to_jsonb(w) - ''bucket_rank'') ORDER BY w.bucket_rank, w.date, w.priority DESC NULLS LAST, w.title), ''[]''::jsonb) AS value',
    'SELECT COALESCE(jsonb_agg(
        (to_jsonb(w) - ''bucket_rank'')
        ORDER BY
          w.bucket_rank,
          CASE WHEN w.bucket = ''due_soon'' THEN w.date END ASC NULLS LAST,
          CASE WHEN w.bucket = ''overdue'' THEN w.date END DESC NULLS LAST,
          w.priority DESC NULLS LAST,
          w.updated_at DESC NULLS LAST,
          w.title
      ), ''[]''::jsonb) AS value'
  );

  v_updated_sql := replace(
    v_updated_sql,
    '          CASE bucket WHEN ''overdue'' THEN 0 ELSE 1 END AS bucket_rank',
    '          CASE bucket WHEN ''due_soon'' THEN 0 ELSE 1 END AS bucket_rank'
  );

  v_updated_sql := replace(
    v_updated_sql,
    '        ORDER BY bucket_rank, date_at ASC, priority DESC NULLS LAST, title ASC',
    '        ORDER BY
          bucket_rank,
          CASE WHEN bucket = ''due_soon'' THEN date_at END ASC NULLS LAST,
          CASE WHEN bucket = ''overdue'' THEN date_at END DESC NULLS LAST,
          priority DESC NULLS LAST,
          updated_at DESC NULLS LAST,
          title ASC'
  );

  IF position('WHEN wc.kind = ''event'' THEN NULL' in v_updated_sql) = 0 THEN
    RAISE EXCEPTION 'Failed to patch FastChat project intelligence event filtering';
  END IF;

  IF position('date_at >= TIMESTAMPTZ ''2020-01-01''' in v_updated_sql) = 0 THEN
    RAISE EXCEPTION 'Failed to patch FastChat project intelligence date bounds';
  END IF;

  IF position('LEAST(psc.overdue, 5) + psc.due_soon * 6 + psc.upcoming * 2 + psc.recent_changes' in v_updated_sql) = 0 THEN
    RAISE EXCEPTION 'Failed to patch FastChat project intelligence project scoring';
  END IF;

  IF position('CASE bucket WHEN ''due_soon'' THEN 0 ELSE 1 END AS bucket_rank' in v_updated_sql) = 0 THEN
    RAISE EXCEPTION 'Failed to patch FastChat project intelligence attention bucket ranking';
  END IF;

  IF position('CASE WHEN bucket = ''overdue'' THEN date_at END DESC NULLS LAST' in v_updated_sql) = 0 THEN
    RAISE EXCEPTION 'Failed to patch FastChat project intelligence overdue ordering';
  END IF;

  IF v_updated_sql <> v_function_sql THEN
    EXECUTE v_updated_sql;
  END IF;
END
$$;
