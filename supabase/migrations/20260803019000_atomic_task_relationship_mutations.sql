-- supabase/migrations/20260803019000_atomic_task_relationship_mutations.sql
-- Extend the existing task row/assignee transactions with the normalized
-- relationship plan. The original task commands remain callable for existing
-- non-relationship consumers.

-- Task create needs a caller-supplied ID so TypeScript can prepare the exact
-- relationship plan before the insert. Calls that omit p_task.id retain the
-- existing database-generated UUID behavior.
CREATE OR REPLACE FUNCTION public.onto_task_create_atomic(
	p_task jsonb,
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
	v_task_id uuid;
	v_project_id uuid;
	v_created_by uuid;
	v_task public.onto_tasks;
	v_existing public.onto_tasks;
	v_added_ids uuid[];
	v_state_key public.task_state;
	v_state_key_input text;
BEGIN
	IF p_task IS NULL OR jsonb_typeof(p_task) <> 'object' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_task is required';
	END IF;

	IF p_source NOT IN ('manual', 'agent', 'import') THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('Invalid source: %s', p_source);
	END IF;

	BEGIN
		v_task_id := nullif(p_task->>'id', '')::uuid;
		v_project_id := nullif(p_task->>'project_id', '')::uuid;
		v_created_by := nullif(p_task->>'created_by', '')::uuid;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_task_identifiers';
	END;

	IF v_project_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_task.project_id is required';
	END IF;
	IF nullif(p_task->>'title', '') IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_task.title is required';
	END IF;
	IF v_created_by IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_task.created_by is required';
	END IF;
	IF jsonb_typeof(coalesce(p_task->'props', '{}'::jsonb)) <> 'object' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_task.props must be an object';
	END IF;

	v_state_key_input := coalesce(nullif(p_task->>'state_key', ''), 'todo');
	BEGIN
		v_state_key := v_state_key_input::public.task_state;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = format(
				'invalid_state_key: %s; expected todo, in_progress, blocked, or done',
				v_state_key_input
			);
	END;

	IF NOT public.current_actor_has_project_access(v_project_id, 'write') THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'access_denied: no write access to project';
	END IF;

	IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
		SELECT *
		INTO v_existing
		FROM public.onto_tasks
		WHERE idempotency_key = p_idempotency_key
		LIMIT 1;

		IF FOUND THEN
			RETURN jsonb_build_object(
				'task', to_jsonb(v_existing),
				'added_actor_ids', '[]'::jsonb,
				'idempotent_replay', true
			);
		END IF;
	END IF;

	BEGIN
		INSERT INTO public.onto_tasks (
			id,
			project_id,
			title,
			description,
			type_key,
			state_key,
			priority,
			start_at,
			due_at,
			completed_at,
			props,
			created_by,
			idempotency_key
		)
		VALUES (
			coalesce(v_task_id, gen_random_uuid()),
			v_project_id,
			p_task->>'title',
			p_task->>'description',
			coalesce(nullif(p_task->>'type_key', ''), 'task.default'),
			v_state_key,
			nullif(p_task->>'priority', '')::integer,
			nullif(p_task->>'start_at', '')::timestamptz,
			nullif(p_task->>'due_at', '')::timestamptz,
			CASE
				WHEN p_task ? 'completed_at'
					THEN nullif(p_task->>'completed_at', '')::timestamptz
				ELSE NULL
			END,
			coalesce(p_task->'props', '{}'::jsonb),
			v_created_by,
			nullif(p_idempotency_key, '')
		)
		RETURNING * INTO v_task;
	EXCEPTION WHEN unique_violation THEN
		IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
			SELECT *
			INTO v_existing
			FROM public.onto_tasks
			WHERE idempotency_key = p_idempotency_key
			LIMIT 1;

			IF FOUND THEN
				RETURN jsonb_build_object(
					'task', to_jsonb(v_existing),
					'added_actor_ids', '[]'::jsonb,
					'idempotent_replay', true
				);
			END IF;
		END IF;
		RAISE;
	END;

	IF p_sync_assignees
		AND p_assignee_actor_ids IS NOT NULL
		AND array_length(p_assignee_actor_ids, 1) > 0 THEN
		IF p_assigned_by_actor_id IS NULL THEN
			RAISE EXCEPTION USING
				ERRCODE = '22023',
				MESSAGE = 'p_assigned_by_actor_id is required when syncing assignees';
		END IF;

		INSERT INTO public.onto_task_assignees (
			project_id,
			task_id,
			assignee_actor_id,
			assigned_by_actor_id,
			source
		)
		SELECT
			v_project_id,
			v_task.id,
			actor_id,
			p_assigned_by_actor_id,
			p_source
		FROM unnest(p_assignee_actor_ids) AS actor_id
		ON CONFLICT (task_id, assignee_actor_id) DO NOTHING;

		v_added_ids := p_assignee_actor_ids;
	ELSE
		v_added_ids := '{}'::uuid[];
	END IF;

	RETURN jsonb_build_object(
		'task', to_jsonb(v_task),
		'added_actor_ids', coalesce(to_jsonb(v_added_ids), '[]'::jsonb),
		'idempotent_replay', false
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_task_create_atomic(jsonb, boolean, uuid[], uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_task_create_atomic(jsonb, boolean, uuid[], uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_task_create_atomic(jsonb, boolean, uuid[], uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_task_create_atomic(jsonb, boolean, uuid[], uuid, text, text) TO service_role;

ALTER FUNCTION public.onto_task_update_atomic(uuid, jsonb, boolean, uuid[], uuid, text)
	SET search_path TO 'public';
REVOKE ALL ON FUNCTION public.onto_task_update_atomic(uuid, jsonb, boolean, uuid[], uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_task_update_atomic(uuid, jsonb, boolean, uuid[], uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_task_update_atomic(uuid, jsonb, boolean, uuid[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_task_update_atomic(uuid, jsonb, boolean, uuid[], uuid, text) TO service_role;

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

	-- A retried agentic create must return the original row without attempting
	-- to apply a newly planned UUID or duplicate relationships/side effects.
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

	v_relationship_result := public.onto_apply_relationship_plan_atomic(
		v_project_id,
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
	'Atomically creates one task, syncs assignees/idempotency, and applies its normalized relationship plan.';

CREATE OR REPLACE FUNCTION public.onto_task_update_with_relationships_atomic(
	p_task_id uuid,
	p_updates jsonb,
	p_sync_assignees boolean,
	p_assignee_actor_ids uuid[],
	p_assigned_by_actor_id uuid,
	p_relationship_plan jsonb DEFAULT NULL,
	p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
	v_result jsonb;
	v_project_id uuid;
	v_relationship_child_id uuid;
	v_relationship_result jsonb := NULL;
BEGIN
	IF p_relationship_plan IS NOT NULL
		AND (
			jsonb_typeof(p_relationship_plan) <> 'object'
			OR p_relationship_plan->'entityContainment'->'child'->>'kind' IS DISTINCT FROM 'task'
		) THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
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
			v_relationship_child_id :=
				nullif(p_relationship_plan->'entityContainment'->'child'->>'id', '')::uuid;
		EXCEPTION WHEN invalid_text_representation THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
		END;

		IF v_project_id IS NULL OR v_relationship_child_id IS DISTINCT FROM p_task_id THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_update_relationship_plan_mismatch';
		END IF;

		v_relationship_result := public.onto_apply_relationship_plan_atomic(
			v_project_id,
			p_relationship_plan
		);
	END IF;

	RETURN v_result || jsonb_build_object('relationships', v_relationship_result);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) IS
	'Atomically updates one task, syncs assignees, and optionally applies its normalized relationship plan.';
