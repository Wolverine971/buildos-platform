-- supabase/migrations/20260924193000_task_create_project_lock_first.sql
-- Tasker 101: task creates in one project take the project lock first.
--
-- A task create used to upgrade its project lock mid-transaction. Inserting
-- the task takes KEY SHARE on the project row (the foreign-key check), the
-- context-invalidation trigger then bumps the project's context version row,
-- and only afterwards does onto_apply_relationship_plan_atomic ask for
-- FOR UPDATE on the same project row. With three or more creates in flight
-- (plus their project-log inserts, which also take KEY SHARE), each waited on
-- another's shared lock: probes against the gate database held 4-5
-- concurrent creates for 12-97 s, and some were cancelled by statement
-- timeout. One or two at once finished in under a second.
--
-- Locking the project row before anything else removes the upgrade: a
-- concurrent create waits at the start holding nothing, so creates queue
-- (about 0.2 s each) instead of starving each other. The relationship
-- plan's own FOR UPDATE is then already held. The body is otherwise
-- unchanged from 20260810020000.

BEGIN;

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
	v_lock_project_id uuid;
	v_relationship_child_id uuid;
	v_relationship_result jsonb;
BEGIN
	IF p_relationship_plan IS NULL
		OR jsonb_typeof(p_relationship_plan) <> 'object'
		OR p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'task' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_create_relationship_plan_mismatch';
	END IF;

	-- Lock first (see header). An unparseable id is left for
	-- onto_task_create_atomic to reject with its usual error.
	BEGIN
		v_lock_project_id := nullif(p_task->>'project_id', '')::uuid;
	EXCEPTION WHEN invalid_text_representation THEN
		v_lock_project_id := NULL;
	END;
	IF v_lock_project_id IS NOT NULL THEN
		PERFORM 1
		FROM public.onto_projects project
		WHERE project.id = v_lock_project_id AND project.deleted_at IS NULL
		FOR UPDATE;
	END IF;

	v_result := public.onto_task_create_atomic(
		p_task,
		p_sync_assignees,
		p_assignee_actor_ids,
		p_assigned_by_actor_id,
		p_source,
		p_idempotency_key
	);

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
	'Atomically creates one idempotent task, syncs assignees, and applies its task-scoped relationship plan including targets_milestone. Locks the project row first so concurrent creates queue instead of upgrading locks.';

COMMIT;
