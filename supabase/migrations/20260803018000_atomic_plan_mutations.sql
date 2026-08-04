-- supabase/migrations/20260803018000_atomic_plan_mutations.sql
-- Create or update a plan in the same transaction as its normalized
-- relationship mutation plan. Planning remains in shared TypeScript so HTTP,
-- agentic, and batch callers retain one relationship policy.

CREATE OR REPLACE FUNCTION public.onto_plan_create_atomic(
	p_plan jsonb,
	p_relationship_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
	v_plan_id uuid;
	v_project_id uuid;
	v_created_by uuid;
	v_state_key public.plan_state;
	v_plan public.onto_plans;
	v_relationship_result jsonb;
BEGIN
	IF p_plan IS NULL
		OR jsonb_typeof(p_plan) <> 'object'
		OR p_relationship_plan IS NULL
		OR jsonb_typeof(p_relationship_plan) <> 'object'
		OR jsonb_typeof(coalesce(p_plan->'props', '{}'::jsonb)) <> 'object'
		OR nullif(btrim(p_plan->>'name'), '') IS NULL
		OR nullif(btrim(p_plan->>'type_key'), '') IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_create_invalid_arguments';
	END IF;

	BEGIN
		v_plan_id := nullif(p_plan->>'id', '')::uuid;
		v_project_id := nullif(p_plan->>'project_id', '')::uuid;
		v_created_by := nullif(p_plan->>'created_by', '')::uuid;
		v_state_key := coalesce(nullif(p_plan->>'state_key', ''), 'draft')::public.plan_state;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_create_invalid_arguments';
	END;

	IF v_plan_id IS NULL OR v_project_id IS NULL OR v_created_by IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_create_invalid_arguments';
	END IF;

	IF p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'plan' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_create_relationship_plan_mismatch';
	END IF;
	BEGIN
		IF nullif(p_relationship_plan->'entityContainment'->'child'->>'id', '')::uuid
			IS DISTINCT FROM v_plan_id THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_create_relationship_plan_mismatch';
		END IF;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_create_relationship_plan_mismatch';
	END;

	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(v_project_id, 'write') THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'plan_create_access_denied';
	END IF;

	INSERT INTO public.onto_plans (
		id,
		project_id,
		name,
		type_key,
		state_key,
		plan,
		description,
		created_by,
		props
	)
	VALUES (
		v_plan_id,
		v_project_id,
		p_plan->>'name',
		p_plan->>'type_key',
		v_state_key,
		p_plan->>'plan',
		p_plan->>'description',
		v_created_by,
		coalesce(p_plan->'props', '{}'::jsonb)
	)
	RETURNING * INTO v_plan;

	v_relationship_result := public.onto_apply_relationship_plan_atomic(
		v_project_id,
		p_relationship_plan
	);

	RETURN jsonb_build_object(
		'plan', to_jsonb(v_plan),
		'relationships', v_relationship_result
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_plan_create_atomic(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_plan_create_atomic(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_plan_create_atomic(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_plan_create_atomic(jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.onto_plan_create_atomic(jsonb, jsonb) IS
	'Atomically creates one plan and applies its normalized relationship mutation plan.';

CREATE OR REPLACE FUNCTION public.onto_plan_update_atomic(
	p_plan_id uuid,
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
	v_state_key public.plan_state;
	v_plan public.onto_plans;
	v_relationship_result jsonb := NULL;
BEGIN
	IF p_plan_id IS NULL
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
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_update_invalid_arguments';
	END IF;

	IF p_updates ? 'state_key' THEN
		BEGIN
			v_state_key := nullif(p_updates->>'state_key', '')::public.plan_state;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_update_invalid_state';
		END;
		IF v_state_key IS NULL THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_update_invalid_state';
		END IF;
	END IF;

	SELECT plan.project_id
	INTO v_project_id
	FROM public.onto_plans AS plan
	WHERE plan.id = p_plan_id
		AND plan.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'plan_update_not_found';
	END IF;

	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(v_project_id, 'write') THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'plan_update_access_denied';
	END IF;

	IF p_relationship_plan IS NOT NULL
		AND p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'plan' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_update_relationship_plan_mismatch';
	END IF;
	IF p_relationship_plan IS NOT NULL THEN
		BEGIN
			IF nullif(p_relationship_plan->'entityContainment'->'child'->>'id', '')::uuid
				IS DISTINCT FROM p_plan_id THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_update_relationship_plan_mismatch';
			END IF;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'plan_update_relationship_plan_mismatch';
		END;
	END IF;

	UPDATE public.onto_plans AS plan
	SET name = CASE WHEN p_updates ? 'name' THEN p_updates->>'name' ELSE plan.name END,
		type_key = CASE
			WHEN p_updates ? 'type_key' THEN p_updates->>'type_key'
			ELSE plan.type_key
		END,
		state_key = CASE
			WHEN p_updates ? 'state_key' THEN v_state_key
			ELSE plan.state_key
		END,
		plan = CASE WHEN p_updates ? 'plan' THEN p_updates->>'plan' ELSE plan.plan END,
		description = CASE
			WHEN p_updates ? 'description' THEN p_updates->>'description'
			ELSE plan.description
		END,
		props = CASE WHEN p_updates ? 'props' THEN p_updates->'props' ELSE plan.props END,
		updated_at = now()
	WHERE plan.id = p_plan_id
		AND plan.project_id = v_project_id
		AND plan.deleted_at IS NULL
	RETURNING * INTO v_plan;

	IF v_plan.id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'plan_update_conflict';
	END IF;

	IF p_relationship_plan IS NOT NULL THEN
		v_relationship_result := public.onto_apply_relationship_plan_atomic(
			v_project_id,
			p_relationship_plan
		);
	END IF;

	RETURN jsonb_build_object(
		'plan', to_jsonb(v_plan),
		'relationships', v_relationship_result
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_plan_update_atomic(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_plan_update_atomic(uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_plan_update_atomic(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_plan_update_atomic(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.onto_plan_update_atomic(uuid, jsonb, jsonb) IS
	'Atomically updates one plan and optionally applies a normalized relationship mutation plan.';
