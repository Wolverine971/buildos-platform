-- supabase/migrations/20260909034006_project_calendar_delete_cleanup.sql
-- Deploy the calendar-sync webhook with deletionSnapshot support BEFORE this migration.
-- Calendar deletion is durable work in the same transaction as project deletion.
-- Keep provider identity in queue metadata: hard deletion removes local mappings.
CREATE OR REPLACE FUNCTION public.queue_deleted_project_calendar_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_target record;
    v_now timestamptz := now();
BEGIN
    -- Called only by the project trigger, after the caller passes project RLS.
    -- Queue admission needs definer rights to process every member's mapping.
    UPDATE public.onto_events
    SET deleted_at = COALESCE(deleted_at, v_now), updated_at = v_now
    WHERE project_id = OLD.id AND deleted_at IS NULL;

    FOR v_target IN
        WITH targets AS (
            SELECT e.id AS event_id, s.id AS sync_row_id,
                COALESCE(s.user_id, pc.user_id) AS user_id,
                s.external_event_id,
                COALESCE(s.external_calendar_id, pc.calendar_id) AS calendar_id,
                COALESCE(s.calendar_source_id, pc.calendar_source_id) AS calendar_source_id
            FROM public.onto_events e
            JOIN public.onto_event_sync s ON s.event_id = e.id
            LEFT JOIN public.project_calendars pc ON pc.id = s.project_calendar_id
            WHERE e.project_id = OLD.id AND s.provider = 'google'
                AND s.sync_status IS DISTINCT FROM 'cancelled'
            UNION ALL
            -- Older events may only retain provider identity in props.
            SELECT e.id, NULL::uuid, COALESCE(pc.user_id, a.user_id),
                e.props->>'external_event_id',
                COALESCE(NULLIF(e.props->>'external_calendar_id', ''), pc.calendar_id),
                COALESCE(pc.calendar_source_id, CASE
                    WHEN e.props->>'external_calendar_source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (e.props->>'external_calendar_source_id')::uuid END)
            FROM public.onto_events e
            LEFT JOIN public.onto_actors a ON a.id = e.created_by
            LEFT JOIN public.project_calendars pc ON pc.project_id = OLD.id
                AND pc.calendar_id = e.props->>'external_calendar_id'
            WHERE e.project_id = OLD.id AND NULLIF(e.props->>'external_event_id', '') IS NOT NULL
                AND e.sync_status IS DISTINCT FROM 'cancelled'
                AND NOT EXISTS (SELECT 1 FROM public.onto_event_sync s WHERE s.event_id = e.id)
            UNION ALL
            -- Preserve legacy task-calendar copies too, without deleting a whole calendar.
            SELECT t.id, NULL::uuid, t.user_id, t.calendar_event_id, t.calendar_id,
                COALESCE(t.calendar_source_id, pc.calendar_source_id)
            FROM public.task_calendar_events t
            JOIN public.project_calendars pc ON pc.id = t.project_calendar_id
            WHERE pc.project_id = OLD.id AND COALESCE(t.sync_status::text, '') NOT IN ('deleted', 'cancelled')
        )
        SELECT DISTINCT ON (user_id, calendar_id, external_event_id) * FROM targets
        WHERE user_id IS NOT NULL AND NULLIF(calendar_id, '') IS NOT NULL
            AND NULLIF(external_event_id, '') IS NOT NULL
        ORDER BY user_id, calendar_id, external_event_id, sync_row_id NULLS LAST
    LOOP
        PERFORM public.add_queue_job(
            p_user_id := v_target.user_id,
            p_job_type := 'sync_calendar',
            p_metadata := jsonb_build_object(
                'kind', 'onto_project_event_sync', 'action', 'delete',
                'eventId', v_target.event_id, 'projectId', OLD.id,
                'targetUserId', v_target.user_id, 'createCalendarIfMissing', false,
                'deletionSnapshot', jsonb_strip_nulls(jsonb_build_object(
                    'externalEventId', v_target.external_event_id,
                    'calendarId', v_target.calendar_id,
                    'calendarSourceId', v_target.calendar_source_id,
                    'syncRowId', v_target.sync_row_id
                ))
            ),
            p_priority := 5,
            p_dedup_key := 'project-calendar-delete:' || OLD.id::text || ':' ||
                v_target.user_id::text || ':' || md5(v_target.calendar_id || ':' || v_target.external_event_id)
        );
        UPDATE public.onto_event_sync SET sync_status = 'pending', sync_error = NULL
        WHERE id = v_target.sync_row_id;
        UPDATE public.onto_events SET sync_status = 'pending', sync_error = NULL
        WHERE id = v_target.event_id;
    END LOOP;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_deleted_project_calendar_cleanup() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER queue_project_calendar_cleanup_on_soft_delete
BEFORE UPDATE OF deleted_at ON public.onto_projects
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION public.queue_deleted_project_calendar_cleanup();

CREATE TRIGGER queue_project_calendar_cleanup_on_hard_delete
BEFORE DELETE ON public.onto_projects
FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_project_calendar_cleanup();

-- A provider create may finish after soft deletion took its mapping snapshot.
CREATE OR REPLACE FUNCTION public.queue_late_deleted_project_event_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_event record;
    v_calendar record;
    v_user_id uuid;
    v_calendar_id text;
BEGIN
    SELECT e.id, e.project_id, p.deleted_at INTO v_event FROM public.onto_events e
    JOIN public.onto_projects p ON p.id = e.project_id
    WHERE e.id = NEW.event_id
    -- Serialize mapping persistence with the project's deletion snapshot.
    FOR SHARE OF p;
    IF NOT FOUND OR v_event.deleted_at IS NULL OR NEW.provider <> 'google'
        OR NEW.sync_status = 'cancelled' THEN RETURN NEW; END IF;
    SELECT user_id, calendar_id, calendar_source_id INTO v_calendar
    FROM public.project_calendars WHERE id = NEW.project_calendar_id;
    v_user_id := COALESCE(NEW.user_id, v_calendar.user_id);
    v_calendar_id := COALESCE(NEW.external_calendar_id, v_calendar.calendar_id);
    IF v_user_id IS NULL OR NULLIF(v_calendar_id, '') IS NULL THEN RETURN NEW; END IF;
    PERFORM public.add_queue_job(
        p_user_id := v_user_id, p_job_type := 'sync_calendar', p_priority := 5,
        p_metadata := jsonb_build_object(
            'kind', 'onto_project_event_sync', 'action', 'delete',
            'eventId', NEW.event_id, 'projectId', v_event.project_id, 'targetUserId', v_user_id,
            'createCalendarIfMissing', false,
            'deletionSnapshot', jsonb_strip_nulls(jsonb_build_object(
                'externalEventId', NEW.external_event_id, 'calendarId', v_calendar_id,
                'calendarSourceId', COALESCE(NEW.calendar_source_id, v_calendar.calendar_source_id),
                'syncRowId', NEW.id
            ))
        ),
        p_dedup_key := 'project-calendar-delete:' || v_event.project_id::text || ':' ||
            v_user_id::text || ':' || md5(v_calendar_id || ':' || NEW.external_event_id)
    );
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_late_deleted_project_event_cleanup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER queue_late_deleted_project_event_cleanup
AFTER INSERT OR UPDATE OF external_event_id ON public.onto_event_sync
FOR EACH ROW EXECUTE FUNCTION public.queue_late_deleted_project_event_cleanup();

-- The hard-delete RPC explicitly removes children before deleting the project.
-- Mark deletion first so the trigger captures mappings before those deletes run,
-- including projects soft-deleted before this cleanup mechanism was deployed.
CREATE OR REPLACE FUNCTION public.delete_onto_project(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
	v_goal_ids uuid[] := coalesce((select array_agg(id) from onto_goals where project_id = p_project_id), '{}'::uuid[]);
	v_requirement_ids uuid[] := coalesce((select array_agg(id) from onto_requirements where project_id = p_project_id), '{}'::uuid[]);
	v_plan_ids uuid[] := coalesce((select array_agg(id) from onto_plans where project_id = p_project_id), '{}'::uuid[]);
	v_task_ids uuid[] := coalesce((select array_agg(id) from onto_tasks where project_id = p_project_id), '{}'::uuid[]);
	v_document_ids uuid[] := coalesce((select array_agg(id) from onto_documents where project_id = p_project_id), '{}'::uuid[]);
	v_source_ids uuid[] := coalesce((select array_agg(id) from onto_sources where project_id = p_project_id), '{}'::uuid[]);
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

	-- Capture durable calendar cleanup before removing provider mappings.
	UPDATE public.onto_projects
	SET deleted_at = COALESCE(deleted_at, now()), updated_at = now()
	WHERE id = p_project_id;

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

	-- Delete secondary records first
	DELETE FROM onto_event_sync WHERE event_id = any(v_event_ids);
	DELETE FROM onto_metric_points WHERE metric_id = any(v_metric_ids);
	DELETE FROM onto_document_versions WHERE document_id = any(v_document_ids);

	-- Remove edges/assignments/permissions referencing any of these entities
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

	-- Delete project-scoped tables
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

	-- Finally remove the project (project_calendars will cascade)
	DELETE FROM onto_projects WHERE id = p_project_id;
END;
$function$;
