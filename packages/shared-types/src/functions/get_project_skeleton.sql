-- packages/shared-types/src/functions/get_project_skeleton.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.get_project_skeleton(p_project_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
	v_user_id uuid;
BEGIN
	v_user_id := auth.uid();
	IF auth.role() = 'service_role' THEN
		IF NOT public.actor_has_project_member_access(p_actor_id, p_project_id, 'read') THEN
			RETURN NULL;
		END IF;
	ELSIF v_user_id IS NOT NULL THEN
		PERFORM public.ensure_actor_for_user(v_user_id);

		IF NOT public.current_actor_has_project_member_access(p_project_id, 'read') THEN
			RETURN NULL;
		END IF;
	ELSE
		RETURN NULL;
	END IF;

	RETURN public.get_project_skeleton_legacy_public_20260514(p_project_id, p_actor_id);
END;
$function$
