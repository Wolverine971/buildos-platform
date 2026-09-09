-- supabase/tests/fixtures/project_calendar_delete_base.sql
-- Minimal disposable database fixture for project calendar deletion tests.
\set ON_ERROR_STOP on
CREATE TABLE public.onto_actors (id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.onto_projects (id uuid PRIMARY KEY, created_by uuid, deleted_at timestamptz, archived_at timestamptz, updated_at timestamptz);
CREATE TABLE public.project_calendars (id uuid PRIMARY KEY, project_id uuid REFERENCES onto_projects ON DELETE CASCADE, user_id uuid, calendar_id text, calendar_source_id uuid, sync_enabled boolean);
CREATE TABLE public.onto_events (id uuid PRIMARY KEY, project_id uuid REFERENCES onto_projects ON DELETE CASCADE, created_by uuid, deleted_at timestamptz, updated_at timestamptz, props jsonb, sync_status text, sync_error text);
CREATE TABLE public.onto_event_sync (id uuid PRIMARY KEY, event_id uuid REFERENCES onto_events ON DELETE CASCADE, project_calendar_id uuid REFERENCES project_calendars ON DELETE CASCADE, user_id uuid, provider text, external_event_id text, external_calendar_id text, calendar_source_id uuid, sync_status text, sync_error text);
CREATE TABLE public.task_calendar_events (id uuid PRIMARY KEY, project_calendar_id uuid REFERENCES project_calendars ON DELETE CASCADE, user_id uuid, calendar_event_id text, calendar_id text, calendar_source_id uuid, sync_status text);
CREATE TABLE public.queue_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, job_type text, metadata jsonb, priority integer, scheduled_for timestamptz, dedup_key text UNIQUE);
CREATE FUNCTION public.add_queue_job(p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer DEFAULT 10, p_scheduled_for timestamptz DEFAULT now(), p_dedup_key text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO queue_jobs (user_id,job_type,metadata,priority,scheduled_for,dedup_key)
  VALUES (p_user_id,p_job_type,p_metadata,p_priority,p_scheduled_for,p_dedup_key)
  ON CONFLICT (dedup_key) DO UPDATE SET dedup_key=excluded.dedup_key RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['onto_tasks','onto_plans','onto_goals','onto_documents','onto_milestones','onto_risks','onto_requirements','onto_sources','onto_metrics','onto_signals','onto_insights'] LOOP
    EXECUTE format('CREATE TABLE public.%I (id uuid PRIMARY KEY, project_id uuid, deleted_at timestamptz, archived_at timestamptz, updated_at timestamptz)', t);
  END LOOP;
END; $$;
CREATE TABLE onto_metric_points (metric_id uuid);
CREATE TABLE onto_document_versions (document_id uuid);
CREATE TABLE onto_edges (src_id uuid, dst_id uuid);
CREATE TABLE onto_assignments (object_id uuid, object_kind text);
CREATE TABLE onto_permissions (object_id uuid, object_kind text);
CREATE TABLE legacy_entity_mappings (onto_id uuid, onto_table text);
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

GRANT EXECUTE ON FUNCTION public.soft_delete_onto_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_onto_project(uuid) TO service_role;

