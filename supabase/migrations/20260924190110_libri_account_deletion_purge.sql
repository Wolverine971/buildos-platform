-- supabase/migrations/20260924190110_libri_account_deletion_purge.sql
-- libri-migration: true
-- libri-allow-security-definer: account_deletion_storage_scope, purge_account_deletion
-- Tasker 103 (DEL): account deletion for Libri. Called by the web purge before
-- finalize_account_deletion_database(), because libraries.created_by and
-- image_upload_intents.requested_by RESTRICT the auth user delete.
--
-- A library the person created is deleted with everything in it unless another
-- member holds the owner role; then it is kept and created_by moves to that
-- owner (earliest owner membership). In libraries that survive, the person's
-- notes and their own upload bookkeeping (intents and the rows that hang off
-- them) are deleted; published images stay as library content, like shared
-- project contributions. Memberships are removed.
-- No Storage writes here: the web purge removes objects first, using
-- account_deletion_storage_scope() for the library ids and staging paths.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION libri.account_deletion_library_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = pg_catalog, libri
AS $function$
	SELECT COALESCE(array_agg(library.id ORDER BY library.id), '{}'::uuid[])
	FROM libri.libraries AS library
	WHERE library.created_by = p_user_id
		AND NOT EXISTS (
			SELECT 1
			FROM libri.library_members AS member
			WHERE member.library_id = library.id
				AND member.role = 'owner'
				AND member.user_id <> p_user_id
		);
$function$;

REVOKE ALL ON FUNCTION libri.account_deletion_library_ids(uuid)
	FROM PUBLIC, anon, authenticated, libri_worker, libri_frontend_reader;

CREATE OR REPLACE FUNCTION libri.account_deletion_storage_scope(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, libri
AS $function$
	WITH purged AS (
		SELECT libri.account_deletion_library_ids(p_user_id) AS ids
	),
	own_uploads AS (
		SELECT intent.id, intent.object_path
		FROM libri.image_upload_intents AS intent, purged
		WHERE intent.requested_by = p_user_id
			AND NOT (intent.library_id = ANY(purged.ids))
	),
	paths AS (
		SELECT upload.object_path FROM own_uploads AS upload
		UNION
		SELECT issuance.object_path
		FROM libri.image_upload_issuances AS issuance
		WHERE issuance.upload_id IN (SELECT id FROM own_uploads)
		UNION
		SELECT target.object_path
		FROM libri.image_upload_cleanup_targets AS target
		WHERE target.upload_id IN (SELECT id FROM own_uploads)
	)
	SELECT jsonb_build_object(
		'library_ids', to_jsonb((SELECT ids FROM purged)),
		'object_paths', COALESCE(
			(SELECT jsonb_agg(path.object_path ORDER BY path.object_path) FROM paths AS path),
			'[]'::jsonb
		)
	);
$function$;

REVOKE ALL ON FUNCTION libri.account_deletion_storage_scope(uuid)
	FROM PUBLIC, anon, authenticated, libri_worker, libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.account_deletion_storage_scope(uuid) TO service_role;

CREATE OR REPLACE FUNCTION libri.purge_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	v_library_ids uuid[];
	v_upload_ids uuid[];
	v_libraries_deleted integer;
	v_libraries_transferred integer;
	v_notes_deleted integer;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'User ID required';
	END IF;

	v_library_ids := libri.account_deletion_library_ids(p_user_id);
	v_upload_ids := ARRAY(
		SELECT intent.id
		FROM libri.image_upload_intents AS intent
		WHERE intent.library_id = ANY(v_library_ids) OR intent.requested_by = p_user_id
	);

	-- The upload pipeline RESTRICTs every step on the one before it, and on the
	-- library, so it is unwound leaf first.
	DELETE FROM libri.image_upload_cleanup_checks AS checks
	WHERE checks.library_id = ANY(v_library_ids)
		OR checks.target_id IN (
			SELECT target.id
			FROM libri.image_upload_cleanup_targets AS target
			WHERE target.upload_id = ANY(v_upload_ids)
		);
	DELETE FROM libri.image_upload_cleanup_targets
	WHERE library_id = ANY(v_library_ids) OR upload_id = ANY(v_upload_ids);
	DELETE FROM libri.image_upload_retirements
	WHERE library_id = ANY(v_library_ids) OR upload_id = ANY(v_upload_ids);
	DELETE FROM libri.image_upload_issuances
	WHERE library_id = ANY(v_library_ids) OR upload_id = ANY(v_upload_ids);
	DELETE FROM libri.image_upload_processing WHERE upload_id = ANY(v_upload_ids);
	DELETE FROM libri.image_upload_publications
	WHERE library_id = ANY(v_library_ids) OR upload_id = ANY(v_upload_ids);
	DELETE FROM libri.image_upload_intents WHERE id = ANY(v_upload_ids);

	-- The OCR guards refuse to drop admitted steps, items and images while an
	-- admission row exists, so admissions go first. A RESTRICT key is checked as
	-- soon as its parent is deleted inside a cascade, so every table with one
	-- (items, chunks, links, images) is emptied before its parent.
	DELETE FROM libri.ocr_batch_admissions WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.ocr_batch_items WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.ocr_asset_grants WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.provider_cost_reservations WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.research_steps WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.research_runs WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.derived_artifact_evidence WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.derived_artifacts WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.agent_profiles WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.entity_edges WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.notes WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.source_chunks WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.source_book_links WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.youtube_videos WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.youtube_channels WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.images WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.source_documents WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.sources WHERE library_id = ANY(v_library_ids);
	DELETE FROM libri.libraries WHERE id = ANY(v_library_ids);
	GET DIAGNOSTICS v_libraries_deleted = ROW_COUNT;

	DELETE FROM libri.notes WHERE owner_user_id = p_user_id;
	GET DIAGNOSTICS v_notes_deleted = ROW_COUNT;

	UPDATE libri.libraries AS library
	SET created_by = (
		SELECT member.user_id
		FROM libri.library_members AS member
		WHERE member.library_id = library.id
			AND member.role = 'owner'
			AND member.user_id <> p_user_id
		ORDER BY member.created_at, member.user_id
		LIMIT 1
	)
	WHERE library.created_by = p_user_id;
	GET DIAGNOSTICS v_libraries_transferred = ROW_COUNT;

	DELETE FROM libri.library_members WHERE user_id = p_user_id;

	RETURN jsonb_build_object(
		'libraries_deleted', v_libraries_deleted,
		'libraries_transferred', v_libraries_transferred,
		'notes_deleted', v_notes_deleted,
		'uploads_deleted', cardinality(v_upload_ids)
	);
END;
$function$;

REVOKE ALL ON FUNCTION libri.purge_account_deletion(uuid)
	FROM PUBLIC, anon, authenticated, libri_worker, libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.purge_account_deletion(uuid) TO service_role;

RESET statement_timeout;
RESET lock_timeout;
