-- supabase/migrations/20260426000005_remove_onto_decisions_from_active_rpcs.sql
-- Remove deprecated onto_decisions references from active project RPCs.

CREATE OR REPLACE FUNCTION get_project_skeleton(
	p_project_id uuid,
	p_actor_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
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
		'updated_at', p.updated_at,
		'task_count', (SELECT count(*) FROM onto_tasks WHERE project_id = p.id AND deleted_at IS NULL),
		'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id AND deleted_at IS NULL),
		'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id AND deleted_at IS NULL),
		'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id AND deleted_at IS NULL),
		'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id AND deleted_at IS NULL),
		'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id AND deleted_at IS NULL),
		'image_count', (SELECT count(*) FROM onto_assets WHERE project_id = p.id AND deleted_at IS NULL)
	)
	FROM onto_projects p
	WHERE p.id = p_project_id
		AND p.deleted_at IS NULL
		AND current_actor_has_project_access(p.id, 'read');
$$;

GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO anon;

CREATE OR REPLACE FUNCTION get_project_full(
	p_project_id uuid,
	p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
	v_project jsonb;
	v_result jsonb;
BEGIN
	IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
		RETURN NULL;
	END IF;

	SELECT to_jsonb(p.*)
	INTO v_project
	FROM onto_projects p
	WHERE p.id = p_project_id
		AND p.deleted_at IS NULL;

	IF v_project IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT jsonb_build_object(
		'project', v_project,
		'goals', COALESCE((
			SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created_at)
			FROM onto_goals g
			WHERE g.project_id = p_project_id
				AND g.deleted_at IS NULL
		), '[]'::jsonb),
		'requirements', COALESCE((
			SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
			FROM onto_requirements r
			WHERE r.project_id = p_project_id
				AND r.deleted_at IS NULL
		), '[]'::jsonb),
		'plans', COALESCE((
			SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created_at)
			FROM onto_plans pl
			WHERE pl.project_id = p_project_id
				AND pl.deleted_at IS NULL
		), '[]'::jsonb),
		'tasks', COALESCE((
			SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.created_at)
			FROM onto_tasks t
			WHERE t.project_id = p_project_id
				AND t.deleted_at IS NULL
		), '[]'::jsonb),
		'documents', COALESCE((
			SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created_at)
			FROM onto_documents d
			WHERE d.project_id = p_project_id
				AND d.deleted_at IS NULL
		), '[]'::jsonb),
		'images', COALESCE((
			SELECT jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at DESC)
			FROM onto_assets a
			WHERE a.project_id = p_project_id
				AND a.deleted_at IS NULL
		), '[]'::jsonb),
		'sources', COALESCE((
			SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.created_at)
			FROM onto_sources s
			WHERE s.project_id = p_project_id
		), '[]'::jsonb),
		'milestones', COALESCE((
			SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.due_at)
			FROM onto_milestones m
			WHERE m.project_id = p_project_id
				AND m.deleted_at IS NULL
		), '[]'::jsonb),
		'risks', COALESCE((
			SELECT jsonb_agg(to_jsonb(rk.*) ORDER BY rk.created_at)
			FROM onto_risks rk
			WHERE rk.project_id = p_project_id
				AND rk.deleted_at IS NULL
		), '[]'::jsonb),
		'metrics', COALESCE((
			SELECT jsonb_agg(to_jsonb(mt.*) ORDER BY mt.created_at)
			FROM onto_metrics mt
			WHERE mt.project_id = p_project_id
		), '[]'::jsonb),
		'context_document', (
			SELECT to_jsonb(d.*)
			FROM onto_edges e
			JOIN onto_documents d ON d.id = e.dst_id
			WHERE e.src_kind = 'project'
				AND e.src_id = p_project_id
				AND e.rel = 'has_context_document'
				AND e.dst_kind = 'document'
				AND d.deleted_at IS NULL
			LIMIT 1
		)
	)
	INTO v_result;

	RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO anon;

CREATE OR REPLACE FUNCTION delete_onto_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_goal_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_goals WHERE project_id = p_project_id), '{}'::uuid[]);
	v_requirement_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_requirements WHERE project_id = p_project_id), '{}'::uuid[]);
	v_plan_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_plans WHERE project_id = p_project_id), '{}'::uuid[]);
	v_task_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_tasks WHERE project_id = p_project_id), '{}'::uuid[]);
	v_document_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_documents WHERE project_id = p_project_id), '{}'::uuid[]);
	v_source_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_sources WHERE project_id = p_project_id), '{}'::uuid[]);
	v_risk_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_risks WHERE project_id = p_project_id), '{}'::uuid[]);
	v_milestone_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_milestones WHERE project_id = p_project_id), '{}'::uuid[]);
	v_metric_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_metrics WHERE project_id = p_project_id), '{}'::uuid[]);
	v_signal_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_signals WHERE project_id = p_project_id), '{}'::uuid[]);
	v_insight_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_insights WHERE project_id = p_project_id), '{}'::uuid[]);
	v_event_ids uuid[] := coalesce((SELECT array_agg(id) FROM onto_events WHERE project_id = p_project_id), '{}'::uuid[]);
	v_all_ids uuid[] := array[p_project_id];
BEGIN
	IF p_project_id IS NULL THEN
		RAISE EXCEPTION 'Project ID required';
	END IF;

	v_all_ids := v_all_ids
		|| v_goal_ids
		|| v_requirement_ids
		|| v_plan_ids
		|| v_task_ids
		|| v_document_ids
		|| v_source_ids
		|| v_risk_ids
		|| v_milestone_ids
		|| v_metric_ids
		|| v_signal_ids
		|| v_insight_ids
		|| v_event_ids;

	DELETE FROM onto_event_sync WHERE event_id = any(v_event_ids);
	DELETE FROM onto_metric_points WHERE metric_id = any(v_metric_ids);
	DELETE FROM onto_document_versions WHERE document_id = any(v_document_ids);

	DELETE FROM onto_edges
	WHERE src_id = any(v_all_ids) OR dst_id = any(v_all_ids);

	DELETE FROM onto_assignments
	WHERE object_id = any(v_all_ids)
		AND object_kind = any (array['project','plan','task','goal','document','requirement','milestone','risk','metric','event']);

	DELETE FROM onto_permissions
	WHERE object_id = any(v_all_ids)
		AND object_kind = any (array['project','plan','task','goal','document','requirement','milestone','risk','metric','event']);

	DELETE FROM legacy_entity_mappings
	WHERE onto_id = any(v_all_ids)
		AND onto_table = any (array[
			'onto_projects',
			'onto_plans',
			'onto_tasks',
			'onto_goals',
			'onto_documents',
			'onto_requirements',
			'onto_milestones',
			'onto_risks',
			'onto_sources',
			'onto_metrics',
			'onto_signals',
			'onto_insights',
			'onto_events'
		]);

	DELETE FROM onto_events WHERE project_id = p_project_id;
	DELETE FROM onto_signals WHERE project_id = p_project_id;
	DELETE FROM onto_insights WHERE project_id = p_project_id;
	DELETE FROM onto_sources WHERE project_id = p_project_id;
	DELETE FROM onto_risks WHERE project_id = p_project_id;
	DELETE FROM onto_milestones WHERE project_id = p_project_id;
	DELETE FROM onto_metrics WHERE project_id = p_project_id;
	DELETE FROM onto_documents WHERE project_id = p_project_id;
	DELETE FROM onto_tasks WHERE project_id = p_project_id;
	DELETE FROM onto_plans WHERE project_id = p_project_id;
	DELETE FROM onto_requirements WHERE project_id = p_project_id;
	DELETE FROM onto_goals WHERE project_id = p_project_id;

	DELETE FROM onto_projects WHERE id = p_project_id;
END;
$$;

COMMENT ON FUNCTION delete_onto_project(uuid) IS
	'Deletes a project and all related ontology entities explicitly.';

GRANT EXECUTE ON FUNCTION delete_onto_project(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION onto_comment_validate_target(
	p_project_id uuid,
	p_entity_type text,
	p_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	IF p_project_id IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
		RETURN false;
	END IF;

	CASE p_entity_type
		WHEN 'project' THEN
			RETURN p_entity_id = p_project_id;
		WHEN 'task' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_tasks t
				WHERE t.id = p_entity_id AND t.project_id = p_project_id
			);
		WHEN 'plan' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_plans pl
				WHERE pl.id = p_entity_id AND pl.project_id = p_project_id
			);
		WHEN 'document' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_documents d
				WHERE d.id = p_entity_id AND d.project_id = p_project_id
			);
		WHEN 'goal' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_goals g
				WHERE g.id = p_entity_id AND g.project_id = p_project_id
			);
		WHEN 'requirement' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_requirements r
				WHERE r.id = p_entity_id AND r.project_id = p_project_id
			);
		WHEN 'milestone' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_milestones m
				WHERE m.id = p_entity_id AND m.project_id = p_project_id
			);
		WHEN 'risk' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_risks rk
				WHERE rk.id = p_entity_id AND rk.project_id = p_project_id
			);
		WHEN 'event' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_events ev
				WHERE ev.id = p_entity_id AND ev.project_id = p_project_id
			);
		WHEN 'metric' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_metrics mt
				WHERE mt.id = p_entity_id AND mt.project_id = p_project_id
			);
		WHEN 'metric_point' THEN
			RETURN EXISTS (
				SELECT 1
				FROM onto_metric_points mp
				JOIN onto_metrics mt ON mt.id = mp.metric_id
				WHERE mp.id = p_entity_id AND mt.project_id = p_project_id
			);
		WHEN 'source' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_sources s
				WHERE s.id = p_entity_id AND s.project_id = p_project_id
			);
		WHEN 'signal' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_signals sg
				WHERE sg.id = p_entity_id AND sg.project_id = p_project_id
			);
		WHEN 'insight' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_insights i
				WHERE i.id = p_entity_id AND i.project_id = p_project_id
			);
		WHEN 'note' THEN
			RETURN EXISTS (
				SELECT 1 FROM onto_documents d
				WHERE d.id = p_entity_id AND d.project_id = p_project_id
			);
		ELSE
			RETURN false;
	END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION onto_comment_validate_target(uuid, text, uuid) TO authenticated;

DO $$
BEGIN
	IF to_regclass('public.onto_decisions') IS NOT NULL THEN
		COMMENT ON TABLE public.onto_decisions IS
			'DEPRECATED: onto_decisions is deprecated and scheduled for removal. Avoid new reads/writes.';
	END IF;
END;
$$;
