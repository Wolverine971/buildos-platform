-- packages/shared-types/src/functions/current_actor_id.sql
-- current_actor_id()
-- Get current actor ID for authenticated user
-- Source: supabase/migrations/20251220_ontology_rls_policies.sql

CREATE OR REPLACE FUNCTION current_actor_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM onto_actors
  WHERE user_id = auth.uid();
$$;
