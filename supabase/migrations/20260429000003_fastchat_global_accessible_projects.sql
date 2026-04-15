-- supabase/migrations/20260429000003_fastchat_global_accessible_projects.sql
-- Make FastChat global context bundles use the same accessible project scope as project intelligence.

DO $$
DECLARE
  v_function_sql text;
  v_updated_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.load_fastchat_context(text, uuid, uuid, text, uuid)'::regprocedure
  )
  INTO v_function_sql;

  IF v_function_sql IS NULL THEN
    RAISE EXCEPTION 'Function public.load_fastchat_context(text, uuid, uuid, text, uuid) not found';
  END IF;

  v_updated_sql := v_function_sql;

  IF position('v_actor_id uuid;' in v_updated_sql) = 0 THEN
    v_updated_sql := replace(
      v_updated_sql,
      '  v_user_id uuid;',
      '  v_user_id uuid;
  v_actor_id uuid;'
    );
  END IF;

  IF position('v_actor_id := ensure_actor_for_user(v_user_id)' in v_updated_sql) = 0 THEN
    v_updated_sql := replace(
      v_updated_sql,
      '  IF auth.role() <> ''service_role'' THEN
    v_user_id := auth.uid();
  END IF;',
      '  IF auth.role() <> ''service_role'' THEN
    v_user_id := auth.uid();
  END IF;
  IF v_user_id IS NOT NULL THEN
    IF auth.role() = ''service_role'' THEN
      v_actor_id := ensure_actor_for_user(v_user_id);
    ELSE
      v_actor_id := current_actor_id();
    END IF;
  END IF;'
    );
  END IF;

  v_updated_sql := replace(
    v_updated_sql,
    '      SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at
      FROM onto_projects
      WHERE deleted_at IS NULL
        AND created_by = v_user_id
      ORDER BY updated_at DESC',
    '      SELECT
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
      ORDER BY ps.updated_at DESC'
  );

  v_updated_sql := replace(
    v_updated_sql,
    '    SELECT array_agg(id ORDER BY updated_at DESC)
    INTO v_project_ids
    FROM onto_projects
    WHERE deleted_at IS NULL
      AND created_by = v_user_id;',
    '    SELECT array_agg(id ORDER BY updated_at DESC)
    INTO v_project_ids
    FROM get_onto_project_summaries_v1(v_actor_id);'
  );

  IF v_updated_sql <> v_function_sql THEN
    EXECUTE v_updated_sql;
  END IF;
END
$$;
