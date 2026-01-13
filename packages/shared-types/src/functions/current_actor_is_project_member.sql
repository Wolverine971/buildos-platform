-- packages/shared-types/src/functions/current_actor_is_project_member.sql
-- current_actor_is_project_member(uuid)
-- Check if current actor is project member
-- Source: supabase/migrations/20260320000002_project_sharing_access_fixes.sql

CREATE OR REPLACE FUNCTION current_actor_is_project_member(
  p_project_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN false;
  END IF;

  IF is_admin() THEN
    RETURN true;
  END IF;

  v_actor_id := current_actor_id();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM onto_projects p
    WHERE p.id = p_project_id AND p.created_by = v_actor_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM onto_project_members m
    WHERE m.project_id = p_project_id
      AND m.actor_id = v_actor_id
      AND m.removed_at IS NULL
  );
END;
$$;
