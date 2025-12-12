-- supabase/migrations/20251211_remove_template_dependencies_from_rpc.sql
-- Remove template dependencies from RPC functions as part of template system removal
-- This migration:
-- 1. Updates get_allowed_transitions to use hardcoded FSM definitions
-- 2. Simplifies get_project_with_template to just return project data
-- 3. Drops get_template_catalog (no longer needed)

-- ============================================
-- STEP 1: Drop and recreate get_allowed_transitions
-- Now uses hardcoded FSM definitions instead of querying onto_templates
-- ============================================

DROP FUNCTION IF EXISTS get_allowed_transitions(text, uuid);

CREATE OR REPLACE FUNCTION get_allowed_transitions(
	p_object_kind text,
	p_object_id uuid
)
RETURNS TABLE (
	event text,
	to_state text,
	guards jsonb,
	actions jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
	v_current_state text;
	v_type_key text;
BEGIN
	IF p_object_kind IS NULL OR p_object_id IS NULL THEN
		RETURN;
	END IF;

	-- Get current state based on entity kind
	CASE p_object_kind
		WHEN 'project' THEN
			SELECT p.state_key, p.type_key
			INTO v_current_state, v_type_key
			FROM onto_projects p
			WHERE p.id = p_object_id;

		WHEN 'plan' THEN
			SELECT pl.state_key, pl.type_key
			INTO v_current_state, v_type_key
			FROM onto_plans pl
			WHERE pl.id = p_object_id;

		WHEN 'task' THEN
			SELECT t.state_key, 'task.basic'::text
			INTO v_current_state, v_type_key
			FROM onto_tasks t
			WHERE t.id = p_object_id;

		WHEN 'output' THEN
			SELECT o.state_key, o.type_key
			INTO v_current_state, v_type_key
			FROM onto_outputs o
			WHERE o.id = p_object_id;

		WHEN 'document' THEN
			SELECT COALESCE(d.state_key, 'draft'), d.type_key
			INTO v_current_state, v_type_key
			FROM onto_documents d
			WHERE d.id = p_object_id;

		ELSE
			-- Unsupported kind; return empty set
			RETURN;
	END CASE;

	IF v_current_state IS NULL THEN
		RETURN;
	END IF;

	-- Return hardcoded transitions based on entity kind and current state
	-- These are the standard state transitions for each entity type

	IF p_object_kind = 'project' THEN
		-- Project states: planning -> active -> completed, or -> cancelled from any
		CASE v_current_state
			WHEN 'planning' THEN
				event := 'activate'; to_state := 'active'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'cancel'; to_state := 'cancelled'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'active' THEN
				event := 'complete'; to_state := 'completed'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'cancel'; to_state := 'cancelled'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'pause'; to_state := 'planning'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'completed' THEN
				event := 'reopen'; to_state := 'active'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'cancelled' THEN
				event := 'reopen'; to_state := 'planning'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			ELSE
				-- Unknown state, no transitions
				RETURN;
		END CASE;

	ELSIF p_object_kind = 'task' THEN
		-- Task states: todo -> in_progress -> done, or -> blocked from in_progress
		CASE v_current_state
			WHEN 'todo' THEN
				event := 'start'; to_state := 'in_progress'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'complete'; to_state := 'done'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'in_progress' THEN
				event := 'complete'; to_state := 'done'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'block'; to_state := 'blocked'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'pause'; to_state := 'todo'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'blocked' THEN
				event := 'unblock'; to_state := 'in_progress'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'cancel'; to_state := 'todo'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'done' THEN
				event := 'reopen'; to_state := 'todo'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			ELSE
				RETURN;
		END CASE;

	ELSIF p_object_kind = 'plan' THEN
		-- Plan states: draft -> active -> completed
		CASE v_current_state
			WHEN 'draft' THEN
				event := 'activate'; to_state := 'active'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'active' THEN
				event := 'complete'; to_state := 'completed'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'pause'; to_state := 'draft'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'completed' THEN
				event := 'reopen'; to_state := 'active'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			ELSE
				RETURN;
		END CASE;

	ELSIF p_object_kind = 'output' THEN
		-- Output states: draft -> in_progress -> review -> published
		CASE v_current_state
			WHEN 'draft' THEN
				event := 'start'; to_state := 'in_progress'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'in_progress' THEN
				event := 'submit'; to_state := 'review'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'pause'; to_state := 'draft'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'review' THEN
				event := 'publish'; to_state := 'published'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'reject'; to_state := 'in_progress'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'published' THEN
				event := 'unpublish'; to_state := 'draft'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			ELSE
				RETURN;
		END CASE;

	ELSIF p_object_kind = 'document' THEN
		-- Document states: draft -> review -> published
		CASE v_current_state
			WHEN 'draft' THEN
				event := 'submit'; to_state := 'review'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'publish'; to_state := 'published'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'review' THEN
				event := 'publish'; to_state := 'published'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
				event := 'reject'; to_state := 'draft'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			WHEN 'published' THEN
				event := 'unpublish'; to_state := 'draft'; guards := '[]'::jsonb; actions := '[]'::jsonb;
				RETURN NEXT;
			ELSE
				RETURN;
		END CASE;
	END IF;

	RETURN;
END;
$$;

COMMENT ON FUNCTION get_allowed_transitions(text, uuid) IS
  'Returns allowed state transitions for an entity using hardcoded FSM definitions. No longer depends on onto_templates table.';

GRANT EXECUTE ON FUNCTION get_allowed_transitions(text, uuid) TO authenticated;

-- ============================================
-- STEP 2: Simplify get_project_with_template
-- Remove template join, keep only project and context_document
-- Note: context_document_id column was removed in 20251126_remove_context_document_id.sql
-- Context documents are now linked via onto_edges with rel_type='has_context_document'
-- ============================================

DROP FUNCTION IF EXISTS get_project_with_template(uuid);

CREATE OR REPLACE FUNCTION get_project_with_template(p_project_id uuid)
RETURNS TABLE(project jsonb, template jsonb, context_document jsonb)
LANGUAGE sql
STABLE
AS $$
	SELECT
		to_jsonb(p.*) AS project,
		NULL::jsonb AS template,  -- Always NULL, template system removed
		(
			SELECT to_jsonb(d.*)
			FROM onto_edges e
			JOIN onto_documents d ON d.id = e.dst_id
			WHERE e.src_kind = 'project'
			  AND e.src_id = p.id
			  AND e.dst_kind = 'document'
			  AND e.rel = 'has_context_document'
			LIMIT 1
		) AS context_document
	FROM onto_projects p
	WHERE p.id = p_project_id;
$$;

COMMENT ON FUNCTION get_project_with_template(uuid) IS
  'Returns project data with context document. Template field is always NULL (template system removed). Context document is fetched via onto_edges. Kept for backwards compatibility.';

GRANT EXECUTE ON FUNCTION get_project_with_template(uuid) TO authenticated;

-- ============================================
-- STEP 3: Drop get_template_catalog
-- No longer needed after template system removal
-- ============================================

DROP FUNCTION IF EXISTS get_template_catalog(text, text, text, text, integer, integer);

-- ============================================
-- STEP 4: Drop onto_guards_pass if it exists (was used by old get_allowed_transitions)
-- Keep it for now as it may be used elsewhere, but mark as deprecated
-- ============================================

-- Note: onto_guards_pass is kept but no longer called by get_allowed_transitions
-- It can be dropped in a future cleanup migration if confirmed unused

-- ============================================
-- Verification queries (commented out, for manual testing)
-- ============================================

-- Test get_allowed_transitions for each entity kind:
-- SELECT * FROM get_allowed_transitions('project', 'some-project-uuid');
-- SELECT * FROM get_allowed_transitions('task', 'some-task-uuid');
-- SELECT * FROM get_allowed_transitions('plan', 'some-plan-uuid');
-- SELECT * FROM get_allowed_transitions('output', 'some-output-uuid');
-- SELECT * FROM get_allowed_transitions('document', 'some-document-uuid');

-- Test get_project_with_template:
-- SELECT * FROM get_project_with_template('some-project-uuid');
