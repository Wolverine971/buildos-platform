-- packages/shared-types/src/functions/finalize_draft_project.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.finalize_draft_project(p_draft_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_project_id UUID;
    v_draft RECORD;
    v_task RECORD;
    v_new_task_id UUID;
BEGIN
    -- Get the draft
    SELECT * INTO v_draft
    FROM project_drafts
    WHERE id = p_draft_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft not found or not owned by user';
    END IF;

    IF v_draft.finalized_project_id IS NOT NULL THEN
        RAISE EXCEPTION 'Draft already finalized';
    END IF;

    -- Create the project
    INSERT INTO projects (
        user_id, name, slug, description, context, executive_summary,
        status, tags, start_date, end_date,
        core_integrity_ideals, core_people_bonds, core_goals_momentum,
        core_meaning_identity, core_reality_understanding, core_trust_safeguards,
        core_opportunity_freedom, core_power_resources, core_harmony_integration,
        calendar_color_id, calendar_settings, calendar_sync_enabled,
        source, source_metadata
    )
    SELECT
        user_id, name, slug, description, context, executive_summary,
        status, tags, start_date, end_date,
        core_integrity_ideals, core_people_bonds, core_goals_momentum,
        core_meaning_identity, core_reality_understanding, core_trust_safeguards,
        core_opportunity_freedom, core_power_resources, core_harmony_integration,
        calendar_color_id, calendar_settings, calendar_sync_enabled,
        'conversational_agent', jsonb_build_object('draft_id', id)
    FROM project_drafts
    WHERE id = p_draft_id
    RETURNING id INTO v_project_id;

    -- Create tasks from draft_tasks
    FOR v_task IN
        SELECT * FROM draft_tasks
        WHERE draft_project_id = p_draft_id
        ORDER BY parent_task_id NULLS FIRST -- Parents first
    LOOP
        INSERT INTO tasks (
            user_id, project_id, title, description, details,
            priority, status, task_type,
            start_date, duration_minutes,
            recurrence_pattern, recurrence_ends, recurrence_end_source,
            task_steps, source, source_calendar_event_id, outdated
        )
        VALUES (
            v_task.user_id, v_project_id, v_task.title, v_task.description, v_task.details,
            v_task.priority, v_task.status, v_task.task_type,
            v_task.start_date, v_task.duration_minutes,
            v_task.recurrence_pattern, v_task.recurrence_ends, v_task.recurrence_end_source,
            v_task.task_steps, 'conversational_agent', v_task.source_calendar_event_id, v_task.outdated
        )
        RETURNING id INTO v_new_task_id;

        -- Update the draft task with finalized ID for reference
        UPDATE draft_tasks
        SET finalized_task_id = v_new_task_id
        WHERE id = v_task.id;
    END LOOP;

    -- Mark draft as completed
    UPDATE project_drafts
    SET
        completed_at = CURRENT_TIMESTAMP,
        finalized_project_id = v_project_id
    WHERE id = p_draft_id;

    RETURN v_project_id;
END;
$function$
