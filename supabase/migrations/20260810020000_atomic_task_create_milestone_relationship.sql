-- Route task creation through the task-scoped relationship applier introduced
-- in 20260810010000 so a create plan can atomically include targets_milestone.

CREATE OR REPLACE FUNCTION public.onto_task_create_with_relationships_atomic(
	p_task jsonb,
	p_relationship_plan jsonb,
	p_sync_assignees boolean DEFAULT false,
	p_assignee_actor_ids uuid[] DEFAULT NULL,
	p_assigned_by_actor_id uuid DEFAULT NULL,
	p_source text DEFAULT 'manual',
	p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
	v_result jsonb;
	v_task_id uuid;
	v_project_id uuid;
	v_relationship_child_id uuid;
	v_relationship_result jsonb;
BEGIN
	IF p_relationship_plan IS NULL
		OR jsonb_typeof(p_relationship_plan) <> 'object'
		OR p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'task' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_create_relationship_plan_mismatch';
	END IF;

	v_result := public.onto_task_create_atomic(
		p_task,
		p_sync_assignees,
		p_assignee_actor_ids,
		p_assigned_by_actor_id,
		p_source,
		p_idempotency_key
	);

	-- Replays return the original fully committed task/relationship command.
	-- The stable idempotency key is fenced by the worker effect argument hash.
	IF coalesce((v_result->>'idempotent_replay')::boolean, false) THEN
		RETURN v_result || jsonb_build_object('relationships', NULL);
	END IF;

	BEGIN
		v_task_id := nullif(v_result->'task'->>'id', '')::uuid;
		v_project_id := nullif(v_result->'task'->>'project_id', '')::uuid;
		v_relationship_child_id :=
			nullif(p_relationship_plan->'entityContainment'->'child'->>'id', '')::uuid;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_create_relationship_plan_mismatch';
	END;

	IF v_task_id IS NULL
		OR v_project_id IS NULL
		OR v_relationship_child_id IS DISTINCT FROM v_task_id THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_create_relationship_plan_mismatch';
	END IF;

	v_relationship_result := public.onto_apply_task_update_relationship_plan_atomic(
		v_project_id,
		v_task_id,
		p_relationship_plan
	);

	RETURN v_result || jsonb_build_object('relationships', v_relationship_result);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_task_create_with_relationships_atomic(jsonb, jsonb, boolean, uuid[], uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_task_create_with_relationships_atomic(jsonb, jsonb, boolean, uuid[], uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_task_create_with_relationships_atomic(jsonb, jsonb, boolean, uuid[], uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_task_create_with_relationships_atomic(jsonb, jsonb, boolean, uuid[], uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.onto_task_create_with_relationships_atomic(jsonb, jsonb, boolean, uuid[], uuid, text, text) IS
	'Atomically creates one idempotent task, syncs assignees, and applies its task-scoped relationship plan including targets_milestone.';
