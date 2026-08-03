-- supabase/migrations/20260803012000_atomic_document_restore.sql
-- Restore an archived document and clean up any legacy tree node in one
-- transaction. The common already-unlinked path verifies but does not rewrite
-- the canonical project structure.

CREATE OR REPLACE FUNCTION public.onto_document_restore_atomic(
	p_project_id uuid,
	p_document_id uuid,
	p_restore_state_key text,
	p_expected_updated_at timestamptz,
	p_expected_structure_version integer,
	p_next_structure jsonb,
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
	v_current_structure_version integer;
	v_target_updated_at timestamptz;
	v_target_state text;
	v_restored_document jsonb;
BEGIN
	IF p_project_id IS NULL
		OR p_document_id IS NULL
		OR p_restore_state_key IS NULL
		OR p_restore_state_key NOT IN ('draft', 'in_review', 'ready', 'published')
		OR p_expected_updated_at IS NULL
		OR p_expected_structure_version IS NULL
		OR p_expected_structure_version < 1
		OR p_children_updates IS NULL THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'document_restore_invalid_arguments';
	END IF;

	IF p_next_structure IS NULL AND p_children_updates <> '[]'::jsonb THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'document_restore_invalid_arguments';
	END IF;

	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(p_project_id, 'write') THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'document_restore_access_denied';
	END IF;

	SELECT project.doc_structure
	INTO v_current_structure
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id
		AND project.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0002',
			MESSAGE = 'document_restore_project_not_found';
	END IF;

	v_current_structure_version := CASE
		WHEN v_current_structure IS NULL
			OR jsonb_typeof(v_current_structure) <> 'object' THEN 1
		WHEN jsonb_typeof(v_current_structure->'version') = 'number'
			AND (v_current_structure->>'version') ~ '^[0-9]+$'
			THEN (v_current_structure->>'version')::integer
		ELSE 1
	END;

	IF v_current_structure_version <> p_expected_structure_version THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0001',
			MESSAGE = 'document_restore_structure_version_conflict';
	END IF;

	SELECT document.updated_at, document.state_key::text
	INTO v_target_updated_at, v_target_state
	FROM public.onto_documents AS document
	WHERE document.id = p_document_id
		AND document.project_id = p_project_id
		AND document.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0002',
			MESSAGE = 'document_restore_document_not_found';
	END IF;

	IF v_target_updated_at IS DISTINCT FROM p_expected_updated_at THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0001',
			MESSAGE = 'document_restore_version_conflict';
	END IF;

	IF v_target_state <> 'archived' THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'document_restore_not_archived';
	END IF;

	IF p_next_structure IS NOT NULL THEN
		v_current_structure := public.onto_project_doc_structure_update_atomic(
			p_project_id,
			p_expected_structure_version,
			p_next_structure,
			'delete',
			p_changed_by,
			p_children_updates
		);
	END IF;

	UPDATE public.onto_documents AS document
	SET state_key = p_restore_state_key::public.document_state,
		updated_at = now()
	WHERE document.id = p_document_id
		AND document.project_id = p_project_id
		AND document.deleted_at IS NULL
	RETURNING to_jsonb(document) INTO v_restored_document;

	IF v_restored_document IS NULL THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0001',
			MESSAGE = 'document_restore_document_mismatch';
	END IF;

	RETURN jsonb_build_object(
		'document', v_restored_document,
		'structure', v_current_structure
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_document_restore_atomic(
	uuid,
	uuid,
	text,
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.onto_document_restore_atomic(
	uuid,
	uuid,
	text,
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.onto_document_restore_atomic(
	uuid,
	uuid,
	text,
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.onto_document_restore_atomic(
	uuid,
	uuid,
	text,
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) TO service_role;

COMMENT ON FUNCTION public.onto_document_restore_atomic(
	uuid,
	uuid,
	text,
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) IS
	'Atomically restores an archived document and removes any stale legacy tree node.';
