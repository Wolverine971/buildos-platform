-- Apply a normalized relationship mutation plan in one database transaction.
-- The planner remains in shared TypeScript so HTTP and agentic callers retain
-- one relationship policy; this function only validates and applies that plan.

CREATE OR REPLACE FUNCTION public.onto_relationship_entity_in_project(
	p_project_id uuid,
	p_kind text,
	p_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
	CASE p_kind
		WHEN 'project' THEN
			RETURN p_entity_id = p_project_id AND EXISTS (
				SELECT 1 FROM public.onto_projects entity
				WHERE entity.id = p_entity_id AND entity.deleted_at IS NULL
			);
		WHEN 'goal' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_goals entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id AND entity.deleted_at IS NULL
			);
		WHEN 'milestone' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_milestones entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id AND entity.deleted_at IS NULL
			);
		WHEN 'plan' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_plans entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id AND entity.deleted_at IS NULL
			);
		WHEN 'task' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_tasks entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id AND entity.deleted_at IS NULL
			);
		WHEN 'document' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_documents entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id AND entity.deleted_at IS NULL
			);
		WHEN 'risk' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_risks entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id AND entity.deleted_at IS NULL
			);
		WHEN 'requirement' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_requirements entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id AND entity.deleted_at IS NULL
			);
		WHEN 'metric' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_metrics entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id
			);
		WHEN 'source' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_sources entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id
			);
		WHEN 'event' THEN
			RETURN EXISTS (
				SELECT 1 FROM public.onto_events entity
				WHERE entity.id = p_entity_id AND entity.project_id = p_project_id AND entity.deleted_at IS NULL
			);
		ELSE
			RETURN false;
	END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.onto_relationship_entity_in_project(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_relationship_entity_in_project(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.onto_relationship_entity_in_project(uuid, text, uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.onto_apply_relationship_plan_atomic(
	p_project_id uuid,
	p_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
	v_reference jsonb;
	v_mutation jsonb;
	v_edge jsonb;
	v_expected_edges jsonb;
	v_desired_edges jsonb;
	v_containment_mutations jsonb;
	v_kind text;
	v_entity_id uuid;
	v_direction text;
	v_mode text;
	v_rel text;
	v_conflict boolean;
	v_rows integer;
	v_deleted integer := 0;
	v_updated integer := 0;
	v_inserted integer := 0;
BEGIN
	IF p_project_id IS NULL OR p_plan IS NULL OR jsonb_typeof(p_plan) <> 'object' THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
	END IF;

	IF jsonb_typeof(coalesce(p_plan->'references', '[]'::jsonb)) <> 'array'
		OR jsonb_typeof(coalesce(p_plan->'semantic', '[]'::jsonb)) <> 'array'
		OR jsonb_typeof(coalesce(p_plan->'projectEdges', '[]'::jsonb)) <> 'array'
		OR jsonb_typeof(coalesce(p_plan->'childContainment', '[]'::jsonb)) <> 'array'
		OR (
			p_plan->'entityContainment' IS NOT NULL
			AND jsonb_typeof(p_plan->'entityContainment') NOT IN ('object', 'null')
		) THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
	END IF;

	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(p_project_id, 'write') THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'relationship_plan_access_denied';
	END IF;

	PERFORM 1
	FROM public.onto_projects project
	WHERE project.id = p_project_id AND project.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'relationship_plan_project_not_found';
	END IF;

	FOR v_reference IN
		SELECT value FROM jsonb_array_elements(coalesce(p_plan->'references', '[]'::jsonb))
	LOOP
		BEGIN
			v_kind := v_reference->>'kind';
			v_entity_id := (v_reference->>'id')::uuid;
		EXCEPTION WHEN OTHERS THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
		END;

		IF NOT public.onto_relationship_entity_in_project(p_project_id, v_kind, v_entity_id) THEN
			RAISE EXCEPTION USING
				ERRCODE = 'P0002',
				MESSAGE = format('relationship_reference_not_found:%s', coalesce(v_kind, 'unknown'));
		END IF;
	END LOOP;

	v_containment_mutations := coalesce(p_plan->'childContainment', '[]'::jsonb);
	IF jsonb_typeof(p_plan->'entityContainment') = 'object' THEN
		v_containment_mutations := jsonb_build_array(p_plan->'entityContainment') || v_containment_mutations;
	END IF;

	FOR v_mutation IN SELECT value FROM jsonb_array_elements(v_containment_mutations)
	LOOP
		BEGIN
			v_kind := v_mutation->'child'->>'kind';
			v_entity_id := (v_mutation->'child'->>'id')::uuid;
		EXCEPTION WHEN OTHERS THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
		END;

		IF NOT public.onto_relationship_entity_in_project(p_project_id, v_kind, v_entity_id) THEN
			RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'relationship_containment_child_not_found';
		END IF;

		v_expected_edges := v_mutation->'expectedEdges';
		v_desired_edges := coalesce(v_mutation->'desiredEdges', '[]'::jsonb);

		IF coalesce(v_mutation->>'type', '') <> 'containment'
			OR NOT (v_mutation ? 'expectedEdges')
			OR NOT (v_mutation ? 'desiredEdges')
			OR jsonb_typeof(v_desired_edges) <> 'array'
			OR (v_expected_edges IS NOT NULL AND jsonb_typeof(v_expected_edges) NOT IN ('array', 'null')) THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
		END IF;

		FOR v_edge IN
			SELECT value FROM jsonb_array_elements(
				CASE WHEN jsonb_typeof(v_expected_edges) = 'array' THEN v_expected_edges ELSE '[]'::jsonb END
				|| v_desired_edges
			)
		LOOP
			BEGIN
				IF (v_edge->>'project_id')::uuid IS DISTINCT FROM p_project_id
					OR coalesce(v_edge->>'dst_kind', '') <> v_kind
					OR (v_edge->>'dst_id')::uuid IS DISTINCT FROM v_entity_id
					OR NOT public.onto_relationship_entity_in_project(
						p_project_id,
						v_edge->>'src_kind',
						(v_edge->>'src_id')::uuid
					)
					OR coalesce(v_edge->>'rel', '') NOT IN (
						'has_goal', 'has_milestone', 'has_plan', 'has_task', 'has_risk',
						'has_requirement', 'has_metric', 'has_part', 'has_event', 'contains'
					) THEN
					RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
				END IF;
			EXCEPTION WHEN invalid_text_representation THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
			END;
		END LOOP;

		IF jsonb_typeof(v_expected_edges) = 'array' THEN
			SELECT
				(
					SELECT count(*) FROM public.onto_edges edge
					WHERE edge.project_id = p_project_id
						AND edge.dst_kind = v_kind
						AND edge.dst_id = v_entity_id
						AND edge.rel IN (
							'has_goal', 'has_milestone', 'has_plan', 'has_task', 'has_risk',
							'has_requirement', 'has_metric', 'has_part', 'has_event', 'contains'
						)
				) <> jsonb_array_length(v_expected_edges)
				OR EXISTS (
					SELECT 1 FROM public.onto_edges edge
					WHERE edge.project_id = p_project_id
						AND edge.dst_kind = v_kind
						AND edge.dst_id = v_entity_id
						AND edge.rel IN (
							'has_goal', 'has_milestone', 'has_plan', 'has_task', 'has_risk',
							'has_requirement', 'has_metric', 'has_part', 'has_event', 'contains'
						)
						AND NOT EXISTS (
							SELECT 1
							FROM jsonb_to_recordset(v_expected_edges) AS expected(
								project_id uuid, src_kind text, src_id uuid, dst_kind text,
								dst_id uuid, rel text, props jsonb
							)
							WHERE expected.project_id = edge.project_id
								AND expected.src_kind = edge.src_kind
								AND expected.src_id = edge.src_id
								AND expected.dst_kind = edge.dst_kind
								AND expected.dst_id = edge.dst_id
								AND expected.rel = edge.rel
								AND coalesce(expected.props, '{}'::jsonb) = edge.props
						)
				)
				OR EXISTS (
					SELECT 1
					FROM jsonb_to_recordset(v_expected_edges) AS expected(
						project_id uuid, src_kind text, src_id uuid, dst_kind text,
						dst_id uuid, rel text, props jsonb
					)
					WHERE NOT EXISTS (
						SELECT 1 FROM public.onto_edges edge
						WHERE edge.project_id = p_project_id
							AND edge.dst_kind = v_kind
							AND edge.dst_id = v_entity_id
							AND edge.src_kind = expected.src_kind
							AND edge.src_id = expected.src_id
							AND edge.rel = expected.rel
							AND edge.props = coalesce(expected.props, '{}'::jsonb)
					)
				)
			INTO v_conflict;

			IF v_conflict THEN
				RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'relationship_containment_conflict';
			END IF;
		END IF;

		DELETE FROM public.onto_edges edge
		WHERE edge.project_id = p_project_id
			AND edge.dst_kind = v_kind
			AND edge.dst_id = v_entity_id
			AND edge.rel IN (
				'has_goal', 'has_milestone', 'has_plan', 'has_task', 'has_risk',
				'has_requirement', 'has_metric', 'has_part', 'has_event', 'contains'
			)
			AND NOT EXISTS (
				SELECT 1
				FROM jsonb_to_recordset(v_desired_edges) AS desired(
					project_id uuid, src_kind text, src_id uuid, dst_kind text,
					dst_id uuid, rel text, props jsonb
				)
				WHERE desired.src_kind = edge.src_kind
					AND desired.src_id = edge.src_id
					AND desired.rel = edge.rel
					AND desired.dst_kind = edge.dst_kind
					AND desired.dst_id = edge.dst_id
			);
		GET DIAGNOSTICS v_rows = ROW_COUNT;
		v_deleted := v_deleted + v_rows;

		UPDATE public.onto_edges edge
		SET props = coalesce(desired.props, '{}'::jsonb)
		FROM jsonb_to_recordset(v_desired_edges) AS desired(
			project_id uuid, src_kind text, src_id uuid, dst_kind text,
			dst_id uuid, rel text, props jsonb
		)
		WHERE edge.project_id = p_project_id
			AND edge.src_kind = desired.src_kind
			AND edge.src_id = desired.src_id
			AND edge.rel = desired.rel
			AND edge.dst_kind = desired.dst_kind
			AND edge.dst_id = desired.dst_id
			AND edge.props IS DISTINCT FROM coalesce(desired.props, '{}'::jsonb);
		GET DIAGNOSTICS v_rows = ROW_COUNT;
		v_updated := v_updated + v_rows;

		INSERT INTO public.onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id, props)
		SELECT p_project_id, desired.src_kind, desired.src_id, desired.rel,
			desired.dst_kind, desired.dst_id, coalesce(desired.props, '{}'::jsonb)
		FROM jsonb_to_recordset(v_desired_edges) AS desired(
			project_id uuid, src_kind text, src_id uuid, dst_kind text,
			dst_id uuid, rel text, props jsonb
		)
		WHERE NOT EXISTS (
			SELECT 1 FROM public.onto_edges edge
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

	FOR v_mutation IN
		SELECT value FROM jsonb_array_elements(coalesce(p_plan->'projectEdges', '[]'::jsonb))
	LOOP
		BEGIN
			v_kind := v_mutation->'entity'->>'kind';
			v_entity_id := (v_mutation->'entity'->>'id')::uuid;
			v_rel := v_mutation->>'rel';
		EXCEPTION WHEN OTHERS THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
		END;

		IF coalesce(v_mutation->>'type', '') <> 'project_edge'
			OR v_mutation->>'mode' <> 'remove'
			OR NOT (v_mutation ? 'entity')
			OR coalesce(v_rel, '') = ''
			OR NOT public.onto_relationship_entity_in_project(p_project_id, v_kind, v_entity_id) THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
		END IF;

		DELETE FROM public.onto_edges edge
		WHERE edge.project_id = p_project_id
			AND edge.src_kind = 'project'
			AND edge.src_id = p_project_id
			AND edge.dst_kind = v_kind
			AND edge.dst_id = v_entity_id
			AND edge.rel = v_rel;
		GET DIAGNOSTICS v_rows = ROW_COUNT;
		v_deleted := v_deleted + v_rows;
	END LOOP;

	FOR v_mutation IN
		SELECT value FROM jsonb_array_elements(coalesce(p_plan->'semantic', '[]'::jsonb))
	LOOP
		BEGIN
			v_kind := v_mutation->'entity'->>'kind';
			v_entity_id := (v_mutation->'entity'->>'id')::uuid;
			v_rel := v_mutation->>'rel';
			v_direction := v_mutation->>'direction';
			v_mode := v_mutation->>'mode';
			v_desired_edges := coalesce(v_mutation->'desiredEdges', '[]'::jsonb);
		EXCEPTION WHEN OTHERS THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
		END;

		IF coalesce(v_mutation->>'type', '') <> 'semantic'
			OR coalesce(v_direction, '') NOT IN ('outgoing', 'incoming')
			OR coalesce(v_mode, '') NOT IN ('replace', 'merge')
			OR NOT (v_mutation ? 'desiredEdges')
			OR coalesce(v_rel, '') NOT IN (
				'contains', 'has_plan', 'has_task', 'has_goal', 'has_document', 'has_risk',
				'has_milestone', 'has_metric', 'has_requirement', 'has_source',
				'has_context_document', 'has_part', 'has_event', 'supports_goal', 'achieved_by',
				'depends_on', 'requires', 'blocks', 'references', 'referenced_by', 'relates_to',
				'threatens', 'mitigates', 'mitigated_by', 'addressed_in', 'addresses',
				'documented_in'
			)
			OR jsonb_typeof(v_desired_edges) <> 'array'
			OR NOT public.onto_relationship_entity_in_project(p_project_id, v_kind, v_entity_id) THEN
			RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
		END IF;

		FOR v_edge IN SELECT value FROM jsonb_array_elements(v_desired_edges)
		LOOP
			BEGIN
				IF (v_edge->>'project_id')::uuid IS DISTINCT FROM p_project_id
					OR coalesce(v_edge->>'rel', '') <> v_rel
					OR NOT public.onto_relationship_entity_in_project(
						p_project_id,
						v_edge->>'src_kind',
						(v_edge->>'src_id')::uuid
					)
					OR NOT public.onto_relationship_entity_in_project(
						p_project_id,
						v_edge->>'dst_kind',
						(v_edge->>'dst_id')::uuid
					)
					OR (
						v_direction = 'outgoing'
						AND (
							coalesce(v_edge->>'src_kind', '') <> v_kind
							OR (v_edge->>'src_id')::uuid IS DISTINCT FROM v_entity_id
						)
					)
					OR (
						v_direction = 'incoming'
						AND (
							coalesce(v_edge->>'dst_kind', '') <> v_kind
							OR (v_edge->>'dst_id')::uuid IS DISTINCT FROM v_entity_id
						)
					) THEN
					RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
				END IF;
			EXCEPTION WHEN invalid_text_representation THEN
				RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'relationship_plan_invalid';
			END;
		END LOOP;

		IF v_mode = 'replace' THEN
			IF v_direction = 'outgoing' THEN
				DELETE FROM public.onto_edges edge
				WHERE edge.project_id = p_project_id
					AND edge.src_kind = v_kind
					AND edge.src_id = v_entity_id
					AND edge.rel = v_rel;
			ELSE
				DELETE FROM public.onto_edges edge
				WHERE edge.project_id = p_project_id
					AND edge.dst_kind = v_kind
					AND edge.dst_id = v_entity_id
					AND edge.rel = v_rel;
			END IF;
			GET DIAGNOSTICS v_rows = ROW_COUNT;
			v_deleted := v_deleted + v_rows;
		END IF;

		INSERT INTO public.onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id, props)
		SELECT p_project_id, desired.src_kind, desired.src_id, desired.rel,
			desired.dst_kind, desired.dst_id, coalesce(desired.props, '{}'::jsonb)
		FROM jsonb_to_recordset(v_desired_edges) AS desired(
			project_id uuid, src_kind text, src_id uuid, dst_kind text,
			dst_id uuid, rel text, props jsonb
		)
		WHERE v_mode = 'replace'
			OR NOT EXISTS (
				SELECT 1 FROM public.onto_edges edge
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

	RETURN jsonb_build_object('deleted', v_deleted, 'updated', v_updated, 'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_apply_relationship_plan_atomic(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_apply_relationship_plan_atomic(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.onto_apply_relationship_plan_atomic(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_apply_relationship_plan_atomic(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.onto_apply_relationship_plan_atomic(uuid, jsonb) IS
	'Validates and atomically applies one normalized ontology relationship mutation plan.';
