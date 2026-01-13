-- packages/shared-types/src/functions/is_admin.sql
-- is_admin()
-- Check if user is admin
-- Source: supabase/migrations/20251220_ontology_rls_policies.sql

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM users WHERE id = auth.uid()),
    false
  );
$$;
