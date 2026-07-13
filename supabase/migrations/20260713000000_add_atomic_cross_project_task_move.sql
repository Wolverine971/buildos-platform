-- supabase/migrations/20260713000000_add_atomic_cross_project_task_move.sql
-- Purpose-built cross-project task transfer.
--
-- Generic ontology mutations intentionally remain project-scoped. This RPC is
-- the narrow exception: it verifies write access to both projects, locks the
-- task, previews destructive effects, and applies the accepted move atomically.
--
-- V1 deliberately blocks scheduled and recurring tasks. Those tasks own
-- calendar events / series state whose transfer semantics need a separate,
-- explicit operation.

CREATE OR REPLACE FUNCTION public.onto_comments_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	v_moving_task_id text := current_setting('buildos.moving_task_id', true);
	v_is_task_move boolean := false;
BEGIN
	-- Comment targets are normally immutable. The task-move RPC sets a
	-- transaction-local task ID and may re-home only comments for that exact task
	-- after the task itself has moved to NEW.project_id.
	IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
		IF NEW.entity_type <> 'task'
			OR NEW.entity_id::text <> coalesce(v_moving_task_id, '')
			OR NOT EXISTS (
				SELECT 1
				FROM public.onto_tasks task
				WHERE task.id = NEW.entity_id
					AND task.project_id = NEW.project_id
					AND task.deleted_at IS NULL
			) THEN
			RAISE EXCEPTION 'Immutable comment fields cannot be changed';
		END IF;
		v_is_task_move := true;
	END IF;

	IF NEW.entity_type <> OLD.entity_type
		OR NEW.entity_id <> OLD.entity_id
		OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
		OR NEW.root_id <> OLD.root_id
		OR NEW.created_by <> OLD.created_by
		OR NEW.created_at <> OLD.created_at
		OR NEW.body_format <> OLD.body_format THEN
		RAISE EXCEPTION 'Immutable comment fields cannot be changed';
	END IF;

	IF NEW.body IS DISTINCT FROM OLD.body THEN
		NEW.edited_at := now();
	END IF;

	IF NOT v_is_task_move THEN
		NEW.updated_at := now();
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.onto_task_move_atomic(
	p_task_id uuid,
	p_expected_source_project_id uuid,
	p_destination_project_id uuid,
	p_confirmation_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
	v_task public.onto_tasks%ROWTYPE;
	v_task_before jsonb;
	v_source_project public.onto_projects%ROWTYPE;
	v_destination_project public.onto_projects%ROWTYPE;
	v_relationship_count integer := 0;
	v_event_relationship_count integer := 0;
	v_owned_event_count integer := 0;
	v_asset_link_count integer := 0;
	v_task_link_count integer := 0;
	v_assignee_count integer := 0;
	v_incompatible_assignee_count integer := 0;
	v_comment_count integer := 0;
	v_retained_assignee_count integer := 0;
	v_removed_assignee_count integer := 0;
	v_detached_relationship_count integer := 0;
	v_is_recurring boolean := false;
	v_is_scheduled boolean := false;
	v_confirmation_token text;
	v_relationship_details jsonb := '[]'::jsonb;
	v_incompatible_assignee_actor_ids jsonb := '[]'::jsonb;
	v_task_link_details jsonb := '{}'::jsonb;
	v_impact jsonb;
BEGIN
	IF p_task_id IS NULL
		OR p_expected_source_project_id IS NULL
		OR p_destination_project_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_move_invalid_arguments';
	END IF;

	IF p_expected_source_project_id = p_destination_project_id THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_move_same_project';
	END IF;

	-- Check authorization before reading either project or task details so this
	-- SECURITY DEFINER function does not become a cross-project existence oracle.
	IF NOT public.current_actor_has_project_member_access(
		p_expected_source_project_id,
		'write'
	) OR NOT public.current_actor_has_project_member_access(
		p_destination_project_id,
		'write'
	) THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'task_move_access_denied';
	END IF;

	SELECT * INTO v_source_project
	FROM public.onto_projects
	WHERE id = p_expected_source_project_id
		AND deleted_at IS NULL;

	SELECT * INTO v_destination_project
	FROM public.onto_projects
	WHERE id = p_destination_project_id
		AND deleted_at IS NULL;

	IF v_source_project.id IS NULL OR v_destination_project.id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'task_move_project_not_found';
	END IF;

	-- Serialize moves and concurrent edits. updated_at is part of the confirmation
	-- token, so any edit after a preview makes that preview stale.
	SELECT * INTO v_task
	FROM public.onto_tasks
	WHERE id = p_task_id
		AND deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'task_move_task_not_found';
	END IF;

	IF v_task.project_id = p_destination_project_id THEN
		RETURN jsonb_build_object(
			'status', 'already_moved',
			'requires_user_action', false,
			'task', to_jsonb(v_task),
			'source_project', jsonb_build_object('id', v_source_project.id, 'name', v_source_project.name),
			'destination_project', jsonb_build_object('id', v_destination_project.id, 'name', v_destination_project.name)
		);
	END IF;

	-- Moving into an archived destination would succeed but leave the task
	-- immediately hidden from normal project reads. Moving out of an archived
	-- source remains allowed as a recovery path. An idempotent retry is returned
	-- above even if the destination was archived after the original move.
	IF v_destination_project.archived_at IS NOT NULL THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'task_move_destination_archived';
	END IF;

	IF v_task.project_id <> p_expected_source_project_id THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'task_move_source_project_mismatch';
	END IF;

	v_task_before := to_jsonb(v_task);

	SELECT count(*)::integer INTO v_event_relationship_count
	FROM public.onto_edges edge
	WHERE edge.project_id = p_expected_source_project_id
		AND (
			(edge.src_kind = 'task' AND edge.src_id = p_task_id)
			OR (edge.dst_kind = 'task' AND edge.dst_id = p_task_id)
		)
		AND edge.rel = 'has_event';

	SELECT count(*)::integer INTO v_owned_event_count
	FROM public.onto_events event_row
	WHERE event_row.project_id = p_expected_source_project_id
		AND event_row.deleted_at IS NULL
		AND (
			(event_row.owner_entity_type = 'task' AND event_row.owner_entity_id = p_task_id)
			OR event_row.props->>'task_id' = p_task_id::text
		);

	SELECT count(*)::integer INTO v_asset_link_count
	FROM public.onto_asset_links asset_link
	WHERE asset_link.project_id = p_expected_source_project_id
		AND asset_link.entity_kind = 'task'
		AND asset_link.entity_id = p_task_id;

	SELECT
		count(*)::integer,
		coalesce(
			jsonb_agg(
				jsonb_build_object(
					'id', edge.id,
					'rel', edge.rel,
					'src_kind', edge.src_kind,
					'src_id', edge.src_id,
					'dst_kind', edge.dst_kind,
					'dst_id', edge.dst_id
				)
				ORDER BY edge.id
			),
			'[]'::jsonb
		)
	INTO v_relationship_count, v_relationship_details
	FROM public.onto_edges edge
	WHERE edge.project_id = p_expected_source_project_id
		AND (
			(edge.src_kind = 'task' AND edge.src_id = p_task_id)
			OR (edge.dst_kind = 'task' AND edge.dst_id = p_task_id)
		)
		AND edge.rel <> 'has_event';

	SELECT count(*)::integer INTO v_assignee_count
	FROM public.onto_task_assignees assignee
	WHERE assignee.task_id = p_task_id;

	SELECT
		count(*)::integer,
		coalesce(
			jsonb_agg(assignee.assignee_actor_id ORDER BY assignee.assignee_actor_id),
			'[]'::jsonb
		)
	INTO v_incompatible_assignee_count, v_incompatible_assignee_actor_ids
	FROM public.onto_task_assignees assignee
	WHERE assignee.task_id = p_task_id
		AND assignee.assignee_actor_id <> v_destination_project.created_by
		AND NOT EXISTS (
			SELECT 1
			FROM public.onto_project_members member
			WHERE member.project_id = p_destination_project_id
				AND member.actor_id = assignee.assignee_actor_id
				AND member.removed_at IS NULL
		);

	SELECT count(*)::integer INTO v_comment_count
	FROM public.onto_comments comment_row
	WHERE comment_row.entity_type = 'task'
		AND comment_row.entity_id = p_task_id;

	-- These legacy/direct links are project-local just like graph edges. They are
	-- cleared on a move, so include their exact values in the destructive-impact
	-- preview instead of silently dropping them.
	v_task_link_details := jsonb_strip_nulls(jsonb_build_object(
		'plan_id', v_task.plan_id,
		'props.goal_id', CASE
			WHEN nullif(btrim(coalesce(v_task.props->>'goal_id', '')), '') IS NULL THEN NULL
			ELSE v_task.props->'goal_id'
		END,
		'props.supporting_milestone_id', CASE
			WHEN nullif(btrim(coalesce(v_task.props->>'supporting_milestone_id', '')), '') IS NULL THEN NULL
			ELSE v_task.props->'supporting_milestone_id'
		END,
		'props.plan_id', CASE
			WHEN nullif(btrim(coalesce(v_task.props->>'plan_id', '')), '') IS NULL THEN NULL
			ELSE v_task.props->'plan_id'
		END
	));

	SELECT count(*)::integer INTO v_task_link_count
	FROM jsonb_each(v_task_link_details);

	v_is_recurring := nullif(btrim(coalesce(v_task.props->>'series_id', '')), '') IS NOT NULL
		OR (v_task.props ? 'series' AND v_task.props->'series' <> 'null'::jsonb)
		OR (v_task.props ? 'recurrence' AND v_task.props->'recurrence' <> 'null'::jsonb)
		OR nullif(btrim(coalesce(v_task.props->>'recurrence_pattern', '')), '') IS NOT NULL
		OR nullif(btrim(coalesce(v_task.props->>'recurrence_rrule', '')), '') IS NOT NULL
		OR lower(btrim(coalesce(v_task.props->>'task_type', ''))) = 'recurring';
	v_is_scheduled := v_task.start_at IS NOT NULL OR v_task.due_at IS NOT NULL;

	v_impact := jsonb_build_object(
		'relationships_to_detach', v_relationship_count,
		'relationship_details', v_relationship_details,
		'event_relationships', v_event_relationship_count,
		'owned_events', v_owned_event_count,
		'asset_links', v_asset_link_count,
		'task_links_to_clear', v_task_link_count,
		'task_link_details', v_task_link_details,
		'assignees_total', v_assignee_count,
		'assignees_to_remove', v_incompatible_assignee_count,
		'assignee_actor_ids_to_remove', v_incompatible_assignee_actor_ids,
		'assignees_to_retain', v_assignee_count - v_incompatible_assignee_count,
		'comments_to_move', v_comment_count,
		'is_scheduled', v_is_scheduled,
		'is_recurring', v_is_recurring
	);

	IF v_is_recurring
		OR v_is_scheduled
		OR v_event_relationship_count > 0
		OR v_owned_event_count > 0
		OR v_asset_link_count > 0 THEN
		RETURN jsonb_build_object(
			'status', 'blocked',
			'requires_user_action', true,
			'blocker', CASE
				WHEN v_is_recurring THEN 'recurring_task_not_supported'
				WHEN v_is_scheduled OR v_event_relationship_count > 0 OR v_owned_event_count > 0
					THEN 'scheduled_task_not_supported'
				ELSE 'task_attachments_not_supported'
			END,
			'message', CASE
				WHEN v_is_recurring OR v_is_scheduled OR v_event_relationship_count > 0 OR v_owned_event_count > 0
					THEN 'Scheduled or recurring tasks cannot be moved yet because their calendar and series state must be re-homed together.'
				ELSE 'Tasks with attached project assets cannot be moved yet because the assets must be copied or re-homed with an explicit ownership policy.'
			END,
			'task', to_jsonb(v_task),
			'source_project', jsonb_build_object('id', v_source_project.id, 'name', v_source_project.name),
			'destination_project', jsonb_build_object('id', v_destination_project.id, 'name', v_destination_project.name),
			'impact', v_impact
		);
	END IF;

	v_confirmation_token := md5(concat_ws(
		':',
		p_task_id::text,
		v_task.updated_at::text,
		p_expected_source_project_id::text,
		p_destination_project_id::text,
		v_relationship_details::text,
		v_incompatible_assignee_actor_ids::text,
		v_task_link_details::text
	));

	IF (
		v_relationship_count > 0
		OR v_incompatible_assignee_count > 0
		OR v_task_link_count > 0
	)
		AND coalesce(p_confirmation_token, '') <> v_confirmation_token THEN
		RETURN jsonb_build_object(
			'status', 'confirmation_required',
			'requires_user_action', true,
			'confirmation_token', v_confirmation_token,
			'message', 'Moving this task will detach project relationships, clear project-local task links, or remove assignees who do not belong to the destination project. Ask the user to confirm these exact effects before retrying with the confirmation token.',
			'task', to_jsonb(v_task),
			'source_project', jsonb_build_object('id', v_source_project.id, 'name', v_source_project.name),
			'destination_project', jsonb_build_object('id', v_destination_project.id, 'name', v_destination_project.name),
			'impact', v_impact
		);
	END IF;

	DELETE FROM public.onto_edges edge
	WHERE edge.project_id = p_expected_source_project_id
		AND (
			(edge.src_kind = 'task' AND edge.src_id = p_task_id)
			OR (edge.dst_kind = 'task' AND edge.dst_id = p_task_id)
		);
	GET DIAGNOSTICS v_detached_relationship_count = ROW_COUNT;

	IF v_detached_relationship_count <> v_relationship_count THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'task_move_impact_changed';
	END IF;

	DELETE FROM public.onto_task_assignees assignee
	WHERE assignee.task_id = p_task_id
		AND assignee.assignee_actor_id <> v_destination_project.created_by
		AND NOT EXISTS (
			SELECT 1
			FROM public.onto_project_members member
			WHERE member.project_id = p_destination_project_id
				AND member.actor_id = assignee.assignee_actor_id
				AND member.removed_at IS NULL
		);
	GET DIAGNOSTICS v_removed_assignee_count = ROW_COUNT;

	IF v_removed_assignee_count <> v_incompatible_assignee_count THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'task_move_impact_changed';
	END IF;

	UPDATE public.onto_task_assignees
	SET project_id = p_destination_project_id
	WHERE task_id = p_task_id;
	GET DIAGNOSTICS v_retained_assignee_count = ROW_COUNT;

	IF v_retained_assignee_count <> v_assignee_count - v_incompatible_assignee_count THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'task_move_impact_changed';
	END IF;

	UPDATE public.onto_tasks
	SET project_id = p_destination_project_id,
		plan_id = NULL,
		props = coalesce(props, '{}'::jsonb)
			- 'goal_id'
			- 'supporting_milestone_id'
			- 'plan_id',
		updated_at = now()
	WHERE id = p_task_id
	RETURNING * INTO v_task;

	PERFORM set_config('buildos.moving_task_id', p_task_id::text, true);

	UPDATE public.onto_comments
	SET project_id = p_destination_project_id
	WHERE entity_type = 'task'
		AND entity_id = p_task_id;

	UPDATE public.onto_comment_read_states
	SET project_id = p_destination_project_id
	WHERE entity_type = 'task'
		AND entity_id = p_task_id;

	-- Re-check project-keyed dependents at the end of the transaction. The task
	-- row lock serializes normal task edits; these checks also catch dependent
	-- rows that committed between the impact preview and the mutation statements.
	-- A detected race rolls the whole move back and the caller receives a 409.
	IF EXISTS (
		SELECT 1 FROM public.onto_edges edge
		WHERE edge.project_id = p_expected_source_project_id
			AND (
				(edge.src_kind = 'task' AND edge.src_id = p_task_id)
				OR (edge.dst_kind = 'task' AND edge.dst_id = p_task_id)
			)
	) OR EXISTS (
		SELECT 1 FROM public.onto_events event_row
		WHERE event_row.project_id = p_expected_source_project_id
			AND event_row.deleted_at IS NULL
			AND (
				(event_row.owner_entity_type = 'task' AND event_row.owner_entity_id = p_task_id)
				OR event_row.props->>'task_id' = p_task_id::text
			)
	) OR EXISTS (
		SELECT 1 FROM public.onto_asset_links asset_link
		WHERE asset_link.project_id = p_expected_source_project_id
			AND asset_link.entity_kind = 'task'
			AND asset_link.entity_id = p_task_id
	) OR EXISTS (
		SELECT 1 FROM public.onto_task_assignees assignee
		WHERE assignee.task_id = p_task_id
			AND assignee.project_id <> p_destination_project_id
	) OR EXISTS (
		SELECT 1 FROM public.onto_comments comment_row
		WHERE comment_row.entity_type = 'task'
			AND comment_row.entity_id = p_task_id
			AND comment_row.project_id <> p_destination_project_id
	) OR EXISTS (
		SELECT 1 FROM public.onto_comment_read_states read_state
		WHERE read_state.entity_type = 'task'
			AND read_state.entity_id = p_task_id
			AND read_state.project_id <> p_destination_project_id
	) THEN
		RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'task_move_impact_changed';
	END IF;

	RETURN jsonb_build_object(
		'status', 'moved',
		'requires_user_action', false,
		'task', to_jsonb(v_task),
		'task_before', v_task_before,
		'source_project', jsonb_build_object('id', v_source_project.id, 'name', v_source_project.name),
		'destination_project', jsonb_build_object('id', v_destination_project.id, 'name', v_destination_project.name),
		'impact', v_impact,
		'applied', jsonb_build_object(
			'relationships_detached', v_detached_relationship_count,
			'assignees_removed', v_removed_assignee_count,
			'assignees_retained', v_retained_assignee_count,
			'comments_moved', v_comment_count
		)
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_task_move_atomic(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onto_task_move_atomic(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_task_move_atomic(uuid, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.onto_task_move_atomic(uuid, uuid, uuid, text) IS
	'Atomically moves a standalone task between writable projects, previewing destructive relationship and assignee effects before applying them.';
