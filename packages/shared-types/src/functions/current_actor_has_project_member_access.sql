-- packages/shared-types/src/functions/current_actor_has_project_member_access.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.current_actor_has_project_member_access(p_project_id uuid, p_required_access text DEFAULT 'read'::text)
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

	RETURN actor_has_project_member_access(v_actor_id, p_project_id, p_required_access);
END;
$function$
