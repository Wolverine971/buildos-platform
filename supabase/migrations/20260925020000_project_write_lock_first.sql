-- supabase/migrations/20260925020000_project_write_lock_first.sql
-- Tasker 105: every project write RPC takes the project lock first.
--
-- Each write to a project's rows fires the context-invalidation trigger, which
-- bumps the project's row in private.agentic_chat_project_context_versions and
-- holds it until commit. Inserts also take KEY SHARE on the project row (the
-- foreign-key check). The relationship-plan RPCs then take FOR UPDATE on the
-- project row. A transaction that writes first and locks the project second
-- upgrades its lock mid-transaction:
--   * against a writer that locked the project first (task creates, since
--     20260924193000) it deadlocks: that writer waits for the version row
--     while this one waits for the project (40P01);
--   * against its own kind it deadlocks or starves on the others' KEY SHARE.
-- A local probe on production's schema (scripts/migration-rehearsal/
-- concurrent-write-probe.mjs, 5 at once, 3 rounds) before this migration:
-- 5 goal creates or 5 plan creates lost 12 of 15 calls to 40P01; one task,
-- goal or plan update with a relationship plan, or a project soft delete, next
-- to 4 task creates lost 10-12 of 15. Task creates alone lost none. After it,
-- every scenario lost none, as the worker (service role) and as the web
-- (authenticated owner, under RLS).
--
-- This adds public.onto_lock_project_for_write(uuid) and calls it before the
-- first write in goal and plan create, goal, plan and task update (only when a
-- relationship plan is passed; a plain update takes no project lock), and
-- project soft delete. Writers now queue at the start holding nothing. Bodies
-- are otherwise unchanged from production (checked by md5 of prosrc on
-- 2026-09-25); grants on the replaced functions are unchanged.
--
-- Not changed, with reasons, in tasker/105-project-write-lock-order.md:
-- onto_task_create_with_relationships_atomic (already locks first, inline),
-- onto_apply_relationship_plan_atomic and onto_apply_task_update_relationship_plan_atomic
-- (lock before writing), the document structure RPCs (lock the project before
-- any document row), and onto_task_move_atomic (never takes FOR UPDATE on a
-- project).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- The rule, in one place. An RPC that will take the project row lock (directly
-- or through a relationship plan) calls this before any insert, update or
-- delete. A write RPC that writes before calling it reintroduces the deadlock.
-- The lock strength matches onto_apply_relationship_plan_atomic (FOR UPDATE);
-- change both or neither.
--
-- It locks only when the caller may write to the project, so an unauthorized
-- caller locks nothing and meets the calling function's own access error. It
-- returns whether it locked; a missing or deleted project returns false and is
-- left for the caller to report as it always has. SECURITY INVOKER: called
-- from a definer function it runs as that function's owner; called from the
-- web's invoker RPCs it runs under RLS. It lives in public because the
-- authenticated role has no USAGE on private.
CREATE OR REPLACE FUNCTION public.onto_lock_project_for_write(p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
	IF p_project_id IS NULL THEN
		RETURN false;
	END IF;

	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(p_project_id, 'write') THEN
		RETURN false;
	END IF;

	PERFORM 1
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id AND project.deleted_at IS NULL
	FOR UPDATE;
	RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.onto_lock_project_for_write(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_lock_project_for_write(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_lock_project_for_write(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_lock_project_for_write(uuid) TO service_role;

COMMENT ON FUNCTION public.onto_lock_project_for_write(uuid) IS
	'Locks a project row FOR UPDATE when the caller may write to it. Project write RPCs call it before their first write so every writer takes the project lock before the context-version row (Tasker 105).';

CREATE OR REPLACE FUNCTION public.onto_goal_create_atomic(p_goal jsonb, p_relationship_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

	-- Lock first (onto_lock_project_for_write): the insert bumps the project's
	-- context version, and the relationship plan below locks the project.
	PERFORM public.onto_lock_project_for_write(v_project_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.onto_plan_create_atomic(p_plan jsonb, p_relationship_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

	-- Lock first (onto_lock_project_for_write): the insert bumps the project's
	-- context version, and the relationship plan below locks the project.
	PERFORM public.onto_lock_project_for_write(v_project_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.onto_goal_update_atomic(p_goal_id uuid, p_updates jsonb, p_relationship_plan jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

	-- Lock first (onto_lock_project_for_write) when the relationship plan will
	-- lock the project: the update bumps the project's context version first.
	IF p_relationship_plan IS NOT NULL THEN
		PERFORM public.onto_lock_project_for_write((
			SELECT goal.project_id FROM public.onto_goals AS goal
			WHERE goal.id = p_goal_id AND goal.deleted_at IS NULL
		));
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
$function$;

CREATE OR REPLACE FUNCTION public.onto_plan_update_atomic(p_plan_id uuid, p_updates jsonb, p_relationship_plan jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

	-- Lock first (onto_lock_project_for_write) when the relationship plan will
	-- lock the project: the update bumps the project's context version first.
	IF p_relationship_plan IS NOT NULL THEN
		PERFORM public.onto_lock_project_for_write((
			SELECT plan.project_id FROM public.onto_plans AS plan
			WHERE plan.id = p_plan_id AND plan.deleted_at IS NULL
		));
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
$function$;

CREATE OR REPLACE FUNCTION public.onto_task_update_with_relationships_atomic(p_task_id uuid, p_updates jsonb, p_sync_assignees boolean, p_assignee_actor_ids uuid[], p_assigned_by_actor_id uuid, p_relationship_plan jsonb DEFAULT NULL::jsonb, p_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
	v_result jsonb;
	v_project_id uuid;
	v_relationship_child_id uuid;
	v_relationship_result jsonb := NULL;
	v_mutation jsonb;
BEGIN
	IF p_relationship_plan IS NOT NULL THEN
		IF jsonb_typeof(p_relationship_plan) <> 'object' THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
		END IF;

		IF jsonb_typeof(p_relationship_plan->'entityContainment') = 'object' THEN
			BEGIN
				v_relationship_child_id :=
					nullif(p_relationship_plan->'entityContainment'->'child'->>'id', '')::uuid;
			EXCEPTION WHEN invalid_text_representation THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
			END;

			IF p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'task'
				OR v_relationship_child_id IS DISTINCT FROM p_task_id THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
			END IF;
		ELSE
			-- A semantic-only plan is valid only when every mutation is rooted at
			-- this exact task. Requiring at least one mutation keeps an empty or
			-- unrelated plan from being smuggled through the task transaction.
			IF jsonb_typeof(coalesce(p_relationship_plan->'semantic', '[]'::jsonb)) <> 'array'
				OR jsonb_array_length(coalesce(p_relationship_plan->'semantic', '[]'::jsonb)) = 0 THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
			END IF;

			FOR v_mutation IN
				SELECT value
				FROM jsonb_array_elements(p_relationship_plan->'semantic')
			LOOP
				BEGIN
					v_relationship_child_id := nullif(v_mutation->'entity'->>'id', '')::uuid;
				EXCEPTION WHEN invalid_text_representation THEN
					RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
				END;

				IF v_mutation->'entity'->>'kind' IS DISTINCT FROM 'task'
					OR v_relationship_child_id IS DISTINCT FROM p_task_id THEN
					RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
				END IF;
			END LOOP;
		END IF;
	END IF;

	-- Lock first (onto_lock_project_for_write) when the relationship plan will
	-- lock the project: the task update bumps the project's context version
	-- first. A plain update takes no project lock and needs none.
	IF p_relationship_plan IS NOT NULL THEN
		PERFORM public.onto_lock_project_for_write((
			SELECT task.project_id FROM public.onto_tasks AS task
			WHERE task.id = p_task_id AND task.deleted_at IS NULL
		));
	END IF;

	v_result := public.onto_task_update_atomic(
		p_task_id,
		p_updates,
		p_sync_assignees,
		p_assignee_actor_ids,
		p_assigned_by_actor_id,
		p_source
	);

	IF p_relationship_plan IS NOT NULL THEN
		BEGIN
			v_project_id := nullif(v_result->'task'->>'project_id', '')::uuid;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
		END;

		IF v_project_id IS NULL THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
		END IF;

		v_relationship_result := public.onto_apply_task_update_relationship_plan_atomic(
			v_project_id,
			p_task_id,
			p_relationship_plan
		);
	END IF;

	RETURN v_result || jsonb_build_object('relationships', v_relationship_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_onto_project(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
	v_now timestamptz := now();
BEGIN
	IF p_project_id IS NULL THEN
		RAISE EXCEPTION 'Project ID required';
	END IF;

	-- Lock first (onto_lock_project_for_write): every child update below bumps
	-- the project's context version before the project row itself is updated.
	PERFORM public.onto_lock_project_for_write(p_project_id);

	UPDATE public.onto_tasks
	SET deleted_at = v_now,
		archived_at = COALESCE(archived_at, v_now),
		updated_at = v_now
	WHERE project_id = p_project_id
		AND deleted_at IS NULL;

	UPDATE public.onto_plans
	SET deleted_at = v_now,
		archived_at = COALESCE(archived_at, v_now),
		updated_at = v_now
	WHERE project_id = p_project_id
		AND deleted_at IS NULL;

	UPDATE public.onto_goals
	SET deleted_at = v_now,
		archived_at = COALESCE(archived_at, v_now),
		updated_at = v_now
	WHERE project_id = p_project_id
		AND deleted_at IS NULL;

	UPDATE public.onto_documents
	SET deleted_at = v_now,
		archived_at = COALESCE(archived_at, v_now),
		updated_at = v_now
	WHERE project_id = p_project_id
		AND deleted_at IS NULL;

	UPDATE public.onto_milestones
	SET deleted_at = v_now,
		archived_at = COALESCE(archived_at, v_now),
		updated_at = v_now
	WHERE project_id = p_project_id
		AND deleted_at IS NULL;

	UPDATE public.onto_risks
	SET deleted_at = v_now,
		archived_at = COALESCE(archived_at, v_now),
		updated_at = v_now
	WHERE project_id = p_project_id
		AND deleted_at IS NULL;

	UPDATE public.onto_events
	SET deleted_at = v_now,
		updated_at = v_now
	WHERE project_id = p_project_id
		AND deleted_at IS NULL;

	UPDATE public.onto_requirements
	SET deleted_at = v_now,
		updated_at = v_now
	WHERE project_id = p_project_id
		AND deleted_at IS NULL;

	UPDATE public.onto_projects
	SET deleted_at = v_now,
		archived_at = COALESCE(archived_at, v_now),
		updated_at = v_now
	WHERE id = p_project_id
		AND deleted_at IS NULL;
END;
$function$;

COMMIT;
