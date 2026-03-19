-- supabase/migrations/20260428000010_fix_fastchat_context_enum_state_casts.sql
-- Avoid enum coercion errors in load_fastchat_context when state_key columns are enum-typed.
DO $$
DECLARE
  v_function_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.load_fastchat_context(text, uuid, uuid, text, uuid)'::regprocedure
  )
  INTO v_function_sql;

  IF v_function_sql IS NULL THEN
    RAISE EXCEPTION 'Function public.load_fastchat_context(text, uuid, uuid, text, uuid) not found';
  END IF;

  v_function_sql := replace(
    v_function_sql,
    'COALESCE(state_key, '''')',
    'COALESCE(state_key::text, '''')'
  );
  v_function_sql := replace(
    v_function_sql,
    'COALESCE(g.state_key, '''')',
    'COALESCE(g.state_key::text, '''')'
  );
  v_function_sql := replace(
    v_function_sql,
    'COALESCE(m.state_key, '''')',
    'COALESCE(m.state_key::text, '''')'
  );
  v_function_sql := replace(
    v_function_sql,
    'COALESCE(pl.state_key, '''')',
    'COALESCE(pl.state_key::text, '''')'
  );
  v_function_sql := replace(
    v_function_sql,
    'COALESCE(t.state_key, '''')',
    'COALESCE(t.state_key::text, '''')'
  );

  EXECUTE v_function_sql;
END
$$;
