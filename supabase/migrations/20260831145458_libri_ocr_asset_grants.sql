-- libri-migration: true
-- Libri phase 3F.1: one-time, lease-fenced capabilities for private OCR assets.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.ocr_asset_grants (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL,
	run_id uuid NOT NULL,
	step_id uuid NOT NULL,
	image_id uuid NOT NULL,
	execution_generation integer NOT NULL,
	lease_token uuid NOT NULL,
	expected_ocr_version integer NOT NULL,
	content_sha256 text NOT NULL,
	issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	expires_at timestamptz NOT NULL,
	consumed_at timestamptz,
	CONSTRAINT ocr_asset_grants_step_fk
		FOREIGN KEY (library_id, run_id, step_id)
		REFERENCES libri.research_steps(library_id, run_id, id)
		ON DELETE CASCADE,
	CONSTRAINT ocr_asset_grants_image_fk
		FOREIGN KEY (library_id, image_id)
		REFERENCES libri.images(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT ocr_asset_grants_generation_positive CHECK (execution_generation > 0),
	CONSTRAINT ocr_asset_grants_ocr_version_positive CHECK (expected_ocr_version > 0),
	CONSTRAINT ocr_asset_grants_sha256_valid CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
	CONSTRAINT ocr_asset_grants_expiry_valid CHECK (
		expires_at > issued_at
		AND expires_at <= issued_at + interval '61 seconds'
	),
	CONSTRAINT ocr_asset_grants_consumed_at_valid CHECK (
		consumed_at IS NULL
		OR (consumed_at >= issued_at AND consumed_at <= expires_at)
	)
);

CREATE INDEX ocr_asset_grants_step_idx
	ON libri.ocr_asset_grants (library_id, run_id, step_id);
CREATE INDEX ocr_asset_grants_image_idx
	ON libri.ocr_asset_grants (library_id, image_id);
CREATE INDEX ocr_asset_grants_unconsumed_expiry_idx
	ON libri.ocr_asset_grants (expires_at, id)
	WHERE consumed_at IS NULL;

ALTER TABLE libri.ocr_asset_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.ocr_asset_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY ocr_asset_grants_libri_worker_select
	ON libri.ocr_asset_grants FOR SELECT TO libri_worker USING (true);
CREATE POLICY ocr_asset_grants_libri_worker_insert
	ON libri.ocr_asset_grants FOR INSERT TO libri_worker WITH CHECK (true);

CREATE POLICY images_libri_worker_select
	ON libri.images FOR SELECT TO libri_worker USING (true);

CREATE OR REPLACE FUNCTION libri.validate_ocr_asset_lease(
	p_step_id uuid,
	p_execution_generation integer,
	p_lease_token uuid,
	p_image_id uuid
)
RETURNS TABLE (
	validated_library_id uuid,
	validated_run_id uuid,
	validated_expected_ocr_version integer,
	validated_content_sha256 text,
	validated_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	locked_step record;
	locked_image record;
	payload_version integer;
	expected_ocr_version integer;
	max_output_chars integer;
	now_value timestamptz;
	grant_expires_at timestamptz;
BEGIN
	IF p_step_id IS NULL
		OR p_execution_generation IS NULL OR p_execution_generation <= 0
		OR p_lease_token IS NULL
		OR p_image_id IS NULL THEN
		RETURN;
	END IF;

	SELECT
		step.library_id,
		step.run_id,
		step.queue_family,
		step.kind,
		step.status AS step_status,
		step.payload_version,
		step.payload,
		step.execution_generation,
		step.lease_token,
		step.lease_expires_at,
		run.status AS run_status,
		run.cancel_requested_at,
		run.deadline_at
	INTO locked_step
	FROM libri.research_steps AS step
	JOIN libri.research_runs AS run
		ON run.library_id = step.library_id
		AND run.id = step.run_id
	WHERE step.id = p_step_id
	FOR UPDATE OF step, run;

	IF NOT FOUND THEN
		RETURN;
	END IF;

	now_value := clock_timestamp();
	IF locked_step.queue_family <> 'libri_ingest'
		OR locked_step.kind <> 'ocr_image'
		OR locked_step.step_status <> 'leased'
		OR locked_step.payload_version <> 1
		OR locked_step.execution_generation <> p_execution_generation
		OR locked_step.lease_token IS DISTINCT FROM p_lease_token
		OR locked_step.lease_expires_at IS NULL
		OR locked_step.lease_expires_at <= now_value + interval '15 seconds'
		OR locked_step.run_status <> 'running'
		OR locked_step.cancel_requested_at IS NOT NULL
		OR (
			locked_step.deadline_at IS NOT NULL
			AND locked_step.deadline_at <= now_value + interval '15 seconds'
		) THEN
		RETURN;
	END IF;

	IF jsonb_typeof(locked_step.payload) IS DISTINCT FROM 'object'
		OR jsonb_typeof(locked_step.payload -> 'version') IS DISTINCT FROM 'number'
		OR jsonb_typeof(locked_step.payload -> 'kind') IS DISTINCT FROM 'string'
		OR jsonb_typeof(locked_step.payload -> 'imageId') IS DISTINCT FROM 'string'
		OR jsonb_typeof(locked_step.payload -> 'expectedOcrVersion') IS DISTINCT FROM 'number'
		OR jsonb_typeof(locked_step.payload -> 'maxOutputChars') IS DISTINCT FROM 'number' THEN
		RETURN;
	END IF;

	BEGIN
		payload_version := (locked_step.payload ->> 'version')::integer;
		expected_ocr_version := (locked_step.payload ->> 'expectedOcrVersion')::integer;
		max_output_chars := (locked_step.payload ->> 'maxOutputChars')::integer;
	EXCEPTION
		WHEN invalid_text_representation OR numeric_value_out_of_range THEN
			RETURN;
	END;

	IF payload_version <> 1
		OR expected_ocr_version <= 0
		OR max_output_chars NOT BETWEEN 1 AND 100000
		OR locked_step.payload <> jsonb_build_object(
			'version', payload_version,
			'kind', 'ocr_image',
			'imageId', p_image_id::text,
			'expectedOcrVersion', expected_ocr_version,
			'maxOutputChars', max_output_chars
		) THEN
		RETURN;
	END IF;

	SELECT
		image.bucket_id,
		image.mime_type,
		image.byte_size,
		image.content_sha256,
		image.ocr_status,
		image.ocr_version
	INTO locked_image
	FROM libri.images AS image
	WHERE image.library_id = locked_step.library_id
		AND image.id = p_image_id;

	IF NOT FOUND
		OR locked_image.bucket_id <> 'libri-assets'
		OR locked_image.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
		OR locked_image.byte_size <= 0 OR locked_image.byte_size > 26214400
		OR locked_image.content_sha256 !~ '^[0-9a-f]{64}$'
		OR locked_image.ocr_status NOT IN ('pending', 'failed')
		OR locked_image.ocr_version + 1 <> expected_ocr_version THEN
		RETURN;
	END IF;

	grant_expires_at := least(
		locked_step.lease_expires_at,
		COALESCE(locked_step.deadline_at, now_value + interval '60 seconds'),
		now_value + interval '60 seconds'
	);
	IF grant_expires_at <= now_value + interval '15 seconds' THEN
		RETURN;
	END IF;

	RETURN QUERY SELECT
		locked_step.library_id,
		locked_step.run_id,
		expected_ocr_version,
		locked_image.content_sha256,
		grant_expires_at;
END;
$function$;

CREATE OR REPLACE FUNCTION libri.enforce_ocr_asset_grant_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	validated record;
BEGIN
	IF TG_OP = 'UPDATE' THEN
		IF OLD.consumed_at IS NOT NULL
			OR NEW.consumed_at IS NULL
			OR NEW.id IS DISTINCT FROM OLD.id
			OR NEW.library_id IS DISTINCT FROM OLD.library_id
			OR NEW.run_id IS DISTINCT FROM OLD.run_id
			OR NEW.step_id IS DISTINCT FROM OLD.step_id
			OR NEW.image_id IS DISTINCT FROM OLD.image_id
			OR NEW.execution_generation IS DISTINCT FROM OLD.execution_generation
			OR NEW.lease_token IS DISTINCT FROM OLD.lease_token
			OR NEW.expected_ocr_version IS DISTINCT FROM OLD.expected_ocr_version
			OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
			OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
			OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
			RAISE EXCEPTION 'invalid OCR asset grant consumption transition';
		END IF;
		RETURN NEW;
	ELSIF TG_OP <> 'INSERT' THEN
		RAISE EXCEPTION 'ocr asset grants are append-only';
	END IF;

	SELECT * INTO validated
	FROM libri.validate_ocr_asset_lease(
		NEW.step_id,
		NEW.execution_generation,
		NEW.lease_token,
		NEW.image_id
	);
	IF NOT FOUND THEN
		RAISE EXCEPTION 'invalid or stale OCR asset lease';
	END IF;

	NEW.library_id := validated.validated_library_id;
	NEW.run_id := validated.validated_run_id;
	NEW.expected_ocr_version := validated.validated_expected_ocr_version;
	NEW.content_sha256 := validated.validated_content_sha256;
	NEW.issued_at := clock_timestamp();
	NEW.expires_at := least(
		validated.validated_expires_at,
		NEW.issued_at + interval '60 seconds'
	);
	NEW.consumed_at := NULL;
	RETURN NEW;
END;
$function$;

CREATE TRIGGER ocr_asset_grants_enforce_write
	BEFORE INSERT OR UPDATE ON libri.ocr_asset_grants
	FOR EACH ROW EXECUTE FUNCTION libri.enforce_ocr_asset_grant_write();

CREATE OR REPLACE FUNCTION libri.issue_ocr_asset_grant(
	p_step_id uuid,
	p_execution_generation integer,
	p_lease_token uuid,
	p_image_id uuid
)
RETURNS TABLE (grant_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	new_grant_id uuid;
	new_expires_at timestamptz;
BEGIN
	INSERT INTO libri.ocr_asset_grants (
		step_id,
		execution_generation,
		lease_token,
		image_id
	) VALUES (
		p_step_id,
		p_execution_generation,
		p_lease_token,
		p_image_id
	)
	RETURNING id, ocr_asset_grants.expires_at
	INTO new_grant_id, new_expires_at;

	RETURN QUERY SELECT new_grant_id, new_expires_at;
END;
$function$;

CREATE OR REPLACE FUNCTION libri.consume_ocr_asset_grant(p_grant_id uuid)
RETURNS TABLE (
	bucket_id text,
	object_path text,
	mime_type text,
	expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	visible_grant libri.ocr_asset_grants%ROWTYPE;
	locked_grant libri.ocr_asset_grants%ROWTYPE;
	validated record;
	resolved_asset record;
	now_value timestamptz;
BEGIN
	IF p_grant_id IS NULL THEN
		RETURN;
	END IF;

	SELECT grant_row.* INTO visible_grant
	FROM libri.ocr_asset_grants AS grant_row
	WHERE grant_row.id = p_grant_id;
	IF NOT FOUND THEN
		RETURN;
	END IF;

	SELECT * INTO validated
	FROM libri.validate_ocr_asset_lease(
		visible_grant.step_id,
		visible_grant.execution_generation,
		visible_grant.lease_token,
		visible_grant.image_id
	);
	IF NOT FOUND THEN
		RETURN;
	END IF;

	now_value := clock_timestamp();
	SELECT grant_row.* INTO locked_grant
	FROM libri.ocr_asset_grants AS grant_row
	WHERE grant_row.id = p_grant_id
		AND grant_row.consumed_at IS NULL
		AND grant_row.expires_at > now_value + interval '5 seconds'
	FOR UPDATE;
	IF NOT FOUND
		OR locked_grant.library_id <> validated.validated_library_id
		OR locked_grant.run_id <> validated.validated_run_id
		OR locked_grant.expected_ocr_version <> validated.validated_expected_ocr_version
		OR locked_grant.content_sha256 <> validated.validated_content_sha256 THEN
		RETURN;
	END IF;

	SELECT image.bucket_id, image.object_path, image.mime_type
	INTO resolved_asset
	FROM libri.images AS image
	WHERE image.library_id = locked_grant.library_id
		AND image.id = locked_grant.image_id
		AND image.content_sha256 = locked_grant.content_sha256;
	IF NOT FOUND THEN
		RETURN;
	END IF;

	UPDATE libri.ocr_asset_grants AS grant_row
	SET consumed_at = now_value
	WHERE grant_row.id = locked_grant.id;

	RETURN QUERY SELECT
		resolved_asset.bucket_id,
		resolved_asset.object_path,
		resolved_asset.mime_type,
		least(locked_grant.expires_at, validated.validated_expires_at);
END;
$function$;

REVOKE ALL ON TABLE libri.ocr_asset_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE libri.images FROM libri_worker;
GRANT ALL ON TABLE libri.ocr_asset_grants TO service_role;
GRANT SELECT (id, expires_at) ON TABLE libri.ocr_asset_grants TO libri_worker;
GRANT INSERT (
	step_id, execution_generation, lease_token, image_id
) ON TABLE libri.ocr_asset_grants TO libri_worker;

GRANT SELECT (
	library_id, id, bucket_id, mime_type, byte_size,
	content_sha256, ocr_status, ocr_version
) ON TABLE libri.images TO libri_worker;

REVOKE ALL ON FUNCTION libri.validate_ocr_asset_lease
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION libri.enforce_ocr_asset_grant_write()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION libri.issue_ocr_asset_grant
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION libri.consume_ocr_asset_grant
	FROM PUBLIC, anon, authenticated, libri_worker;

GRANT EXECUTE ON FUNCTION libri.validate_ocr_asset_lease
	TO libri_worker, service_role;
GRANT EXECUTE ON FUNCTION libri.enforce_ocr_asset_grant_write()
	TO libri_worker, service_role;
GRANT EXECUTE ON FUNCTION libri.issue_ocr_asset_grant
	TO libri_worker, service_role;
GRANT EXECUTE ON FUNCTION libri.consume_ocr_asset_grant
	TO service_role;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
