-- libri-migration: true
-- libri-allow-security-definer: reserve_image_upload, submit_image_upload
-- Staging only: no Storage policies, canonical image writes, shared queue writes,
-- provider calls or automatic OCR. Controls are empty/default-off at deployment.
-- Definer APIs are needed to enforce quotas/idempotency without granting raw writes.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.image_upload_controls (
	library_id uuid PRIMARY KEY REFERENCES libri.libraries(id) ON DELETE CASCADE,
	admission_enabled boolean NOT NULL DEFAULT false,
	max_pending integer NOT NULL DEFAULT 10 CHECK (max_pending BETWEEN 1 AND 10),
	max_daily integer NOT NULL DEFAULT 50 CHECK (max_daily BETWEEN 1 AND 50)
);
ALTER TABLE libri.image_upload_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_controls FORCE ROW LEVEL SECURITY;
REVOKE ALL ON libri.image_upload_controls FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON libri.image_upload_controls TO service_role;

CREATE TABLE libri.image_upload_intents (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE RESTRICT,
	book_id uuid NOT NULL,
	chapter_id uuid,
	requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
	idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
	file_metadata jsonb NOT NULL CHECK (jsonb_typeof(file_metadata) = 'object'),
	object_path text NOT NULL UNIQUE,
	status text NOT NULL DEFAULT 'reserved'
		CHECK (status IN ('reserved', 'awaiting_verification', 'expired')),
	created_at timestamptz NOT NULL DEFAULT now(),
	signing_deadline timestamptz NOT NULL,
	expires_at timestamptz NOT NULL,
	submitted_at timestamptz,
	CONSTRAINT image_upload_intents_book_fk FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id) ON DELETE RESTRICT,
	CONSTRAINT image_upload_intents_chapter_fk FOREIGN KEY (library_id, book_id, chapter_id)
		REFERENCES libri.chapters(library_id, book_id, id) ON DELETE RESTRICT,
	CONSTRAINT image_upload_intents_retry_unique UNIQUE (library_id, requested_by, idempotency_key),
	CONSTRAINT image_upload_intents_path CHECK (
		object_path IN (
			library_id::text || '/uploads/' || id::text || '/original.jpeg',
			library_id::text || '/uploads/' || id::text || '/original.png',
			library_id::text || '/uploads/' || id::text || '/original.webp'
		)
	),
	CONSTRAINT image_upload_intents_deadlines CHECK (
		signing_deadline = created_at + interval '10 minutes'
		AND expires_at = created_at + interval '135 minutes'
	),
	CONSTRAINT image_upload_intents_submission CHECK (
		(status <> 'reserved' OR submitted_at IS NULL)
		AND (status <> 'awaiting_verification' OR submitted_at IS NOT NULL)
	)
);
CREATE INDEX image_upload_intents_book_chapter_idx
	ON libri.image_upload_intents (library_id, book_id, chapter_id);
CREATE INDEX image_upload_intents_requested_by_idx ON libri.image_upload_intents (requested_by);
CREATE INDEX image_upload_intents_pending_idx ON libri.image_upload_intents (library_id, status);
CREATE INDEX image_upload_intents_daily_idx ON libri.image_upload_intents (library_id, created_at);
ALTER TABLE libri.image_upload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY image_upload_intents_select_requester ON libri.image_upload_intents
	FOR SELECT TO authenticated USING (
		requested_by = (SELECT auth.uid()) AND EXISTS (
			SELECT 1 FROM libri.library_members member
			WHERE member.library_id = image_upload_intents.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
REVOKE ALL ON libri.image_upload_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON libri.image_upload_intents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON libri.image_upload_intents TO service_role;

CREATE FUNCTION libri.reserve_image_upload(
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
		WHERE item.library_id = p_library_id AND item.status IN ('reserved', 'awaiting_verification')) >= controls.max_pending
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

CREATE FUNCTION libri.submit_image_upload(p_library_id uuid, p_upload_id uuid)
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
BEGIN
	IF caller IS NULL THEN RAISE EXCEPTION 'Library editor required' USING ERRCODE = '42501'; END IF;
	SELECT member.role INTO member_role FROM libri.library_members member
	WHERE member.library_id = p_library_id AND member.user_id = caller FOR SHARE;
	IF member_role IS NULL OR member_role NOT IN ('owner', 'editor') THEN
		RAISE EXCEPTION 'Library editor required' USING ERRCODE = '42501';
	END IF;
	SELECT control.* INTO controls FROM libri.image_upload_controls control
	WHERE control.library_id = p_library_id FOR UPDATE;
	IF controls.library_id IS NULL OR NOT controls.admission_enabled THEN
		RAISE EXCEPTION 'Upload admission is disabled' USING ERRCODE = '42501';
	END IF;
	SELECT item.* INTO intent FROM libri.image_upload_intents item
	WHERE item.library_id = p_library_id AND item.id = p_upload_id AND item.requested_by = caller FOR UPDATE;
	IF intent.id IS NULL THEN RAISE EXCEPTION 'Upload unavailable' USING ERRCODE = '42501'; END IF;
	IF intent.status = 'awaiting_verification' THEN RETURN intent; END IF;
	IF intent.status <> 'reserved' OR intent.expires_at <= clock_timestamp() THEN
		RAISE EXCEPTION 'Upload reservation expired' USING ERRCODE = '22023';
	END IF;
	-- This is only a durable notification. No claim that bytes exist or were verified.
	UPDATE libri.image_upload_intents item SET status = 'awaiting_verification', submitted_at = clock_timestamp()
	WHERE item.id = intent.id RETURNING * INTO intent;
	RETURN intent;
END;
$function$;

REVOKE ALL ON FUNCTION libri.reserve_image_upload(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION libri.submit_image_upload(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION libri.reserve_image_upload(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION libri.submit_image_upload(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
