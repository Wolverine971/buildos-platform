-- supabase/tests/20260923000000_guard_user_privileged_columns.production_verify.sql
-- Read-only structural verification. Safe for the hosted project after migration.
DO $verify$
DECLARE
 trigger_names TEXT[];
BEGIN
 IF NOT EXISTS (
  SELECT 1
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
   AND c.relname = 'users'
   AND t.tgname = 'aa_guard_user_privileged_columns'
   AND t.tgenabled <> 'D'
   AND t.tgfoid = 'public.guard_user_privileged_columns()'::regprocedure
 ) THEN
  RAISE EXCEPTION 'aa_guard_user_privileged_columns is missing or disabled on public.users';
 END IF;

 -- The guard must fire before the trial trigger so self-created rows get the default trial.
 SELECT array_agg(t.tgname::TEXT ORDER BY t.tgname)
 INTO trigger_names
 FROM pg_trigger t
 JOIN pg_class c ON c.oid = t.tgrelid
 JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
  AND c.relname = 'users'
  AND NOT t.tgisinternal
  AND t.tgname IN ('aa_guard_user_privileged_columns', 'before_user_insert_set_trial');
 IF trigger_names IS DISTINCT FROM ARRAY['aa_guard_user_privileged_columns', 'before_user_insert_set_trial']::TEXT[] THEN
  RAISE EXCEPTION 'unexpected users trigger order: %', trigger_names;
 END IF;

 -- SECURITY DEFINER would make current_user the owner and silently disable the guard.
 IF EXISTS (
  SELECT 1 FROM pg_proc
  WHERE oid = 'public.guard_user_privileged_columns()'::regprocedure
   AND prosecdef
 ) THEN
  RAISE EXCEPTION 'guard_user_privileged_columns must be SECURITY INVOKER';
 END IF;
END
$verify$;
