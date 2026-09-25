-- supabase/tests/project_write_lock_first.check.sql
-- Assertions for 20260925020000 + 20260925020100 (Tasker 105): every function that takes the
-- project row lock takes it before its first write. Run with:
--   pnpm db:rehearse supabase/migrations/20260925020000_project_write_lock_first.sql \
--     supabase/migrations/20260925020100_edge_link_atomic.sql \
--     --role-probe --check supabase/tests/project_write_lock_first.check.sql
-- Behaviour under concurrency is measured by scripts/migration-rehearsal/concurrent-write-probe.mjs.
DO $$
DECLARE
  f text;
  v_violations text;
BEGIN
  -- Callable by signed-in users and the server (the web's invoker RPCs call it), not by anon.
  f := 'public.onto_lock_project_for_write(uuid)';
  ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'anon can execute ' || f;
  ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated cannot execute ' || f;
  ASSERT has_function_privilege('service_role', f, 'EXECUTE'), 'service_role cannot execute ' || f;
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure), f || ' must stay SECURITY INVOKER';

  -- 20260925020100: the gateway's link write is server only.
  f := 'public.onto_edge_link_atomic(uuid, text, uuid, text, text, uuid, jsonb)';
  ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'anon can execute ' || f;
  ASSERT NOT has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated can execute ' || f;
  ASSERT has_function_privilege('service_role', f, 'EXECUTE'), 'service_role cannot execute ' || f;

  -- Static lock order. A function "takes the project lock" when it locks onto_projects
  -- (FOR UPDATE, an UPDATE of the row, the helper) or calls something that does (the
  -- relationship-plan appliers, the document-structure command). Its first project lock must
  -- come no later than its first write: an insert, an update or delete of another table, or a
  -- call to the task create/update commands. Comments are stripped before matching.
  WITH bodies AS (
    SELECT p.oid::regprocedure::text AS fn,
           regexp_replace(lower(p.prosrc), '--[^\n]*', '', 'g') AS src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'onto') AND p.prolang <> 13 -- skip C functions
  ),
  positions AS (
    SELECT fn,
      nullif(least(
        coalesce(nullif(regexp_instr(src, 'onto_lock_project_for_write\s*\('), 0), 2147483647),
        coalesce(nullif(regexp_instr(src, 'from\s+(public\.)?onto_projects\M[^;]*\mfor\s+update\M'), 0), 2147483647),
        coalesce(nullif(regexp_instr(src, '\mupdate\s+(public\.)?onto_projects\M'), 0), 2147483647),
        coalesce(nullif(regexp_instr(src, 'onto_apply_(task_update_)?relationship_plan_atomic\s*\('), 0), 2147483647),
        coalesce(nullif(regexp_instr(src, 'onto_project_doc_structure_update_atomic\s*\('), 0), 2147483647)
      ), 2147483647) AS first_lock,
      nullif(least(
        coalesce(nullif(regexp_instr(src, '\minsert\s+into\M'), 0), 2147483647),
        coalesce(nullif(regexp_instr(src, '\mdelete\s+from\M'), 0), 2147483647),
        coalesce(nullif(regexp_instr(src, '\mupdate\s+[a-z0-9_."]+(\s+(as\s+)?[a-z0-9_]+)?\s+set\M'), 0), 2147483647),
        coalesce(nullif(regexp_instr(src, 'onto_task_(create|update)_atomic\s*\('), 0), 2147483647)
      ), 2147483647) AS first_write
    FROM bodies
  )
  SELECT string_agg(fn, E'\n  ' ORDER BY fn) INTO v_violations
  FROM positions
  WHERE first_lock IS NOT NULL AND first_write IS NOT NULL AND first_write < first_lock;

  ASSERT v_violations IS NULL,
    E'these functions write before taking the project lock (call public.onto_lock_project_for_write first):\n  '
      || v_violations;
END $$;
