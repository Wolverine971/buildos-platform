-- supabase/migrations/20261003120000_delete_onto_project_definer.sql
-- Restore delete_onto_project's owner rights and project-admin check.
--
-- 20260730020000 made this function SECURITY DEFINER because it deletes from
-- service-only tables (onto_assignments, onto_permissions, onto_event_sync,
-- onto_document_versions, legacy_entity_mappings, ...). 20260909034006 rewrote
-- it for calendar cleanup and dropped SECURITY DEFINER, its search_path, and
-- the admin check, so every signed-in hard delete failed with
-- "permission denied for table onto_assignments" (42501).
--
-- Callers: signed-in users (DELETE /api/onto/projects/[id] outside production,
-- /api/projects/[id], migration rollback) must be project admins. Service-role
-- and direct database callers (finalize_account_deletion_database,
-- cleanup_privacy_deleted_projects) carry no user and skip the check; anon
-- cannot execute the function.
CREATE OR REPLACE FUNCTION public.delete_onto_project(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_goal_ids uuid[];
	v_requirement_ids uuid[];
	v_plan_ids uuid[];
	v_task_ids uuid[];
	v_document_ids uuid[];
	v_source_ids uuid[];
	v_risk_ids uuid[];
	v_milestone_ids uuid[];
	v_metric_ids uuid[];
	v_signal_ids uuid[];
	v_insight_ids uuid[];
	v_event_ids uuid[];
	v_all_ids uuid[];
BEGIN
	IF p_project_id IS NULL THEN
		RAISE EXCEPTION 'Project ID required' USING ERRCODE = '22023';
	END IF;

	IF auth.uid() IS NOT NULL
		AND COALESCE(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(p_project_id, 'admin') THEN
		RAISE EXCEPTION 'Project admin access required' USING ERRCODE = '42501';
	END IF;

	-- Capture durable calendar cleanup before removing provider mappings.
	UPDATE public.onto_projects
	SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
	WHERE id = p_project_id;

	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_goal_ids FROM public.onto_goals WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_requirement_ids FROM public.onto_requirements WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_plan_ids FROM public.onto_plans WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_task_ids FROM public.onto_tasks WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_document_ids FROM public.onto_documents WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_source_ids FROM public.onto_sources WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_risk_ids FROM public.onto_risks WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_milestone_ids FROM public.onto_milestones WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_metric_ids FROM public.onto_metrics WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_signal_ids FROM public.onto_signals WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_insight_ids FROM public.onto_insights WHERE project_id = p_project_id;
	SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_event_ids FROM public.onto_events WHERE project_id = p_project_id;

	v_all_ids := array[p_project_id]
		|| v_goal_ids || v_requirement_ids || v_plan_ids || v_task_ids
		|| v_document_ids || v_source_ids || v_risk_ids || v_milestone_ids
		|| v_metric_ids || v_signal_ids || v_insight_ids || v_event_ids;

	-- Delete secondary records first
	DELETE FROM public.onto_event_sync WHERE event_id = any(v_event_ids);
	DELETE FROM public.onto_metric_points WHERE metric_id = any(v_metric_ids);
	DELETE FROM public.onto_document_versions WHERE document_id = any(v_document_ids);

	-- Remove edges/assignments/permissions referencing any of these entities
	DELETE FROM public.onto_edges WHERE src_id = any(v_all_ids) OR dst_id = any(v_all_ids);
	DELETE FROM public.onto_assignments
	WHERE object_id = any(v_all_ids)
		AND object_kind = any(array['project','plan','task','goal','document','requirement','milestone','risk','metric','event']);
	DELETE FROM public.onto_permissions
	WHERE object_id = any(v_all_ids)
		AND object_kind = any(array['project','plan','task','goal','document','requirement','milestone','risk','metric','event']);
	DELETE FROM public.legacy_entity_mappings
	WHERE onto_id = any(v_all_ids)
		AND onto_table = any(array[
			'onto_projects','onto_plans','onto_tasks','onto_goals','onto_documents',
			'onto_requirements','onto_milestones','onto_risks','onto_sources',
			'onto_metrics','onto_signals','onto_insights','onto_events'
		]);

	-- Delete project-scoped tables
	DELETE FROM public.onto_events WHERE project_id = p_project_id;
	DELETE FROM public.onto_signals WHERE project_id = p_project_id;
	DELETE FROM public.onto_insights WHERE project_id = p_project_id;
	DELETE FROM public.onto_sources WHERE project_id = p_project_id;
	DELETE FROM public.onto_risks WHERE project_id = p_project_id;
	DELETE FROM public.onto_milestones WHERE project_id = p_project_id;
	DELETE FROM public.onto_metrics WHERE project_id = p_project_id;
	DELETE FROM public.onto_documents WHERE project_id = p_project_id;
	DELETE FROM public.onto_tasks WHERE project_id = p_project_id;
	DELETE FROM public.onto_plans WHERE project_id = p_project_id;
	DELETE FROM public.onto_requirements WHERE project_id = p_project_id;
	DELETE FROM public.onto_goals WHERE project_id = p_project_id;

	-- Finally remove the project (project_calendars will cascade)
	DELETE FROM public.onto_projects WHERE id = p_project_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_onto_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_onto_project(uuid) TO authenticated, service_role;
