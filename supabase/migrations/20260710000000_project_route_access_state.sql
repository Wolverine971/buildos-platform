-- supabase/migrations/20260710000000_project_route_access_state.sql
-- Give internal project/document routes enough information to distinguish a
-- missing project from a signed-in user who opened the link with the wrong
-- account. No project metadata is returned for denied callers.

CREATE OR REPLACE FUNCTION public.get_project_route_access_state(
	p_project_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM public.onto_projects p
		WHERE p.id = p_project_id
			AND p.deleted_at IS NULL
	) THEN
		RETURN 'not_found';
	END IF;

	IF auth.uid() IS NULL THEN
		RETURN 'unauthenticated';
	END IF;

	PERFORM public.ensure_actor_for_user(auth.uid());

	IF public.current_actor_has_project_member_access(p_project_id, 'read') THEN
		RETURN 'allowed';
	END IF;

	RETURN 'forbidden';
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_route_access_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_route_access_state(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_project_route_access_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_route_access_state(uuid) TO service_role;

COMMENT ON FUNCTION public.get_project_route_access_state(uuid) IS
	'Returns allowed, forbidden, not_found, or unauthenticated for internal project routes without exposing project metadata.';

-- Keep the project v2 hot path at one client/server round trip while returning
-- a sentinel payload for access failures that the page can render as 401/403.
CREATE OR REPLACE FUNCTION public.get_project_skeleton_with_access_v2(
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
		'updated_at', p.updated_at
	)
	INTO v_skeleton
	FROM public.onto_projects p
	WHERE p.id = p_project_id
		AND p.deleted_at IS NULL;

	IF v_skeleton IS NULL THEN
		RETURN jsonb_build_object('route_access_state', 'not_found');
	END IF;
	IF v_user_id IS NULL THEN
		RETURN jsonb_build_object('route_access_state', 'unauthenticated');
	END IF;

	v_actor_id := public.ensure_actor_for_user(v_user_id);

	IF NOT public.current_actor_has_project_member_access(p_project_id, 'read') THEN
		RETURN jsonb_build_object('route_access_state', 'forbidden');
	END IF;

	v_can_edit := public.current_actor_has_project_member_access(p_project_id, 'write');
	v_can_admin := public.current_actor_has_project_member_access(p_project_id, 'admin');

	SELECT EXISTS (
		SELECT 1
		FROM public.onto_projects op
		WHERE op.id = p_project_id
			AND op.created_by = v_actor_id
			AND op.deleted_at IS NULL
	) INTO v_is_owner;

	IF NOT v_can_admin THEN
		SELECT EXISTS (
			SELECT 1
			FROM public.onto_project_members m
			WHERE m.project_id = p_project_id
				AND m.actor_id = v_actor_id
				AND m.removed_at IS NULL
		) INTO v_is_member;
	END IF;

	RETURN v_skeleton || jsonb_build_object(
		'route_access_state', 'allowed',
		'access', jsonb_build_object(
			'can_edit', v_can_edit,
			'can_admin', v_can_admin,
			'can_invite', v_can_edit,
			'can_view_logs', v_can_admin OR v_is_member,
			'is_owner', v_is_owner,
			'is_authenticated', true,
			'current_actor_id', v_actor_id
		)
	);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_skeleton_with_access_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_skeleton_with_access_v2(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_project_skeleton_with_access_v2(uuid) TO anon;

COMMENT ON FUNCTION public.get_project_skeleton_with_access_v2(uuid) IS
	'Returns a count-free project skeleton for internal project members. Returns a route_access_state sentinel without project metadata for forbidden, unauthenticated, or missing projects.';
