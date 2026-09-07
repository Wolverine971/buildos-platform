-- libri-migration: true
-- libri-allow-security-definer: reserve_image_upload
-- Retire uploads atomically before any future cleanup. No Storage operations,
-- quota release, consumer activation, deletion authority or shared-schema writes.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE libri.image_upload_intents DROP CONSTRAINT image_upload_intents_status_check;
ALTER TABLE libri.image_upload_intents ADD CONSTRAINT image_upload_intents_status_check
 CHECK (status IN ('reserved','awaiting_verification','expired','cleanup_pending'));

CREATE TABLE libri.image_upload_retirements (
 upload_id uuid PRIMARY KEY REFERENCES libri.image_upload_intents(id) ON DELETE RESTRICT,
 library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE RESTRICT,
 outcome text NOT NULL CHECK (outcome IN ('published','expired')),
 protected_publication_id uuid REFERENCES libri.image_upload_publications(id) ON DELETE RESTRICT,
 retired_at timestamptz NOT NULL,
 inspect_after timestamptz NOT NULL,
 CONSTRAINT image_upload_retirements_library_upload_unique UNIQUE (library_id,upload_id),
 CONSTRAINT image_upload_retirements_outcome CHECK (
  (outcome='published' AND protected_publication_id IS NOT NULL)
  OR (outcome='expired' AND protected_publication_id IS NULL)),
 CONSTRAINT image_upload_retirements_delay CHECK (inspect_after=retired_at+interval '27 hours')
);
CREATE INDEX image_upload_retirements_publication_idx
 ON libri.image_upload_retirements(protected_publication_id);

CREATE TABLE libri.image_upload_cleanup_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 upload_id uuid NOT NULL,
 library_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('staging','unpublished')),
 publication_id uuid REFERENCES libri.image_upload_publications(id) ON DELETE RESTRICT,
 object_path text NOT NULL UNIQUE,
 CONSTRAINT image_upload_cleanup_targets_retirement_fk FOREIGN KEY (library_id,upload_id)
  REFERENCES libri.image_upload_retirements(library_id,upload_id) ON DELETE RESTRICT,
 CONSTRAINT image_upload_cleanup_targets_path CHECK (
  (kind='staging' AND publication_id IS NULL AND object_path IN (
   library_id::text||'/uploads/'||upload_id::text||'/original.jpeg',
   library_id::text||'/uploads/'||upload_id::text||'/original.png',
   library_id::text||'/uploads/'||upload_id::text||'/original.webp'))
  OR (kind='unpublished' AND publication_id IS NOT NULL AND object_path IN (
   library_id::text||'/images/'||publication_id::text||'/original.jpeg',
   library_id::text||'/images/'||publication_id::text||'/original.png',
   library_id::text||'/images/'||publication_id::text||'/original.webp')))
);
CREATE INDEX image_upload_cleanup_targets_retirement_idx
 ON libri.image_upload_cleanup_targets(library_id,upload_id);
CREATE UNIQUE INDEX image_upload_cleanup_targets_publication_idx
 ON libri.image_upload_cleanup_targets(publication_id);
CREATE UNIQUE INDEX image_upload_cleanup_targets_staging_idx
 ON libri.image_upload_cleanup_targets(upload_id) WHERE kind='staging';
ALTER TABLE libri.image_upload_retirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_retirements FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_cleanup_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_cleanup_targets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON libri.image_upload_retirements,libri.image_upload_cleanup_targets
 FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader,service_role;
-- Immutable identity/tombstones. A future sweeper needs its own reviewed lease/receipt contract.
GRANT SELECT,INSERT ON libri.image_upload_retirements,libri.image_upload_cleanup_targets TO service_role;

CREATE FUNCTION libri.list_image_upload_retirement_candidates(p_library_id uuid)
RETURNS TABLE(upload_id uuid) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, libri SET lock_timeout = '2s' SET statement_timeout = '5s'
AS $function$
 SELECT item.id FROM libri.image_upload_intents item
 WHERE item.library_id=p_library_id AND item.status IN ('reserved','awaiting_verification')
 AND (item.expires_at<=now() OR EXISTS (SELECT 1 FROM libri.image_upload_publications publication
  WHERE publication.upload_id=item.id AND publication.status='published'))
 ORDER BY item.created_at,item.id LIMIT 25
$function$;

CREATE FUNCTION libri.retire_image_upload(p_library_id uuid,p_upload_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri SET lock_timeout = '2s' SET statement_timeout = '5s'
AS $function$
DECLARE
 item libri.image_upload_intents;
 work libri.image_upload_processing;
 publication libri.image_upload_publications;
 retirement libri.image_upload_retirements;
 protected_id uuid;
 stamp timestamptz;
BEGIN
 IF p_library_id IS NULL OR p_upload_id IS NULL THEN
  RAISE EXCEPTION 'Invalid retirement identity' USING ERRCODE='22023';
 END IF;
 -- Same order as admission/publication, without a member lock: revocation must not
 -- prevent cleanup. No member/control read here grants new upload authority.
 PERFORM library_id FROM libri.image_upload_controls WHERE library_id=p_library_id FOR UPDATE;
 SELECT * INTO item FROM libri.image_upload_intents
  WHERE library_id=p_library_id AND id=p_upload_id FOR UPDATE;
 IF item.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO retirement FROM libri.image_upload_retirements WHERE upload_id=item.id;
 IF retirement.upload_id IS NOT NULL THEN
  IF retirement.library_id<>item.library_id OR item.status<>'cleanup_pending' THEN
   RAISE EXCEPTION 'Retirement identity conflict' USING ERRCODE='55000';
  END IF;
 ELSE
  IF item.status NOT IN ('reserved','awaiting_verification') THEN RETURN NULL; END IF;
  SELECT * INTO work FROM libri.image_upload_processing WHERE upload_id=item.id FOR UPDATE;
  -- The intent lock serializes all supported publication writes, including a commit
  -- whose HTTP response was lost. Lock every attempt before classifying any path.
  PERFORM id FROM libri.image_upload_publications WHERE upload_id=item.id ORDER BY attempt FOR UPDATE;
  stamp:=clock_timestamp();
  SELECT id INTO protected_id FROM libri.image_upload_publications
   WHERE upload_id=item.id AND status='published';
  IF protected_id IS NULL AND item.expires_at>stamp THEN RETURN NULL; END IF;
  IF (work.status='published') IS DISTINCT FROM (protected_id IS NOT NULL) AND work.upload_id IS NOT NULL THEN
   RAISE EXCEPTION 'Publication state conflict' USING ERRCODE='55000';
  END IF;
  IF protected_id IS NOT NULL AND work.upload_id IS NULL THEN
   RAISE EXCEPTION 'Publication processing missing' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM libri.images WHERE bucket_id='libri-assets' AND object_path=item.object_path) THEN
   RAISE EXCEPTION 'Staging path has canonical ownership' USING ERRCODE='55000';
  END IF;
  FOR publication IN SELECT * FROM libri.image_upload_publications WHERE upload_id=item.id ORDER BY attempt LOOP
   IF publication.library_id<>item.library_id OR publication.book_id<>item.book_id
    OR publication.file_metadata<>item.file_metadata THEN
    RAISE EXCEPTION 'Publication identity conflict' USING ERRCODE='55000';
   END IF;
   IF publication.status='published' THEN
    IF work.status<>'published' OR work.attempt<>publication.attempt OR work.lease_token<>publication.lease_token
     OR NOT EXISTS (SELECT 1 FROM libri.images image
      WHERE image.id=publication.id AND image.library_id=item.library_id AND image.book_id=item.book_id
       AND image.source_id=publication.id AND image.bucket_id='libri-assets' AND image.object_path=publication.object_path
       AND image.content_sha256=publication.verified_metadata->>'sha256'
       AND image.mime_type=publication.verified_metadata->>'mimeType'
       AND to_jsonb(image.byte_size)=publication.verified_metadata->'byteSize')
     OR NOT EXISTS (SELECT 1 FROM libri.sources source WHERE source.id=publication.id
      AND source.library_id=item.library_id AND source.source_type='scanned_image'
      AND source.source_key='upload:'||item.id::text)
     OR NOT EXISTS (SELECT 1 FROM libri.source_book_links link WHERE link.library_id=item.library_id
      AND link.source_id=publication.id AND link.book_id=item.book_id AND link.relationship='primary') THEN
     RAISE EXCEPTION 'Committed publication ownership conflict' USING ERRCODE='55000';
    END IF;
   ELSIF EXISTS (SELECT 1 FROM libri.images WHERE id=publication.id
     OR (bucket_id='libri-assets' AND object_path=publication.object_path))
    OR EXISTS (SELECT 1 FROM libri.sources WHERE id=publication.id) THEN
    RAISE EXCEPTION 'Unpublished path has canonical ownership' USING ERRCODE='55000';
   END IF;
  END LOOP;
  -- This is a conservative earliest inspection time, NOT delete authorization or
  -- proof an in-flight write has ended. Targets survive later scans/late writes.
  INSERT INTO libri.image_upload_retirements(upload_id,library_id,outcome,protected_publication_id,retired_at,inspect_after)
  VALUES(item.id,item.library_id,CASE WHEN protected_id IS NULL THEN 'expired' ELSE 'published' END,
   protected_id,stamp,stamp+interval '27 hours') RETURNING * INTO retirement;
  INSERT INTO libri.image_upload_cleanup_targets(upload_id,library_id,kind,object_path)
  VALUES(item.id,item.library_id,'staging',item.object_path);
  INSERT INTO libri.image_upload_cleanup_targets(upload_id,library_id,kind,publication_id,object_path)
  SELECT item.id,item.library_id,'unpublished',id,object_path FROM libri.image_upload_publications
   WHERE upload_id=item.id AND status='prepared';
  UPDATE libri.image_upload_intents SET status='cleanup_pending' WHERE id=item.id;
  -- No processing/publication mutation, quota release, source/image deletion or
  -- outbox dispatch. Existing claim/sign/submit/download/finalize paths now refuse
  -- new work; exact published receipts still acknowledge the prior commit.
 END IF;
 RETURN jsonb_build_object('upload_id',retirement.upload_id,'library_id',retirement.library_id,
  'status','cleanup_pending','outcome',retirement.outcome,'protected_publication_id',retirement.protected_publication_id,
  'retired_at',retirement.retired_at,'inspect_after',retirement.inspect_after,
  'target_count',(SELECT count(*) FROM libri.image_upload_cleanup_targets WHERE library_id=p_library_id AND upload_id=item.id));
END;
$function$;
REVOKE ALL ON FUNCTION libri.list_image_upload_retirement_candidates(uuid) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
REVOKE ALL ON FUNCTION libri.retire_image_upload(uuid,uuid) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.list_image_upload_retirement_candidates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION libri.retire_image_upload(uuid,uuid) TO service_role;

-- The existing admission routine is reproduced below with only cleanup_pending
-- added to pending quota accounting. Its signature, ACLs, locks and checks remain.

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
		WHERE item.library_id = p_library_id AND item.status IN ('reserved', 'awaiting_verification', 'cleanup_pending')) >= controls.max_pending
		OR (SELECT count(*) FROM libri.image_upload_intents item
			WHERE item.library_id = p_library_id AND item.created_at >= clock_timestamp() - interval '24 hours') >= controls.max_daily THEN
		RAISE EXCEPTION 'Upload capacity exhausted' USING ERRCODE = '53000';
	END IF;
	-- Expired but unreconciled reservations still consume capacity. A future cleanup
	-- worker must prove issued tokens expired and remove orphan bytes before release.
	new_id := gen_random_uuid();
	stamp := clock_timestamp();
	extension := CASE p_file->>'mimeType' WHEN 'image/jpeg' THEN 'jpeg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
	INSERT INTO libri.image_upload_intents (
		id, library_id, book_id, chapter_id, requested_by, idempotency_key, file_metadata,
		object_path, created_at, signing_deadline, expires_at
	) VALUES (
		new_id, p_library_id, p_book_id, chapter, caller, p_idempotency_key, p_file,
		p_library_id::text || '/uploads/' || new_id::text || '/original.' || extension,
		stamp, stamp + interval '10 minutes', stamp + interval '135 minutes'
	) RETURNING * INTO intent;
	RETURN intent;
END;
$function$;

NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
