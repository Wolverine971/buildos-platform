-- packages/shared-types/src/functions/current_actor_has_project_access.sql
-- current_actor_has_project_access(uuid, text)
-- Check if current actor has access to project
-- Source: supabase/migrations/20260320000002_project_sharing_access_fixes.sql

CREATE OR REPLACE FUNCTION current_actor_has_project_access(
  p_project_id uuid,
  p_required_access text DEFAULT 'read'
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

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF p_required_access = 'read' THEN
    IF EXISTS (
      SELECT 1 FROM onto_projects p
      WHERE p.id = p_project_id
        AND p.deleted_at IS NULL
        AND p.is_public = true
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF is_admin() THEN
    RETURN true;
  END IF;

  v_actor_id := current_actor_id();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  -- Owner always has access.
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
      AND (
        (p_required_access = 'read'  AND m.access IN ('read', 'write', 'admin')) OR
        (p_required_access = 'write' AND m.access IN ('write', 'admin')) OR
        (p_required_access = 'admin' AND m.access = 'admin')
      )
  );
END;
$$;
