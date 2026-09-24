-- scripts/supabase-health/sql/functions.sql
SELECT n.nspname AS schema, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
 p.prosecdef AS security_definer, p.proconfig AS settings,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 position('FOR UPDATE' in upper(pg_get_functiondef(p.oid)))>0 AS for_update,
 position('FOR NO KEY UPDATE' in upper(pg_get_functiondef(p.oid)))>0 AS for_no_key_update
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','libri') AND p.prokind='f';
