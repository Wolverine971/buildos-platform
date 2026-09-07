-- libri-migration: true
-- libri-allow-security-definer: claim_image_upload, fail_image_upload
-- Libri-only publication ledger and atomic source/image/outbox completion.
-- No Storage writes, shared queue changes, activation or quota release.
-- New routines are service-role-only invoker APIs; the trusted server must attest
-- a successful create-only upload of the exact verified bytes before finalization.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE libri.image_upload_processing DROP CONSTRAINT image_upload_processing_status_check;
ALTER TABLE libri.image_upload_processing ADD CONSTRAINT image_upload_processing_status_check
	CHECK (status IN ('leased','retry_wait','blocked','published'));

CREATE TABLE libri.image_upload_publications (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	upload_id uuid NOT NULL REFERENCES libri.image_upload_intents(id) ON DELETE RESTRICT,
	library_id uuid NOT NULL,
	book_id uuid NOT NULL,
	attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 3),
	lease_token uuid NOT NULL,
	object_path text NOT NULL UNIQUE,
	file_metadata jsonb NOT NULL CHECK (jsonb_typeof(file_metadata) = 'object'),
	verified_metadata jsonb NOT NULL CHECK (jsonb_typeof(verified_metadata) = 'object'),
	status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','published')),
	prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	published_at timestamptz,
	storage_object_id uuid,
	image_id uuid,
	source_id uuid,
	followup_status text CHECK (followup_status IN ('pending','dispatched')),
	CONSTRAINT image_upload_publications_attempt_unique UNIQUE (upload_id,attempt),
	CONSTRAINT image_upload_publications_book_fk FOREIGN KEY (library_id,book_id)
		REFERENCES libri.books(library_id,id) ON DELETE RESTRICT,
	CONSTRAINT image_upload_publications_image_fk FOREIGN KEY (library_id,image_id)
		REFERENCES libri.images(library_id,id) ON DELETE RESTRICT,
	CONSTRAINT image_upload_publications_source_fk FOREIGN KEY (library_id,source_id)
		REFERENCES libri.sources(library_id,id) ON DELETE RESTRICT,
	CONSTRAINT image_upload_publications_path CHECK (
		object_path IN (library_id::text||'/images/'||id::text||'/original.jpeg',
			library_id::text||'/images/'||id::text||'/original.png',
			library_id::text||'/images/'||id::text||'/original.webp')
	),
	CONSTRAINT image_upload_publications_completion CHECK (
		(status='prepared' AND published_at IS NULL AND storage_object_id IS NULL
			AND image_id IS NULL AND source_id IS NULL AND followup_status IS NULL)
		OR (status='published' AND published_at IS NOT NULL AND storage_object_id IS NOT NULL
			AND image_id IS NOT NULL AND image_id=id AND source_id IS NOT NULL AND source_id=id
			AND followup_status IS NOT NULL)
	)
);
CREATE UNIQUE INDEX image_upload_publications_one_published_idx
	ON libri.image_upload_publications(upload_id) WHERE status='published';
CREATE INDEX image_upload_publications_book_idx ON libri.image_upload_publications(library_id,book_id);
CREATE INDEX image_upload_publications_image_idx ON libri.image_upload_publications(library_id,image_id);
CREATE INDEX image_upload_publications_source_idx ON libri.image_upload_publications(library_id,source_id);
CREATE INDEX image_upload_publications_outbox_idx ON libri.image_upload_publications(library_id,published_at,id)
	WHERE status='published' AND followup_status='pending';
ALTER TABLE libri.image_upload_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_publications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON libri.image_upload_publications FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT,INSERT,UPDATE,DELETE ON libri.image_upload_publications TO service_role;

-- Short common lock path: do not upgrade the download authorizer's shared locks.
CREATE FUNCTION libri.lock_image_upload_publication(
	p_library_id uuid,p_upload_id uuid,p_lease_token uuid,p_attempt integer
) RETURNS libri.image_upload_intents LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri SET lock_timeout = '2s' SET statement_timeout = '5s'
AS $function$
DECLARE
	requester uuid;
	member_role text;
	control libri.image_upload_controls;
	item libri.image_upload_intents;
	work libri.image_upload_processing;
	stamp timestamptz;
BEGIN
	IF p_library_id IS NULL OR p_upload_id IS NULL OR p_lease_token IS NULL
		OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3 THEN
		RAISE EXCEPTION 'Invalid publication fence' USING ERRCODE='22023';
	END IF;
	SELECT requested_by INTO requester FROM libri.image_upload_intents
	WHERE library_id=p_library_id AND id=p_upload_id;
	IF requester IS NULL THEN RETURN NULL; END IF;
	SELECT role INTO member_role FROM libri.library_members
	WHERE library_id=p_library_id AND user_id=requester FOR SHARE;
	IF member_role IS NULL OR member_role NOT IN ('owner','editor') THEN RETURN NULL; END IF;
	SELECT * INTO control FROM libri.image_upload_controls WHERE library_id=p_library_id FOR UPDATE;
	IF control.library_id IS NULL OR NOT control.admission_enabled OR NOT control.processing_enabled THEN RETURN NULL; END IF;
	SELECT * INTO item FROM libri.image_upload_intents WHERE library_id=p_library_id AND id=p_upload_id FOR UPDATE;
	IF item.id IS NULL OR item.requested_by<>requester OR item.status<>'awaiting_verification' THEN RETURN NULL; END IF;
	SELECT * INTO work FROM libri.image_upload_processing WHERE upload_id=item.id FOR UPDATE;
	stamp := clock_timestamp();
	IF work.upload_id IS NULL OR work.status<>'leased' OR work.attempt<>p_attempt
		OR work.lease_token<>p_lease_token OR work.lease_expires_at<=stamp OR item.expires_at<=stamp THEN RETURN NULL; END IF;
	RETURN item;
END;
$function$;

CREATE FUNCTION libri.prepare_image_upload_publication(
	p_library_id uuid,p_upload_id uuid,p_lease_token uuid,p_attempt integer,p_verified jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri SET lock_timeout = '2s' SET statement_timeout = '5s'
AS $function$
DECLARE
	item libri.image_upload_intents;
	publication libri.image_upload_publications;
	new_id uuid;
	extension text;
BEGIN
	IF jsonb_typeof(p_verified) IS DISTINCT FROM 'object' OR octet_length(p_verified::text)>1024 THEN
		RAISE EXCEPTION 'Invalid verification receipt' USING ERRCODE='22023';
	END IF;
	IF NOT p_verified ?& ARRAY['mimeType','byteSize','sha256','width','height','channels']
		OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_verified) AS fields(name)
			WHERE name NOT IN ('mimeType','byteSize','sha256','width','height','channels'))
		OR jsonb_typeof(p_verified->'mimeType') IS DISTINCT FROM 'string'
		OR p_verified->>'mimeType' NOT IN ('image/jpeg','image/png','image/webp')
		OR jsonb_typeof(p_verified->'sha256') IS DISTINCT FROM 'string'
		OR p_verified->>'sha256' !~ '^[0-9a-f]{64}$'
		OR EXISTS (SELECT 1 FROM unnest(ARRAY['byteSize','width','height','channels']) name
			WHERE jsonb_typeof(p_verified->name) IS DISTINCT FROM 'number'
				OR p_verified->>name !~ '^[1-9][0-9]{0,7}$') THEN
		RAISE EXCEPTION 'Invalid verification receipt' USING ERRCODE='22023';
	END IF;
	IF (p_verified->>'byteSize')::bigint>26214400 OR (p_verified->>'width')::bigint>16384
		OR (p_verified->>'height')::bigint>16384 OR (p_verified->>'channels')::bigint>4
		OR (p_verified->>'width')::bigint*(p_verified->>'height')::bigint>40000000 THEN
		RAISE EXCEPTION 'Image exceeds verification limits' USING ERRCODE='22023';
	END IF;
	item := libri.lock_image_upload_publication(p_library_id,p_upload_id,p_lease_token,p_attempt);
	IF item.id IS NULL THEN RETURN NULL; END IF;
	IF item.file_metadata->'mimeType' IS DISTINCT FROM p_verified->'mimeType'
		OR item.file_metadata->'byteSize' IS DISTINCT FROM p_verified->'byteSize'
		OR item.file_metadata->'sha256' IS DISTINCT FROM p_verified->'sha256'
		OR jsonb_typeof(item.file_metadata->'filename') IS DISTINCT FROM 'string'
		OR length(btrim(item.file_metadata->>'filename')) NOT BETWEEN 1 AND 255
		OR item.file_metadata->>'imageType' NOT IN ('cover','toc','page','chart','diagram','glossary')
		OR jsonb_typeof(item.file_metadata->'imageType') IS DISTINCT FROM 'string' THEN
		RAISE EXCEPTION 'Verification conflicts with upload declaration' USING ERRCODE='22023';
	END IF;
	extension := CASE p_verified->>'mimeType' WHEN 'image/jpeg' THEN 'jpeg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
	IF item.object_path<>p_library_id::text||'/uploads/'||p_upload_id::text||'/original.'||extension THEN
		RAISE EXCEPTION 'Invalid staging path' USING ERRCODE='22023';
	END IF;
	SELECT * INTO publication FROM libri.image_upload_publications WHERE upload_id=item.id AND attempt=p_attempt FOR UPDATE;
	IF publication.id IS NULL THEN
		new_id := gen_random_uuid();
		INSERT INTO libri.image_upload_publications(id,upload_id,library_id,book_id,attempt,lease_token,object_path,file_metadata,verified_metadata)
		VALUES(new_id,item.id,item.library_id,item.book_id,p_attempt,p_lease_token,
			item.library_id::text||'/images/'||new_id::text||'/original.'||extension,item.file_metadata,p_verified)
		RETURNING * INTO publication;
	ELSIF publication.lease_token<>p_lease_token OR publication.library_id<>p_library_id
		OR publication.book_id<>item.book_id OR publication.file_metadata<>item.file_metadata
		OR publication.verified_metadata<>p_verified OR publication.status<>'prepared' THEN
		RAISE EXCEPTION 'Publication retry conflicts with prepared bytes' USING ERRCODE='22023';
	END IF;
	-- Also check after a potentially blocked publication row/unique-index write.
	IF item.expires_at<=clock_timestamp() OR EXISTS (SELECT 1 FROM libri.image_upload_processing
		WHERE upload_id=item.id AND lease_expires_at<=clock_timestamp()) THEN
		RAISE EXCEPTION 'Publication lease expired' USING ERRCODE='55000';
	END IF;
	RETURN jsonb_build_object('publication_id',publication.id,'library_id',publication.library_id,
		'upload_id',publication.upload_id,'book_id',publication.book_id,'attempt',publication.attempt,
		'lease_token',publication.lease_token,'bucket_id','libri-assets','object_path',publication.object_path,
		'verified_metadata',publication.verified_metadata,'status',publication.status);
END;
$function$;

CREATE FUNCTION libri.finalize_image_upload_publication(
	p_library_id uuid,p_upload_id uuid,p_lease_token uuid,p_attempt integer,
	p_publication_id uuid,p_storage_object_id uuid,p_verified jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri SET lock_timeout = '2s' SET statement_timeout = '5s'
AS $function$
DECLARE
	item libri.image_upload_intents;
	publication libri.image_upload_publications;
	stamp timestamptz;
BEGIN
	IF p_library_id IS NULL OR p_upload_id IS NULL OR p_lease_token IS NULL OR p_publication_id IS NULL
		OR p_storage_object_id IS NULL OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3
		OR jsonb_typeof(p_verified) IS DISTINCT FROM 'object' OR octet_length(p_verified::text)>1024
		THEN RAISE EXCEPTION 'Invalid publication receipt' USING ERRCODE='22023'; END IF;
	-- Only the trusted server can attest Storage completion. Object metadata is not
	-- a content hash proof; the server must verify the exact owned bytes separately.
	-- Lock in the same order even for retries; never lock publication before intent.
	item := libri.lock_image_upload_publication(p_library_id,p_upload_id,p_lease_token,p_attempt);
	SELECT * INTO publication FROM libri.image_upload_publications WHERE id=p_publication_id
		AND library_id=p_library_id AND upload_id=p_upload_id AND lease_token=p_lease_token AND attempt=p_attempt;
	IF publication.id IS NULL THEN RETURN NULL; END IF;
	IF publication.verified_metadata<>p_verified THEN
		RAISE EXCEPTION 'Publication retry conflicts with verified bytes' USING ERRCODE='22023';
	END IF;
	IF publication.status='published' THEN
		IF publication.storage_object_id<>p_storage_object_id THEN
			RAISE EXCEPTION 'Publication retry conflicts with committed object' USING ERRCODE='22023';
		END IF;
		-- Acknowledge an already committed exact receipt even after lease expiry or
		-- revocation. No new write/URL/authority. Never infer deletion authority from NULL.
		RETURN jsonb_build_object('publication_id',publication.id,'image_id',publication.image_id,
			'source_id',publication.source_id,'status','published','already_published',true);
	END IF;
	IF item.id IS NULL THEN RETURN NULL; END IF;
	SELECT * INTO publication FROM libri.image_upload_publications WHERE id=p_publication_id FOR UPDATE;
	stamp := clock_timestamp();
	IF publication.library_id<>p_library_id OR publication.upload_id<>p_upload_id
		OR publication.lease_token<>p_lease_token OR publication.attempt<>p_attempt
		OR publication.verified_metadata<>p_verified
		OR item.book_id<>publication.book_id OR item.file_metadata<>publication.file_metadata
		OR publication.status<>'prepared' OR item.expires_at<=stamp
		OR EXISTS (SELECT 1 FROM libri.image_upload_processing WHERE upload_id=item.id AND lease_expires_at<=stamp) THEN RETURN NULL; END IF;
	INSERT INTO libri.sources(id,library_id,source_type,source_key,title,status,discovered_by,metadata)
	VALUES(publication.id,item.library_id,'scanned_image','upload:'||item.id::text,
		item.file_metadata->>'filename','content_fetched','libri_upload',
		jsonb_build_object('uploadId',item.id,'publicationId',publication.id,'verified',publication.verified_metadata));
	INSERT INTO libri.source_book_links(library_id,source_id,book_id,relationship,discovered_by)
	VALUES(item.library_id,publication.id,item.book_id,'primary','libri_upload');
	INSERT INTO libri.images(id,library_id,book_id,chapter_id,source_id,bucket_id,object_path,
		original_filename,mime_type,byte_size,content_sha256,image_type,page_label,description)
	VALUES(publication.id,item.library_id,item.book_id,item.chapter_id,publication.id,'libri-assets',publication.object_path,
		item.file_metadata->>'filename',p_verified->>'mimeType',(p_verified->>'byteSize')::bigint,
		p_verified->>'sha256',item.file_metadata->>'imageType',item.file_metadata->>'pageLabel',item.file_metadata->>'description');
	UPDATE libri.image_upload_publications SET status='published',published_at=stamp,
		storage_object_id=p_storage_object_id,image_id=publication.id,source_id=publication.id,followup_status='pending'
	WHERE id=publication.id;
	UPDATE libri.image_upload_processing SET status='published',last_failure=NULL,updated_at=stamp WHERE upload_id=item.id;
	-- The intent remains awaiting_verification until cleanup: it still consumes quota,
	-- and its FKs retain parent/user identity and staging path for safe orphan cleanup.
	-- No external queue/OCR/provider call is made; the ledger itself is a pending outbox.
	IF item.expires_at<=clock_timestamp() OR EXISTS (SELECT 1 FROM libri.image_upload_processing
		WHERE upload_id=item.id AND lease_expires_at<=clock_timestamp()) THEN
		RAISE EXCEPTION 'Publication lease expired' USING ERRCODE='55000';
	END IF;
	RETURN jsonb_build_object('publication_id',publication.id,'image_id',publication.id,
		'source_id',publication.id,'status','published','already_published',false);
END;
$function$;

REVOKE ALL ON FUNCTION libri.lock_image_upload_publication(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
REVOKE ALL ON FUNCTION libri.prepare_image_upload_publication(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
REVOKE ALL ON FUNCTION libri.finalize_image_upload_publication(uuid,uuid,uuid,integer,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.lock_image_upload_publication(uuid,uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION libri.prepare_image_upload_publication(uuid,uuid,uuid,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION libri.finalize_image_upload_publication(uuid,uuid,uuid,integer,uuid,uuid,jsonb) TO service_role;

-- Existing worker ACLs are preserved by CREATE OR REPLACE. Reject published rows
-- for both same-token retries and new tokens; failure cannot overwrite success.
CREATE OR REPLACE FUNCTION libri.claim_image_upload(p_library_id uuid, p_upload_id uuid, p_lease_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
BEGIN
	IF p_library_id IS NULL OR p_upload_id IS NULL OR p_lease_token IS NULL THEN
		RAISE EXCEPTION 'Invalid upload claim' USING ERRCODE = '22023';
	END IF;
	SELECT intent.requested_by INTO requester FROM libri.image_upload_intents intent
	WHERE intent.library_id = p_library_id AND intent.id = p_upload_id;
	IF requester IS NULL THEN RETURN NULL; END IF;
	-- Match admission lock order: member -> controls -> intent -> processing.
	SELECT member.role INTO member_role FROM libri.library_members member
	WHERE member.library_id = p_library_id AND member.user_id = requester FOR SHARE;
	IF member_role IS NULL OR member_role NOT IN ('owner', 'editor') THEN RETURN NULL; END IF;
	-- Serializes the one-active-upload limit within this library only.
	SELECT controls.* INTO control FROM libri.image_upload_controls controls
	WHERE controls.library_id = p_library_id FOR UPDATE;
	IF control.library_id IS NULL OR NOT control.admission_enabled OR NOT control.processing_enabled THEN
		RETURN NULL;
	END IF;
	SELECT intent.* INTO item FROM libri.image_upload_intents intent
	WHERE intent.library_id = p_library_id AND intent.id = p_upload_id FOR UPDATE SKIP LOCKED;
	stamp := clock_timestamp();
	IF item.id IS NULL OR item.requested_by <> requester OR item.status <> 'awaiting_verification'
		OR item.expires_at <= stamp THEN RETURN NULL; END IF;
	SELECT processing.* INTO work FROM libri.image_upload_processing processing
	WHERE processing.upload_id = item.id FOR UPDATE;
	-- A processing-row wait can cross either deadline; do not return a stale claim.
	stamp := clock_timestamp();
	IF item.expires_at <= stamp THEN RETURN NULL; END IF;
	IF work.upload_id IS NOT NULL AND work.lease_token = p_lease_token THEN
		-- Ambiguous claim retries reuse the token, never extend time or consume an attempt.
		IF work.status <> 'leased' OR work.lease_expires_at <= stamp THEN RETURN NULL; END IF;
	ELSE
		IF work.upload_id IS NOT NULL THEN
			IF work.status IN ('blocked', 'published')
				OR (work.status = 'leased' AND work.lease_expires_at > stamp)
				OR (work.status = 'retry_wait' AND work.available_at > stamp) THEN RETURN NULL; END IF;
			IF work.attempt >= 3 THEN
				UPDATE libri.image_upload_processing SET status = 'blocked',
					last_failure = 'attempts_exhausted', updated_at = stamp WHERE upload_id = item.id;
				RETURN NULL;
			END IF;
		END IF;
		IF EXISTS (SELECT 1 FROM libri.image_upload_processing active
			JOIN libri.image_upload_intents parent ON parent.id = active.upload_id
			WHERE parent.library_id = p_library_id AND active.status = 'leased'
				AND active.lease_expires_at > stamp) THEN RETURN NULL; END IF;
		IF work.upload_id IS NULL THEN
			INSERT INTO libri.image_upload_processing (
				upload_id, status, attempt, lease_token, lease_expires_at, available_at, updated_at
			) VALUES (item.id, 'leased', 1, p_lease_token,
				LEAST(stamp + interval '90 seconds', item.expires_at), stamp, stamp)
			RETURNING * INTO work;
		ELSE
			UPDATE libri.image_upload_processing SET status = 'leased', attempt = work.attempt + 1,
				lease_token = p_lease_token, lease_expires_at = LEAST(stamp + interval '90 seconds', item.expires_at),
				available_at = stamp, updated_at = stamp, last_failure = NULL
			WHERE upload_id = item.id RETURNING * INTO work;
		END IF;
	END IF;
	RETURN jsonb_build_object('upload_id', item.id, 'library_id', item.library_id, 'book_id', item.book_id,
		'object_path', item.object_path, 'declaration', item.file_metadata, 'attempt', work.attempt,
		'lease_token', work.lease_token, 'lease_expires_at', work.lease_expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION libri.fail_image_upload(
	p_library_id uuid, p_upload_id uuid, p_lease_token uuid, p_attempt integer, p_failure_code text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, libri
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $function$
DECLARE
	item libri.image_upload_intents;
	work libri.image_upload_processing;
	stamp timestamptz;
	can_retry boolean;
BEGIN
	IF p_library_id IS NULL OR p_upload_id IS NULL OR p_lease_token IS NULL
		OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3
		OR p_failure_code IS NULL OR p_failure_code NOT IN (
			'invalid_image', 'verification_unavailable', 'storage_unavailable', 'cancelled'
		) THEN RAISE EXCEPTION 'Invalid upload failure' USING ERRCODE = '22023'; END IF;
	-- No member/control lock is needed for a failure-only transition. It remains safe
	-- after revocation/disable and never releases quota or grants publication authority.
	SELECT intent.* INTO item FROM libri.image_upload_intents intent
	WHERE intent.library_id = p_library_id AND intent.id = p_upload_id FOR UPDATE;
	IF item.id IS NULL OR item.status <> 'awaiting_verification' THEN RETURN false; END IF;
	SELECT processing.* INTO work FROM libri.image_upload_processing processing
	WHERE processing.upload_id = item.id FOR UPDATE;
	stamp := clock_timestamp();
	IF work.upload_id IS NULL OR work.lease_token <> p_lease_token OR work.attempt <> p_attempt THEN RETURN false; END IF;
	IF work.status = 'published' THEN RETURN false; END IF;
	-- Repeat only the same acknowledged failure, without resetting the retry deadline.
	IF work.status <> 'leased' THEN RETURN work.last_failure = p_failure_code; END IF;
	IF work.lease_expires_at <= stamp OR item.expires_at <= stamp THEN RETURN false; END IF;
	can_retry := p_failure_code IN ('verification_unavailable', 'storage_unavailable') AND work.attempt < 3;
	UPDATE libri.image_upload_processing SET status = CASE WHEN can_retry THEN 'retry_wait' ELSE 'blocked' END,
		last_failure = p_failure_code, available_at = stamp + interval '30 seconds', updated_at = stamp
	WHERE upload_id = item.id;
	RETURN true;
END;
$function$;

NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
