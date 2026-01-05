-- supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql
-- Migration: Align project_calendars.project_id with onto_projects and drop onto_project_id
-- Description: Moves project_calendars to ontology-first project references.

-- 1) Ensure onto_project_id is populated (no legacy-only rows).
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'project_calendars'
			AND column_name = 'onto_project_id'
	) THEN
		IF EXISTS (SELECT 1 FROM project_calendars WHERE onto_project_id IS NULL) THEN
			RAISE EXCEPTION
				'project_calendars has rows without onto_project_id. Run ontology calendar backfill before migrating.';
		END IF;

		-- Copy ontology ids into canonical project_id column.
		UPDATE project_calendars
		SET project_id = onto_project_id
		WHERE onto_project_id IS NOT NULL;
	END IF;
END $$;

-- 2) Drop legacy FK + obsolete column/index.
ALTER TABLE project_calendars
	DROP CONSTRAINT IF EXISTS project_calendars_project_id_fkey;

ALTER TABLE project_calendars
	DROP COLUMN IF EXISTS onto_project_id;

DROP INDEX IF EXISTS idx_project_calendars_onto_project;

-- 3) Add ontology FK (project_id -> onto_projects).
ALTER TABLE project_calendars
	ADD CONSTRAINT project_calendars_project_id_fkey
	FOREIGN KEY (project_id)
	REFERENCES onto_projects(id)
	ON DELETE CASCADE;

-- 4) Update delete_onto_project helper (remove obsolete onto_project_id usage).
CREATE OR REPLACE FUNCTION delete_onto_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_goal_ids uuid[] := coalesce((select array_agg(id) from onto_goals where project_id = p_project_id), '{}'::uuid[]);
	v_requirement_ids uuid[] := coalesce((select array_agg(id) from onto_requirements where project_id = p_project_id), '{}'::uuid[]);
	v_plan_ids uuid[] := coalesce((select array_agg(id) from onto_plans where project_id = p_project_id), '{}'::uuid[]);
	v_task_ids uuid[] := coalesce((select array_agg(id) from onto_tasks where project_id = p_project_id), '{}'::uuid[]);
	v_output_ids uuid[] := coalesce((select array_agg(id) from onto_outputs where project_id = p_project_id), '{}'::uuid[]);
	v_document_ids uuid[] := coalesce((select array_agg(id) from onto_documents where project_id = p_project_id), '{}'::uuid[]);
	v_source_ids uuid[] := coalesce((select array_agg(id) from onto_sources where project_id = p_project_id), '{}'::uuid[]);
	v_decision_ids uuid[] := coalesce((select array_agg(id) from onto_decisions where project_id = p_project_id), '{}'::uuid[]);
	v_risk_ids uuid[] := coalesce((select array_agg(id) from onto_risks where project_id = p_project_id), '{}'::uuid[]);
	v_milestone_ids uuid[] := coalesce((select array_agg(id) from onto_milestones where project_id = p_project_id), '{}'::uuid[]);
	v_metric_ids uuid[] := coalesce((select array_agg(id) from onto_metrics where project_id = p_project_id), '{}'::uuid[]);
	v_signal_ids uuid[] := coalesce((select array_agg(id) from onto_signals where project_id = p_project_id), '{}'::uuid[]);
	v_insight_ids uuid[] := coalesce((select array_agg(id) from onto_insights where project_id = p_project_id), '{}'::uuid[]);
	v_event_ids uuid[] := coalesce((select array_agg(id) from onto_events where project_id = p_project_id), '{}'::uuid[]);
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
		|| v_output_ids
		|| v_document_ids
		|| v_source_ids
		|| v_decision_ids
		|| v_risk_ids
		|| v_milestone_ids
		|| v_metric_ids
		|| v_signal_ids
		|| v_insight_ids
		|| v_event_ids;

	-- Delete secondary records first
	DELETE FROM onto_event_sync WHERE event_id = any(v_event_ids);
	DELETE FROM onto_metric_points WHERE metric_id = any(v_metric_ids);
	DELETE FROM onto_output_versions WHERE output_id = any(v_output_ids);
	DELETE FROM onto_document_versions WHERE document_id = any(v_document_ids);

	-- Remove edges/assignments/permissions referencing any of these entities
	DELETE FROM onto_edges
	WHERE src_id = any(v_all_ids) OR dst_id = any(v_all_ids);

	DELETE FROM onto_assignments
	WHERE object_id = any(v_all_ids)
		AND object_kind = any (array['project','plan','task','goal','output','document','requirement','milestone','risk','decision','metric','event']);

	DELETE FROM onto_permissions
	WHERE object_id = any(v_all_ids)
		AND object_kind = any (array['project','plan','task','goal','output','document','requirement','milestone','risk','decision','metric','event']);

	DELETE FROM legacy_entity_mappings
	WHERE onto_id = any(v_all_ids)
		AND onto_table = any (array[
			'onto_projects',
			'onto_plans',
			'onto_tasks',
			'onto_goals',
			'onto_outputs',
			'onto_documents',
			'onto_requirements',
			'onto_milestones',
			'onto_risks',
			'onto_decisions',
			'onto_sources',
			'onto_metrics',
			'onto_signals',
			'onto_insights',
			'onto_events'
		]);

	-- Delete project-scoped tables
	DELETE FROM onto_events WHERE project_id = p_project_id;
	DELETE FROM onto_signals WHERE project_id = p_project_id;
	DELETE FROM onto_insights WHERE project_id = p_project_id;
	DELETE FROM onto_sources WHERE project_id = p_project_id;
	DELETE FROM onto_decisions WHERE project_id = p_project_id;
	DELETE FROM onto_risks WHERE project_id = p_project_id;
	DELETE FROM onto_milestones WHERE project_id = p_project_id;
	DELETE FROM onto_metrics WHERE project_id = p_project_id;
	DELETE FROM onto_outputs WHERE project_id = p_project_id;
	DELETE FROM onto_documents WHERE project_id = p_project_id;
	DELETE FROM onto_tasks WHERE project_id = p_project_id;
	DELETE FROM onto_plans WHERE project_id = p_project_id;
	DELETE FROM onto_requirements WHERE project_id = p_project_id;
	DELETE FROM onto_goals WHERE project_id = p_project_id;

	-- Finally remove the project (project_calendars will cascade)
	DELETE FROM onto_projects WHERE id = p_project_id;
END;
$$;

COMMENT ON FUNCTION delete_onto_project(uuid) IS
  'Deletes a project and all related ontology entities explicitly.';

GRANT EXECUTE ON FUNCTION delete_onto_project(uuid) TO authenticated;
