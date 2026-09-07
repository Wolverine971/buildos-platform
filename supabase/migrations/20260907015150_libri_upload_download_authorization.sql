-- libri-migration: true
-- Server-broker reauthorization only. No activation, Storage policy/object writes,
-- table changes, raw worker grants, or shared BuildOS schema/queue changes.
-- Invoker rights: the server already has service-role access; no privilege escalation.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE FUNCTION libri.authorize_image_upload_download(
	p_library_id uuid, p_upload_id uuid, p_lease_token uuid, p_attempt integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $function$
DECLARE
	requester uuid;
	member_role text;
	control libri.image_upload_controls;
	item libri.image_upload_intents;
	work libri.image_upload_processing;
	stamp timestamptz;
	extension text;
BEGIN
	IF p_library_id IS NULL OR p_upload_id IS NULL OR p_lease_token IS NULL
		OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3 THEN
		RAISE EXCEPTION 'Invalid upload download authorization' USING ERRCODE = '22023';
	END IF;
	SELECT intent.requested_by INTO requester FROM libri.image_upload_intents intent
	WHERE intent.library_id = p_library_id AND intent.id = p_upload_id;
	IF requester IS NULL THEN RETURN NULL; END IF;
	-- Same ordering as admission/claim; short shared locks and no external calls.
	-- The returned receipt is a point-in-time authorization, never a lease renewal.
	SELECT member.role INTO member_role FROM libri.library_members member
	WHERE member.library_id = p_library_id AND member.user_id = requester FOR SHARE;
	IF member_role IS NULL OR member_role NOT IN ('owner', 'editor') THEN RETURN NULL; END IF;
	SELECT controls.* INTO control FROM libri.image_upload_controls controls
	WHERE controls.library_id = p_library_id FOR SHARE;
	IF control.library_id IS NULL OR NOT control.admission_enabled OR NOT control.processing_enabled THEN
		RETURN NULL;
	END IF;
	SELECT intent.* INTO item FROM libri.image_upload_intents intent
	WHERE intent.library_id = p_library_id AND intent.id = p_upload_id FOR SHARE;
	IF item.id IS NULL OR item.requested_by <> requester OR item.status <> 'awaiting_verification' THEN
		RETURN NULL;
	END IF;
	SELECT processing.* INTO work FROM libri.image_upload_processing processing
	WHERE processing.upload_id = item.id FOR SHARE;
	stamp := clock_timestamp(); -- Re-evaluate time after every potentially blocked row lock.
	IF work.upload_id IS NULL OR work.status <> 'leased' OR work.lease_token <> p_lease_token
		OR work.attempt <> p_attempt OR work.lease_expires_at <= stamp OR item.expires_at <= stamp THEN
		RETURN NULL;
	END IF;
	IF jsonb_typeof(item.file_metadata->'mimeType') IS DISTINCT FROM 'string'
		OR item.file_metadata->>'mimeType' NOT IN ('image/jpeg','image/png','image/webp')
		OR jsonb_typeof(item.file_metadata->'byteSize') IS DISTINCT FROM 'number'
		OR item.file_metadata->>'byteSize' !~ '^[1-9][0-9]{0,7}$'
		OR jsonb_typeof(item.file_metadata->'sha256') IS DISTINCT FROM 'string'
		OR item.file_metadata->>'sha256' !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
	IF (item.file_metadata->>'byteSize')::bigint > 26214400 THEN RETURN NULL; END IF;
	extension := CASE item.file_metadata->>'mimeType'
		WHEN 'image/jpeg' THEN 'jpeg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
	IF item.object_path <> item.library_id::text || '/uploads/' || item.id::text || '/original.' || extension THEN
		RETURN NULL;
	END IF;
	RETURN jsonb_build_object('library_id',item.library_id,'upload_id',item.id,'book_id',item.book_id,
		'lease_token',work.lease_token,'attempt',work.attempt,'bucket_id','libri-assets',
		'object_path',item.object_path,'mime_type',item.file_metadata->>'mimeType',
		'byte_size',(item.file_metadata->>'byteSize')::bigint,'sha256',item.file_metadata->>'sha256',
		'expires_at',LEAST(work.lease_expires_at,item.expires_at));
END;
$function$;

REVOKE ALL ON FUNCTION libri.authorize_image_upload_download(uuid,uuid,uuid,integer)
	FROM PUBLIC, anon, authenticated, libri_worker;
GRANT EXECUTE ON FUNCTION libri.authorize_image_upload_download(uuid,uuid,uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
