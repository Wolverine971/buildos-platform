-- packages/shared-types/src/functions/current_actor_is_project_member.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.current_actor_is_project_member(p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
