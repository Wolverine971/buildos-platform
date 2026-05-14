-- packages/shared-types/src/functions/actor_has_project_member_access.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.actor_has_project_member_access(p_actor_id uuid, p_project_id uuid, p_required_access text DEFAULT 'read'::text)
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
$function$
