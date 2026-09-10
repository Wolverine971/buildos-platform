-- libri-migration: true
-- libri-allow-security-definer: reserve_image_upload
-- Pending-slot bookkeeping only. No Storage operations, account/catalog deletion,
-- daily-quota release, upload activation or worker grants.
-- Deploy only after mandatory issuance-broker rollout with upload admission off.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE libri.image_upload_intents
 ADD COLUMN quota_policy_version smallint NOT NULL DEFAULT 0,
 ADD COLUMN pending_slot_released_at timestamptz,
 ADD CONSTRAINT image_upload_intents_quota_policy CHECK (quota_policy_version IN (0,1)),
 ADD CONSTRAINT image_upload_intents_pending_release CHECK (
  pending_slot_released_at IS NULL OR (
   quota_policy_version=1 AND status='cleanup_pending' AND submitted_at IS NULL
   AND isfinite(pending_slot_released_at)
   AND pending_slot_released_at>=created_at AND pending_slot_released_at>=expires_at));
-- Never backfill or change the default: pre-ledger / direct-insert reservations
-- are unproven. Only fresh admission through the updated RPC opts into version 1.
-- Policy 0: legacy/unproven. Policy 1: admitted after the mandatory broker rollout.
-- A pending-slot receipt is not proof of physical Storage deletion.

CREATE FUNCTION libri.release_unissued_image_upload_slot(p_library_id uuid,p_upload_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri SET lock_timeout = '2s' SET statement_timeout = '5s'
AS $function$
DECLARE
 item libri.image_upload_intents;
 retirement libri.image_upload_retirements;
 stamp timestamptz;
BEGIN
 IF p_library_id IS NULL OR p_upload_id IS NULL THEN
  RAISE EXCEPTION 'Invalid upload settlement identity' USING ERRCODE='22023';
 END IF;
 -- Serialize with admission/issuance/retirement. Membership revocation must not
 -- prevent bookkeeping, and disabled admission does not prevent safe settlement.
 PERFORM library_id FROM libri.image_upload_controls WHERE library_id=p_library_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO item FROM libri.image_upload_intents
  WHERE library_id=p_library_id AND id=p_upload_id FOR UPDATE;
 IF item.id IS NULL THEN RETURN false; END IF;
 stamp:=clock_timestamp();
 IF item.quota_policy_version<>1 OR item.status<>'cleanup_pending'
  OR item.submitted_at IS NOT NULL OR NOT isfinite(item.expires_at)
  OR item.expires_at>stamp THEN RETURN false; END IF;
 SELECT * INTO retirement FROM libri.image_upload_retirements
  WHERE library_id=p_library_id AND upload_id=item.id;
 IF retirement.upload_id IS NULL OR retirement.outcome<>'expired'
  OR retirement.protected_publication_id IS NOT NULL
  OR NOT isfinite(retirement.retired_at) OR retirement.retired_at<item.expires_at
  OR retirement.retired_at>stamp THEN RETURN false; END IF;
 -- Any attempt is evidence of possible bytes, even without an observed response
 -- or after its token expires. This first policy cannot settle issued uploads.
 IF EXISTS (SELECT 1 FROM libri.image_upload_issuances WHERE upload_id=item.id)
  OR EXISTS (SELECT 1 FROM libri.image_upload_processing WHERE upload_id=item.id)
  OR EXISTS (SELECT 1 FROM libri.image_upload_publications WHERE upload_id=item.id)
  OR EXISTS (SELECT 1 FROM libri.images WHERE bucket_id='libri-assets' AND object_path=item.object_path)
  OR (SELECT count(*) FROM libri.image_upload_cleanup_targets WHERE upload_id=item.id)<>1
  OR NOT EXISTS (SELECT 1 FROM libri.image_upload_cleanup_targets
   WHERE library_id=item.library_id AND upload_id=item.id AND kind='staging'
    AND publication_id IS NULL AND object_path=item.object_path) THEN RETURN false; END IF;
 -- Replays acknowledge the same settled record without moving its timestamp.
 IF item.pending_slot_released_at IS NULL THEN
  UPDATE libri.image_upload_intents SET pending_slot_released_at=stamp WHERE id=item.id;
 END IF;
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION libri.release_unissued_image_upload_slot(uuid,uuid)
 FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.release_unissued_image_upload_slot(uuid,uuid) TO service_role;

-- Existing admission is preserved except the pending filter and fresh-row policy.
CREATE OR REPLACE FUNCTION libri.reserve_image_upload(
	p_library_id uuid, p_book_id uuid, p_idempotency_key text, p_file jsonb
)
RETURNS libri.image_upload_intents
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, libri
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $function$
DECLARE
	caller uuid := auth.uid();
	member_role text;
	controls libri.image_upload_controls;
	intent libri.image_upload_intents;
	chapter uuid;
	new_id uuid;
	stamp timestamptz;
	extension text;
BEGIN
	IF caller IS NULL THEN RAISE EXCEPTION 'Library editor required' USING ERRCODE = '42501'; END IF;
	SELECT member.role INTO member_role FROM libri.library_members member
	WHERE member.library_id = p_library_id AND member.user_id = caller FOR SHARE;
	IF member_role IS NULL OR member_role NOT IN ('owner', 'editor') THEN
		RAISE EXCEPTION 'Library editor required' USING ERRCODE = '42501';
	END IF;
	-- This one Libri-only lock serializes concurrent quota checks and retry keys.
	SELECT control.* INTO controls FROM libri.image_upload_controls control
	WHERE control.library_id = p_library_id FOR UPDATE;
	IF controls.library_id IS NULL OR NOT controls.admission_enabled THEN
		RAISE EXCEPTION 'Upload admission is disabled' USING ERRCODE = '42501';
	END IF;
	IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
		OR jsonb_typeof(p_file) IS DISTINCT FROM 'object' OR octet_length(p_file::text) > 16384 THEN
		RAISE EXCEPTION 'Invalid upload declaration' USING ERRCODE = '22023';
	END IF;
	IF NOT p_file ?& ARRAY['filename', 'mimeType', 'byteSize', 'sha256', 'imageType']
		OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_file) AS field(name)
			WHERE field.name NOT IN ('filename', 'mimeType', 'byteSize', 'sha256', 'imageType', 'chapterId', 'pageLabel', 'description'))
		OR jsonb_typeof(p_file->'filename') IS DISTINCT FROM 'string'
		OR length(p_file->>'filename') NOT BETWEEN 1 AND 255
		OR p_file->>'filename' <> btrim(p_file->>'filename')
		OR p_file->>'filename' ~ '[[:cntrl:]/\\]'
		OR jsonb_typeof(p_file->'mimeType') IS DISTINCT FROM 'string'
		OR p_file->>'mimeType' NOT IN ('image/jpeg', 'image/png', 'image/webp')
		OR jsonb_typeof(p_file->'byteSize') IS DISTINCT FROM 'number'
		OR p_file->>'byteSize' !~ '^[1-9][0-9]{0,7}$'
		OR jsonb_typeof(p_file->'sha256') IS DISTINCT FROM 'string'
		OR p_file->>'sha256' !~ '^[0-9a-f]{64}$'
		OR jsonb_typeof(p_file->'imageType') IS DISTINCT FROM 'string'
		OR p_file->>'imageType' NOT IN ('cover', 'toc', 'page', 'chart', 'diagram', 'glossary') THEN
		RAISE EXCEPTION 'Invalid upload declaration' USING ERRCODE = '22023';
	END IF;
	IF (p_file->>'byteSize')::bigint > 26214400 THEN
		RAISE EXCEPTION 'Image exceeds 25 MiB' USING ERRCODE = '22023';
	END IF;
	IF p_file->>'chapterId' IS NOT NULL THEN
		IF jsonb_typeof(p_file->'chapterId') <> 'string'
			OR p_file->>'chapterId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
			RAISE EXCEPTION 'Invalid chapter' USING ERRCODE = '22023';
		END IF;
		chapter := (p_file->>'chapterId')::uuid;
	END IF;
	IF (p_file->>'pageLabel' IS NOT NULL AND (
		jsonb_typeof(p_file->'pageLabel') <> 'string' OR length(btrim(p_file->>'pageLabel')) NOT BETWEEN 1 AND 100
		OR p_file->>'pageLabel' ~ '[[:cntrl:]]'))
		OR (p_file->>'description' IS NOT NULL AND (
			jsonb_typeof(p_file->'description') <> 'string' OR length(p_file->>'description') > 4000)) THEN
		RAISE EXCEPTION 'Invalid image details' USING ERRCODE = '22023';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM libri.books book WHERE book.library_id = p_library_id AND book.id = p_book_id)
		OR (chapter IS NOT NULL AND NOT EXISTS (SELECT 1 FROM libri.chapters item
			WHERE item.library_id = p_library_id AND item.book_id = p_book_id AND item.id = chapter)) THEN
		RAISE EXCEPTION 'Upload parent unavailable' USING ERRCODE = '42501';
	END IF;
	SELECT item.* INTO intent FROM libri.image_upload_intents item
	WHERE item.library_id = p_library_id AND item.requested_by = caller AND item.idempotency_key = p_idempotency_key;
	IF intent.id IS NOT NULL THEN
		IF intent.book_id <> p_book_id OR intent.file_metadata <> p_file THEN
			RAISE EXCEPTION 'Upload retry conflicts with its declaration' USING ERRCODE = '22023';
		END IF;
		RETURN intent;
	END IF;
	IF (SELECT count(*) FROM libri.image_upload_intents item
		WHERE item.library_id = p_library_id AND item.status IN ('reserved', 'awaiting_verification', 'cleanup_pending')
		AND item.pending_slot_released_at IS NULL) >= controls.max_pending
		OR (SELECT count(*) FROM libri.image_upload_intents item
			WHERE item.library_id = p_library_id AND item.created_at >= clock_timestamp() - interval '24 hours') >= controls.max_daily THEN
		RAISE EXCEPTION 'Upload capacity exhausted' USING ERRCODE = '53000';
	END IF;
	-- Daily admission counts every retained intent, including settled pending slots.
	-- Only the service settlement RPC may release provably unissued reservations.
	new_id := gen_random_uuid();
	stamp := clock_timestamp();
	extension := CASE p_file->>'mimeType' WHEN 'image/jpeg' THEN 'jpeg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
	INSERT INTO libri.image_upload_intents (
		id, library_id, book_id, chapter_id, requested_by, idempotency_key, file_metadata,
		object_path, created_at, signing_deadline, expires_at, quota_policy_version
	) VALUES (
		new_id, p_library_id, p_book_id, chapter, caller, p_idempotency_key, p_file,
		p_library_id::text || '/uploads/' || new_id::text || '/original.' || extension,
		stamp, stamp + interval '10 minutes', stamp + interval '135 minutes', 1
	) RETURNING * INTO intent;
	RETURN intent;
END;
$function$;

NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
