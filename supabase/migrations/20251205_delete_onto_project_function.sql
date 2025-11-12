-- supabase/migrations/20251205_delete_onto_project_function.sql
-- Purpose: Explicitly delete all ontology entities tied to a project (rather than relying on FK cascades)

create or replace function delete_onto_project(p_project_id uuid)
returns void
language plpgsql
as $$
declare
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
begin
	if p_project_id is null then
		raise exception 'Project ID required';
	end if;

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
	delete from onto_event_sync where event_id = any(v_event_ids);
	delete from onto_metric_points where metric_id = any(v_metric_ids);
	delete from onto_output_versions where output_id = any(v_output_ids);
	delete from onto_document_versions where document_id = any(v_document_ids);

	-- Remove edges/assignments/permissions referencing any of these entities
	delete from onto_edges
	where src_id = any(v_all_ids) or dst_id = any(v_all_ids);

	delete from onto_assignments
	where object_id = any(v_all_ids)
		and object_kind = any (array['project','plan','task','goal','output','document','requirement','milestone','risk','decision','metric','event']);

	delete from onto_permissions
	where object_id = any(v_all_ids)
		and object_kind = any (array['project','plan','task','goal','output','document','requirement','milestone','risk','decision','metric','event']);

	delete from legacy_entity_mappings
	where onto_id = any(v_all_ids)
		and onto_table = any (array[
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

	update project_calendars
	set onto_project_id = null
	where onto_project_id = p_project_id;

	-- Delete project-scoped tables
	delete from onto_events where project_id = p_project_id;
	delete from onto_signals where project_id = p_project_id;
	delete from onto_insights where project_id = p_project_id;
	delete from onto_sources where project_id = p_project_id;
	delete from onto_decisions where project_id = p_project_id;
	delete from onto_risks where project_id = p_project_id;
	delete from onto_milestones where project_id = p_project_id;
	delete from onto_metrics where project_id = p_project_id;
	delete from onto_outputs where project_id = p_project_id;
	delete from onto_documents where project_id = p_project_id;
	delete from onto_tasks where project_id = p_project_id;
	delete from onto_plans where project_id = p_project_id;
	delete from onto_requirements where project_id = p_project_id;
	delete from onto_goals where project_id = p_project_id;

	-- Finally remove the project
	delete from onto_projects where id = p_project_id;
end;
$$;

comment on function delete_onto_project(uuid) is
  'Deletes a project and all related ontology entities explicitly.';

grant execute on function delete_onto_project(uuid) to authenticated;
