-- supabase/migrations/20260514000500_add_project_member_access_helper.sql
-- Internal project access helper.
--
-- current_actor_has_project_access('read') intentionally allows public project reads.
-- Internal collaboration APIs should use this helper instead so project public
-- visibility does not expose collaborator-only data.

CREATE OR REPLACE FUNCTION public.actor_has_project_member_access(
	p_actor_id uuid,
	p_project_id uuid,
	p_required_access text DEFAULT 'read'::text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
	SELECT
		p_actor_id IS NOT NULL
		AND p_project_id IS NOT NULL
		AND (
			EXISTS (
				SELECT 1
				FROM onto_projects p
				WHERE p.id = p_project_id
					AND p.deleted_at IS NULL
					AND p.created_by = p_actor_id
			)
			OR EXISTS (
				SELECT 1
				FROM onto_project_members m
				JOIN onto_projects p ON p.id = m.project_id
				WHERE m.project_id = p_project_id
					AND p.deleted_at IS NULL
					AND m.actor_id = p_actor_id
					AND m.removed_at IS NULL
					AND (
						(p_required_access = 'read' AND m.access IN ('read', 'write', 'admin')) OR
						(p_required_access = 'write' AND m.access IN ('write', 'admin')) OR
						(p_required_access = 'admin' AND m.access = 'admin')
					)
			)
		)
$function$;

CREATE OR REPLACE FUNCTION public.current_actor_has_project_member_access(
	p_project_id uuid,
	p_required_access text DEFAULT 'read'::text
)
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
$function$;

REVOKE ALL ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_actor_has_project_member_access(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_actor_has_project_member_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_actor_has_project_member_access(uuid, text) TO service_role;

COMMENT ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) IS
	'Checks whether a specific ontology actor has owner/member project access without public-read or service-role shortcuts.';

COMMENT ON FUNCTION public.current_actor_has_project_member_access(uuid, text) IS
	'Checks owner/member/admin project access for the current authenticated actor without the public-project read shortcut.';
