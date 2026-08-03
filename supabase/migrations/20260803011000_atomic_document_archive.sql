-- supabase/migrations/20260803011000_atomic_document_archive.sql
-- Archive document rows in the same transaction that removes them from the
-- canonical project document tree, records history, and updates child caches.

CREATE OR REPLACE FUNCTION public.onto_document_archive_atomic(
	p_project_id uuid,
	p_document_id uuid,
	p_document_ids uuid[],
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
	v_requested_documents integer;
	v_locked_documents integer;
	v_target_updated_at timestamptz;
	v_archived_document jsonb;
	v_structure jsonb := NULL;
BEGIN
	IF p_project_id IS NULL
		OR p_document_id IS NULL
		OR p_document_ids IS NULL
		OR cardinality(p_document_ids) < 1
		OR p_expected_updated_at IS NULL
		OR p_children_updates IS NULL THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'document_archive_invalid_arguments';
	END IF;

	IF array_ndims(p_document_ids) <> 1
		OR array_position(p_document_ids, NULL::uuid) IS NOT NULL
		OR array_position(p_document_ids, p_document_id) IS NULL THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'document_archive_invalid_arguments';
	END IF;

	SELECT count(*)::integer, count(DISTINCT document_id)::integer
	INTO v_requested_documents, v_locked_documents
	FROM unnest(p_document_ids) AS requested(document_id);

	IF v_requested_documents <> v_locked_documents THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'document_archive_invalid_arguments';
	END IF;

	IF (p_expected_structure_version IS NULL) <> (p_next_structure IS NULL) THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'document_archive_invalid_arguments';
	END IF;

	IF p_expected_structure_version IS NULL
		AND p_children_updates <> '[]'::jsonb THEN
		RAISE EXCEPTION USING
			ERRCODE = '22023',
			MESSAGE = 'document_archive_invalid_arguments';
	END IF;

	-- Match the nested tree command's authorization contract without exposing
	-- whether the project or any requested document exists.
	IF coalesce(auth.role(), '') <> 'service_role'
		AND NOT public.current_actor_has_project_member_access(p_project_id, 'write') THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'document_archive_access_denied';
	END IF;

	-- Serialize all structure writers before locking document rows. This lock
	-- order matches the canonical tree command and prevents tree/archive races.
	PERFORM 1
	FROM public.onto_projects AS project
	WHERE project.id = p_project_id
		AND project.deleted_at IS NULL
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0002',
			MESSAGE = 'document_archive_project_not_found';
	END IF;

	PERFORM document.id
	FROM public.onto_documents AS document
	WHERE document.project_id = p_project_id
		AND document.id = ANY(p_document_ids)
		AND document.deleted_at IS NULL
	ORDER BY document.id
	FOR UPDATE;
	GET DIAGNOSTICS v_locked_documents = ROW_COUNT;

	IF v_locked_documents <> v_requested_documents THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0001',
			MESSAGE = 'document_archive_document_mismatch';
	END IF;

	SELECT document.updated_at
	INTO v_target_updated_at
	FROM public.onto_documents AS document
	WHERE document.id = p_document_id
		AND document.project_id = p_project_id
		AND document.deleted_at IS NULL;

	IF v_target_updated_at IS DISTINCT FROM p_expected_updated_at THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0001',
			MESSAGE = 'document_archive_version_conflict';
	END IF;

	IF p_expected_structure_version IS NOT NULL THEN
		v_structure := public.onto_project_doc_structure_update_atomic(
			p_project_id,
			p_expected_structure_version,
			p_next_structure,
			'delete',
			p_changed_by,
			p_children_updates
		);
	END IF;

	UPDATE public.onto_documents AS document
	SET state_key = 'archived',
		updated_at = now()
	WHERE document.project_id = p_project_id
		AND document.id = ANY(p_document_ids)
		AND document.deleted_at IS NULL;
	GET DIAGNOSTICS v_locked_documents = ROW_COUNT;

	IF v_locked_documents <> v_requested_documents THEN
		RAISE EXCEPTION USING
			ERRCODE = 'P0001',
			MESSAGE = 'document_archive_document_mismatch';
	END IF;

	SELECT to_jsonb(document)
	INTO v_archived_document
	FROM public.onto_documents AS document
	WHERE document.id = p_document_id
		AND document.project_id = p_project_id;

	RETURN jsonb_build_object(
		'document', v_archived_document,
		'structure', v_structure,
		'archived_document_ids', to_jsonb(p_document_ids)
	);
END;
$$;

REVOKE ALL ON FUNCTION public.onto_document_archive_atomic(
	uuid,
	uuid,
	uuid[],
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.onto_document_archive_atomic(
	uuid,
	uuid,
	uuid[],
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.onto_document_archive_atomic(
	uuid,
	uuid,
	uuid[],
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.onto_document_archive_atomic(
	uuid,
	uuid,
	uuid[],
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) TO service_role;

COMMENT ON FUNCTION public.onto_document_archive_atomic(
	uuid,
	uuid,
	uuid[],
	timestamptz,
	integer,
	jsonb,
	uuid,
	jsonb
) IS
	'Atomically archives document rows and applies the related canonical tree mutation.';
