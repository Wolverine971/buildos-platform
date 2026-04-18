-- supabase/migrations/20260430000008_get_project_skeleton_with_access.sql
-- New RPC: get_project_skeleton_with_access()
--
-- Consolidates the project-page SSR hot path into a single round-trip. The page
-- previously made up to 5 serial trips (ensure_actor, skeleton, write-access,
-- admin-access, ownership, optional membership). This RPC folds all of those
-- into one call:
--
--   1. Ensures an actor row for the authenticated user (idempotent).
--   2. Gates the response via current_actor_has_project_access(..., 'read'),
--      which handles public-project access for anonymous callers.
--   3. Returns the skeleton payload (matching get_project_skeleton) plus an
--      access object { can_edit, can_admin, can_invite, can_view_logs,
--      is_owner, is_authenticated, current_actor_id }.
--
-- Returns NULL if the project does not exist or the caller lacks read access.

CREATE OR REPLACE FUNCTION get_project_skeleton_with_access(
	p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id uuid;
	v_actor_id uuid;
	v_skeleton jsonb;
	v_can_edit boolean := false;
	v_can_admin boolean := false;
	v_is_owner boolean := false;
	v_is_member boolean := false;
BEGIN
	v_user_id := auth.uid();

	-- Ensure an actor row exists for authenticated users (idempotent).
	IF v_user_id IS NOT NULL THEN
		v_actor_id := ensure_actor_for_user(v_user_id);
	END IF;

	-- Read gate: returns true for admins, owners, members, and public projects.
	IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
		RETURN NULL;
	END IF;

	SELECT jsonb_build_object(
		'id', p.id,
		'name', p.name,
		'description', p.description,
		'icon_svg', p.icon_svg,
		'icon_concept', p.icon_concept,
		'icon_generated_at', p.icon_generated_at,
		'icon_generation_source', p.icon_generation_source,
		'icon_generation_prompt', p.icon_generation_prompt,
		'state_key', p.state_key,
		'type_key', p.type_key,
		'next_step_short', p.next_step_short,
		'next_step_long', p.next_step_long,
		'next_step_source', p.next_step_source,
		'next_step_updated_at', p.next_step_updated_at,
		'created_at', p.created_at,
		'updated_at', p.updated_at,
		'task_count', (
			SELECT count(*) FROM onto_tasks WHERE project_id = p.id AND deleted_at IS NULL
		),
		'document_count', (
			SELECT count(*) FROM onto_documents WHERE project_id = p.id AND deleted_at IS NULL
		),
		'goal_count', (
			SELECT count(*) FROM onto_goals WHERE project_id = p.id AND deleted_at IS NULL
		),
		'plan_count', (
			SELECT count(*) FROM onto_plans WHERE project_id = p.id AND deleted_at IS NULL
		),
		'milestone_count', (
			SELECT count(*) FROM onto_milestones WHERE project_id = p.id AND deleted_at IS NULL
		),
		'risk_count', (
			SELECT count(*) FROM onto_risks WHERE project_id = p.id AND deleted_at IS NULL
		),
		'image_count', (
			SELECT count(*) FROM onto_assets WHERE project_id = p.id AND deleted_at IS NULL
		)
	)
	INTO v_skeleton
	FROM onto_projects p
	WHERE p.id = p_project_id
		AND p.deleted_at IS NULL;

	IF v_skeleton IS NULL THEN
		RETURN NULL;
	END IF;

	-- Access flags only matter for authenticated callers.
	IF v_actor_id IS NOT NULL THEN
		v_can_edit := current_actor_has_project_access(p_project_id, 'write');
		v_can_admin := current_actor_has_project_access(p_project_id, 'admin');

		SELECT EXISTS (
			SELECT 1 FROM onto_projects op
			WHERE op.id = p_project_id
				AND op.created_by = v_actor_id
				AND op.deleted_at IS NULL
		) INTO v_is_owner;

		-- Admins implicitly see logs; skip the membership lookup.
		IF NOT v_can_admin THEN
			SELECT EXISTS (
				SELECT 1 FROM onto_project_members m
				WHERE m.project_id = p_project_id
					AND m.actor_id = v_actor_id
					AND m.removed_at IS NULL
			) INTO v_is_member;
		END IF;
	END IF;

	RETURN v_skeleton || jsonb_build_object(
		'access', jsonb_build_object(
			'can_edit', v_can_edit,
			'can_admin', v_can_admin,
			'can_invite', v_can_edit,
			'can_view_logs', v_can_admin OR v_is_member,
			'is_owner', v_is_owner,
			'is_authenticated', v_user_id IS NOT NULL,
			'current_actor_id', v_actor_id
		)
	);
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_skeleton_with_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_skeleton_with_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_project_skeleton_with_access(uuid) TO anon;

COMMENT ON FUNCTION get_project_skeleton_with_access(uuid) IS
	'Returns project skeleton data plus an access bundle in a single round-trip. '
	'Ensures the caller''s actor row exists (idempotent). Returns NULL if the '
	'project does not exist or the caller lacks read access.';
