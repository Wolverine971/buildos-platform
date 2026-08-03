-- supabase/migrations/20260803010000_atomic_document_structure_mutation.sql
-- Atomically update the canonical project document tree, its history entry,
-- and the changed per-document child caches.

CREATE OR REPLACE FUNCTION public.onto_project_doc_structure_update_atomic(
	p_project_id uuid,
	p_expected_version integer,
	p_next_structure jsonb,
	p_change_type text,
	p_changed_by uuid DEFAULT NULL,
	p_children_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
	v_current_structure jsonb;
	v_current_version integer;
	v_next_version integer;
	v_changed_by uuid;
	v_requested_child_updates integer;
	v_updated_documents integer;
BEGIN
	IF p_project_id IS NULL
		OR p_expected_version IS NULL
		OR p_expected_version < 1
		OR p_next_structure IS NULL
		OR p_change_type IS NULL THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'doc_structure_invalid_arguments';
	END IF;

	IF p_change_type NOT IN ('create', 'move', 'delete', 'reorder', 'reorganize') THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'doc_structure_invalid_change_type';
	END IF;

	IF jsonb_typeof(p_next_structure) <> 'object'
		OR jsonb_typeof(p_next_structure->'root') <> 'array'
		OR jsonb_typeof(p_next_structure->'version') <> 'number'
		OR (p_next_structure->>'version') !~ '^[0-9]+$' THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'doc_structure_invalid_payload';
	END IF;

	v_next_version := (p_next_structure->>'version')::integer;
	IF v_next_version <> p_expected_version + 1 THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'doc_structure_invalid_next_version';
	END IF;

	IF jsonb_typeof(p_children_updates) <> 'array' THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'doc_structure_invalid_children_updates';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_children_updates) AS child_update(value)
		WHERE jsonb_typeof(child_update.value) <> 'object'
			OR jsonb_typeof(child_update.value->'document_id') <> 'string'
			OR jsonb_typeof(child_update.value->'children') <> 'array'
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'doc_structure_invalid_children_updates';
	END IF;

	SELECT
		count(*)::integer,
		count(DISTINCT (child_update.value->>'document_id')::uuid)::integer
	INTO v_requested_child_updates, v_updated_documents
	FROM jsonb_array_elements(p_children_updates) AS child_update(value);

	IF v_requested_child_updates <> v_updated_documents THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'doc_structure_duplicate_children_update';
	END IF;

	-- Do not expose project existence through this SECURITY DEFINER function.
	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(p_project_id, 'write') THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'doc_structure_access_denied';
	END IF;

	v_changed_by := CASE
		WHEN coalesce(auth.role(), '') = 'service_role' THEN p_changed_by
		ELSE public.current_actor_id()
	END;

	-- Serialize structure writers. A caller that read an older structure waits,
	-- observes the committed version, and receives the same conflict contract.
	SELECT project.doc_structure
	INTO v_current_structure
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id
		AND project.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0002',
			MESSAGE = 'doc_structure_project_not_found';
	END IF;

	IF v_current_structure IS NULL
		OR jsonb_typeof(v_current_structure) <> 'object' THEN
		v_current_version := 1;
	ELSIF jsonb_typeof(v_current_structure->'version') = 'number'
		AND (v_current_structure->>'version') ~ '^[0-9]+$' THEN
		v_current_version := (v_current_structure->>'version')::integer;
	ELSIF jsonb_typeof(v_current_structure->'version') = 'number' THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'doc_structure_invalid_stored_version';
	ELSE
		-- Match the application parser's legacy behavior for missing, null, or
		-- non-numeric versions while enforcing integer versions going forward.
		v_current_version := 1;
	END IF;

	IF v_current_version <> p_expected_version THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0001',
			MESSAGE = 'doc_structure_version_conflict',
			DETAIL = format(
				'expected_version=%s current_version=%s',
				p_expected_version,
				v_current_version
			);
	END IF;

	UPDATE public.onto_projects
	SET doc_structure = p_next_structure
	WHERE id = p_project_id;

	INSERT INTO public.onto_project_structure_history (
		project_id,
		doc_structure,
		version,
		changed_by,
		change_type
	) VALUES (
		p_project_id,
		p_next_structure,
		v_next_version,
		v_changed_by,
		p_change_type
	);

	WITH child_updates AS (
		SELECT
			(child_update.value->>'document_id')::uuid AS document_id,
			child_update.value->'children' AS children
		FROM jsonb_array_elements(p_children_updates) AS child_update(value)
	)
	UPDATE public.onto_documents AS document
	SET children = jsonb_build_object('children', child_updates.children)
	FROM child_updates
	WHERE document.id = child_updates.document_id
		AND document.project_id = p_project_id;
	GET DIAGNOSTICS v_updated_documents = ROW_COUNT;

	IF v_updated_documents <> v_requested_child_updates THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0001',
			MESSAGE = 'doc_structure_document_mismatch';
	END IF;

	RETURN p_next_structure;
END;
$$;

REVOKE ALL ON FUNCTION public.onto_project_doc_structure_update_atomic(
	uuid,
	integer,
	jsonb,
	text,
	uuid,
	jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.onto_project_doc_structure_update_atomic(
	uuid,
	integer,
	jsonb,
	text,
	uuid,
	jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.onto_project_doc_structure_update_atomic(
	uuid,
	integer,
	jsonb,
	text,
	uuid,
	jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.onto_project_doc_structure_update_atomic(
	uuid,
	integer,
	jsonb,
	text,
	uuid,
	jsonb
) TO service_role;

COMMENT ON FUNCTION public.onto_project_doc_structure_update_atomic(
	uuid,
	integer,
	jsonb,
	text,
	uuid,
	jsonb
) IS
	'Atomically applies one optimistic document-tree update, its history row, and changed document child caches.';
