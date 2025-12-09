-- supabase/migrations/20250615000005_fsm_guard_failures.sql
-- Improve FSM transition diagnostic output by returning failing guards
-- and hiding satisfied requirements.

DROP FUNCTION IF EXISTS get_allowed_transitions(text, uuid);

CREATE OR REPLACE FUNCTION get_allowed_transitions(
    p_object_kind text,
    p_object_id uuid
)
RETURNS TABLE (
    event text,
    to_state text,
    guards jsonb,
    actions jsonb,
    can_run boolean,
    failed_guards jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_state text;
    v_type_key text;
    v_scope text;
    v_fsm jsonb;
    v_entity jsonb;
    v_transition jsonb;
    v_guard_pass boolean;
    v_failed_guards jsonb;
    v_guard jsonb;
BEGIN
    IF p_object_kind IS NULL OR p_object_id IS NULL THEN
        RETURN;
    END IF;

    CASE p_object_kind
        WHEN 'project' THEN
            SELECT to_jsonb(p.*), p.state_key, p.type_key
            INTO v_entity, v_current_state, v_type_key
            FROM onto_projects p
            WHERE p.id = p_object_id;
            v_scope := 'project';

        WHEN 'plan' THEN
            SELECT to_jsonb(pl.*), pl.state_key, pl.type_key
            INTO v_entity, v_current_state, v_type_key
            FROM onto_plans pl
            WHERE pl.id = p_object_id;
            v_scope := 'plan';

        WHEN 'task' THEN
            SELECT to_jsonb(t.*), t.state_key, 'task.basic'::text
            INTO v_entity, v_current_state, v_type_key
            FROM onto_tasks t
            WHERE t.id = p_object_id;
            v_scope := 'task';

        WHEN 'output' THEN
            SELECT to_jsonb(o.*), o.state_key, o.type_key
            INTO v_entity, v_current_state, v_type_key
            FROM onto_outputs o
            WHERE o.id = p_object_id;
            v_scope := 'output';

        WHEN 'document' THEN
            SELECT to_jsonb(d.*), coalesce(d.state_key, 'draft'), d.type_key
            INTO v_entity, v_current_state, v_type_key
            FROM onto_documents d
            WHERE d.id = p_object_id;
            v_scope := 'document';

        ELSE
            RETURN;
    END CASE;

    IF v_entity IS NULL OR v_type_key IS NULL OR v_scope IS NULL THEN
        RETURN;
    END IF;

    WITH RECURSIVE template_chain AS (
        SELECT
            t.id,
            t.parent_template_id,
            t.fsm,
            0 AS depth
        FROM onto_templates t
        WHERE t.type_key = v_type_key
            AND t.scope = v_scope

        UNION ALL

        SELECT
            parent.id,
            parent.parent_template_id,
            parent.fsm,
            template_chain.depth + 1
        FROM onto_templates parent
        JOIN template_chain ON template_chain.parent_template_id = parent.id
        WHERE template_chain.depth < 10
    )
    SELECT fsm
    INTO v_fsm
    FROM template_chain
    WHERE fsm IS NOT NULL
    ORDER BY depth
    LIMIT 1;

    IF v_fsm IS NULL THEN
        RETURN;
    END IF;

    FOR v_transition IN
        SELECT value
        FROM jsonb_array_elements(v_fsm->'transitions')
    LOOP
        IF v_transition->>'from' = v_current_state THEN
            v_failed_guards := '[]'::jsonb;

            IF v_transition ? 'guards' THEN
                FOR v_guard IN
                    SELECT value
                    FROM jsonb_array_elements(v_transition->'guards')
                LOOP
                    IF NOT onto_check_guard(v_guard, v_entity) THEN
                        v_failed_guards := v_failed_guards || jsonb_build_array(v_guard);
                    END IF;
                END LOOP;
            END IF;

            v_guard_pass := jsonb_array_length(v_failed_guards) = 0;

            event := v_transition->>'event';
            to_state := v_transition->>'to';
            guards := coalesce(v_transition->'guards', '[]'::jsonb);
            actions := coalesce(v_transition->'actions', '[]'::jsonb);
            can_run := v_guard_pass;
            failed_guards := v_failed_guards;
            RETURN NEXT;
        END IF;
    END LOOP;

    RETURN;
END;
$$;

COMMENT ON FUNCTION get_allowed_transitions(text, uuid) IS
  'Returns transitions for an entity plus guard metadata and any failing guards.';

GRANT EXECUTE ON FUNCTION get_allowed_transitions(text, uuid) TO authenticated;
