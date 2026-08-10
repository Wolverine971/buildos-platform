-- Allow the atomic task update wrapper to consume the semantic-only mutation
-- plan produced for supporting_milestone_id updates. The original wrapper
-- required entityContainment even when the shared planner intentionally skips
-- containment to preserve an existing plan/goal parent.

CREATE OR REPLACE FUNCTION public.onto_apply_task_update_relationship_plan_atomic(
	p_project_id uuid,
	p_task_id uuid,
	p_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
	v_base_plan jsonb;
	v_base_result jsonb;
	v_mutation jsonb;
	v_edge jsonb;
	v_desired_edges jsonb;
	v_rows integer;
	v_deleted integer := 0;
	v_inserted integer := 0;
BEGIN
	IF p_project_id IS NULL
		OR p_task_id IS NULL
		OR p_plan IS NULL
		OR jsonb_typeof(p_plan) <> 'object'
		OR jsonb_typeof(coalesce(p_plan->'semantic', '[]'::jsonb)) <> 'array' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
	END IF;

	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(p_project_id, 'write') THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'relationship_plan_access_denied';
	END IF;

	-- The original generic atomic applier predates targets_milestone. Delegate
	-- every other relationship mutation to it, retaining the full references
	-- list so milestone targets receive the same project/deletion validation.
	v_base_plan := jsonb_set(
		p_plan,
		'{semantic}',
		coalesce(
			(
				SELECT jsonb_agg(value)
				FROM jsonb_array_elements(p_plan->'semantic')
				WHERE value->>'rel' IS DISTINCT FROM 'targets_milestone'
			),
			'[]'::jsonb
		),
		true
	);
	v_base_result := public.onto_apply_relationship_plan_atomic(p_project_id, v_base_plan);

	FOR v_mutation IN
		SELECT value
		FROM jsonb_array_elements(p_plan->'semantic')
		WHERE value->>'rel' = 'targets_milestone'
	LOOP
		v_desired_edges := coalesce(v_mutation->'desiredEdges', '[]'::jsonb);
		IF v_mutation->>'type' IS DISTINCT FROM 'semantic'
			OR v_mutation->'entity'->>'kind' IS DISTINCT FROM 'task'
			OR nullif(v_mutation->'entity'->>'id', '')::uuid IS DISTINCT FROM p_task_id
			OR v_mutation->>'direction' IS DISTINCT FROM 'outgoing'
			OR coalesce(v_mutation->>'mode', '') NOT IN ('replace', 'merge')
			OR NOT (v_mutation ? 'desiredEdges')
			OR jsonb_typeof(v_desired_edges) <> 'array'
			OR NOT public.onto_relationship_entity_in_project(p_project_id, 'task', p_task_id) THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
		END IF;

		FOR v_edge IN SELECT value FROM jsonb_array_elements(v_desired_edges)
		LOOP
			BEGIN
				IF (v_edge->>'project_id')::uuid IS DISTINCT FROM p_project_id
					OR v_edge->>'src_kind' IS DISTINCT FROM 'task'
					OR (v_edge->>'src_id')::uuid IS DISTINCT FROM p_task_id
					OR v_edge->>'rel' IS DISTINCT FROM 'targets_milestone'
					OR v_edge->>'dst_kind' IS DISTINCT FROM 'milestone'
					OR NOT public.onto_relationship_entity_in_project(
						p_project_id,
						'milestone',
						(v_edge->>'dst_id')::uuid
					) THEN
					RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
				END IF;
			EXCEPTION WHEN invalid_text_representation THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
			END;
		END LOOP;

		IF v_mutation->>'mode' = 'replace' THEN
			DELETE FROM public.onto_edges edge
			WHERE edge.project_id = p_project_id
				AND edge.src_kind = 'task'
				AND edge.src_id = p_task_id
				AND edge.rel = 'targets_milestone';
			GET DIAGNOSTICS v_rows = ROW_COUNT;
			v_deleted := v_deleted + v_rows;
		END IF;

		INSERT INTO public.onto_edges (
			project_id, src_kind, src_id, rel, dst_kind, dst_id, props
		)
		SELECT
			p_project_id,
			desired.src_kind,
			desired.src_id,
			desired.rel,
			desired.dst_kind,
			desired.dst_id,
			coalesce(desired.props, '{}'::jsonb)
		FROM jsonb_to_recordset(v_desired_edges) AS desired(
			project_id uuid,
			src_kind text,
			src_id uuid,
			dst_kind text,
			dst_id uuid,
			rel text,
			props jsonb
		)
		WHERE v_mutation->>'mode' = 'replace'
			OR NOT EXISTS (
				SELECT 1
				FROM public.onto_edges edge
				WHERE edge.project_id = p_project_id
					AND edge.src_kind = desired.src_kind
					AND edge.src_id = desired.src_id
					AND edge.rel = desired.rel
					AND edge.dst_kind = desired.dst_kind
					AND edge.dst_id = desired.dst_id
			);
		GET DIAGNOSTICS v_rows = ROW_COUNT;
		v_inserted := v_inserted + v_rows;
	END LOOP;

	RETURN jsonb_build_object(
		'deleted', coalesce((v_base_result->>'deleted')::integer, 0) + v_deleted,
		'updated', coalesce((v_base_result->>'updated')::integer, 0),
		'inserted', coalesce((v_base_result->>'inserted')::integer, 0) + v_inserted
	);
EXCEPTION WHEN invalid_text_representation THEN
	RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
END;
$$;

REVOKE ALL ON FUNCTION public.onto_apply_task_update_relationship_plan_atomic(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_apply_task_update_relationship_plan_atomic(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_apply_task_update_relationship_plan_atomic(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_apply_task_update_relationship_plan_atomic(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.onto_apply_task_update_relationship_plan_atomic(uuid, uuid, jsonb) IS
	'Applies a normalized task-update relationship plan, including targets_milestone, in one transaction.';

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
$$;

REVOKE ALL ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.onto_task_update_with_relationships_atomic(uuid, jsonb, boolean, uuid[], uuid, jsonb, text) IS
	'Atomically updates one task, syncs assignees, and applies a task-rooted containment or semantic relationship plan.';
