-- supabase/migrations/20260803016000_atomic_goal_mutations.sql
-- Create or update a goal in the same transaction as its normalized
-- relationship mutation plan. Planning remains in shared TypeScript so HTTP,
-- agentic, and batch callers retain one relationship policy.

CREATE OR REPLACE FUNCTION public.onto_goal_create_atomic(
	p_goal jsonb,
	p_relationship_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
	v_goal_id uuid;
	v_project_id uuid;
	v_created_by uuid;
	v_state_key public.goal_state;
	v_goal public.onto_goals;
	v_relationship_result jsonb;
BEGIN
	IF p_goal IS NULL
		OR jsonb_typeof(p_goal) <> 'object'
		OR p_relationship_plan IS NULL
		OR jsonb_typeof(p_relationship_plan) <> 'object'
		OR jsonb_typeof(coalesce(p_goal->'props', '{}'::jsonb)) <> 'object'
		OR nullif(btrim(p_goal->>'name'), '') IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_create_invalid_arguments';
	END IF;

	BEGIN
		v_goal_id := nullif(p_goal->>'id', '')::uuid;
		v_project_id := nullif(p_goal->>'project_id', '')::uuid;
		v_created_by := nullif(p_goal->>'created_by', '')::uuid;
		v_state_key := coalesce(nullif(p_goal->>'state_key', ''), 'draft')::public.goal_state;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_create_invalid_arguments';
	END;

	IF v_goal_id IS NULL OR v_project_id IS NULL OR v_created_by IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_create_invalid_arguments';
	END IF;

	IF p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'goal' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_create_relationship_plan_mismatch';
	END IF;
	BEGIN
		IF nullif(p_relationship_plan->'entityContainment'->'child'->>'id', '')::uuid
			IS DISTINCT FROM v_goal_id THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_create_relationship_plan_mismatch';
		END IF;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_create_relationship_plan_mismatch';
	END;

	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(v_project_id, 'write') THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'goal_create_access_denied';
	END IF;

	INSERT INTO public.onto_goals (
		id,
		project_id,
		name,
		type_key,
		props,
		created_by,
		goal,
		description,
		target_date,
		state_key,
		completed_at
	)
	VALUES (
		v_goal_id,
		v_project_id,
		p_goal->>'name',
		p_goal->>'type_key',
		coalesce(p_goal->'props', '{}'::jsonb),
		v_created_by,
		p_goal->>'goal',
		p_goal->>'description',
		nullif(p_goal->>'target_date', '')::timestamptz,
		v_state_key,
		nullif(p_goal->>'completed_at', '')::timestamptz
	)
	RETURNING * INTO v_goal;

	v_relationship_result := public.onto_apply_relationship_plan_atomic(
		v_project_id,
		p_relationship_plan
	);

	RETURN jsonb_build_object(
		'goal', to_jsonb(v_goal),
		'relationships', v_relationship_result
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_goal_create_atomic(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_goal_create_atomic(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_goal_create_atomic(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_goal_create_atomic(jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.onto_goal_create_atomic(jsonb, jsonb) IS
	'Atomically creates one goal and applies its normalized relationship mutation plan.';

CREATE OR REPLACE FUNCTION public.onto_goal_update_atomic(
	p_goal_id uuid,
	p_updates jsonb,
	p_relationship_plan jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
	v_project_id uuid;
	v_state_key public.goal_state;
	v_goal public.onto_goals;
	v_relationship_result jsonb := NULL;
BEGIN
	IF p_goal_id IS NULL
		OR p_updates IS NULL
		OR jsonb_typeof(p_updates) <> 'object'
		OR (
			p_relationship_plan IS NOT NULL
			AND jsonb_typeof(p_relationship_plan) <> 'object'
		)
		OR (
			p_updates ? 'props'
			AND jsonb_typeof(p_updates->'props') <> 'object'
		) THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_update_invalid_arguments';
	END IF;

	IF p_updates ? 'state_key' THEN
		BEGIN
			v_state_key := nullif(p_updates->>'state_key', '')::public.goal_state;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_update_invalid_state';
		END;
		IF v_state_key IS NULL THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_update_invalid_state';
		END IF;
	END IF;

	SELECT goal.project_id
	INTO v_project_id
	FROM public.onto_goals AS goal
	WHERE goal.id = p_goal_id
		AND goal.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'goal_update_not_found';
	END IF;

	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(v_project_id, 'write') THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'goal_update_access_denied';
	END IF;

	IF p_relationship_plan IS NOT NULL
		AND p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'goal' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_update_relationship_plan_mismatch';
	END IF;
	IF p_relationship_plan IS NOT NULL THEN
		BEGIN
			IF nullif(p_relationship_plan->'entityContainment'->'child'->>'id', '')::uuid
				IS DISTINCT FROM p_goal_id THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_update_relationship_plan_mismatch';
			END IF;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'goal_update_relationship_plan_mismatch';
		END;
	END IF;

	UPDATE public.onto_goals AS goal
	SET name = CASE WHEN p_updates ? 'name' THEN p_updates->>'name' ELSE goal.name END,
		type_key = CASE WHEN p_updates ? 'type_key' THEN p_updates->>'type_key' ELSE goal.type_key END,
		goal = CASE WHEN p_updates ? 'goal' THEN p_updates->>'goal' ELSE goal.goal END,
		description = CASE
			WHEN p_updates ? 'description' THEN p_updates->>'description'
			ELSE goal.description
		END,
		target_date = CASE
			WHEN p_updates ? 'target_date'
				THEN nullif(p_updates->>'target_date', '')::timestamptz
			ELSE goal.target_date
		END,
		state_key = CASE
			WHEN p_updates ? 'state_key' THEN v_state_key
			ELSE goal.state_key
		END,
		completed_at = CASE
			WHEN p_updates ? 'completed_at'
				THEN nullif(p_updates->>'completed_at', '')::timestamptz
			ELSE goal.completed_at
		END,
		props = CASE WHEN p_updates ? 'props' THEN p_updates->'props' ELSE goal.props END,
		updated_at = now()
	WHERE goal.id = p_goal_id
		AND goal.project_id = v_project_id
		AND goal.deleted_at IS NULL
	RETURNING * INTO v_goal;

	IF v_goal.id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'goal_update_conflict';
	END IF;

	IF p_relationship_plan IS NOT NULL THEN
		v_relationship_result := public.onto_apply_relationship_plan_atomic(
			v_project_id,
			p_relationship_plan
		);
	END IF;

	RETURN jsonb_build_object(
		'goal', to_jsonb(v_goal),
		'relationships', v_relationship_result
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_goal_update_atomic(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_goal_update_atomic(uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_goal_update_atomic(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_goal_update_atomic(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.onto_goal_update_atomic(uuid, jsonb, jsonb) IS
	'Atomically updates one goal and optionally applies a normalized relationship mutation plan.';
