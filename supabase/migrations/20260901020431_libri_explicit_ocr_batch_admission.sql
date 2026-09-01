-- libri-migration: true
-- Libri phase 4C: record one explicit, reviewed OCR batch admission without
-- enqueueing shared BuildOS transport rows or activating the Railway worker.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.ocr_batch_admissions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL,
	run_id uuid NOT NULL,
	confirmation_id uuid NOT NULL,
	confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
	manifest_sha256 text NOT NULL,
	status text NOT NULL DEFAULT 'confirmed',
	confirmed_at timestamptz NOT NULL DEFAULT now(),
	enqueued_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT ocr_batch_admissions_run_fk
		FOREIGN KEY (library_id, run_id)
		REFERENCES libri.research_runs(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT ocr_batch_admissions_run_unique UNIQUE (library_id, run_id),
	CONSTRAINT ocr_batch_admissions_confirmation_unique UNIQUE (confirmation_id),
	CONSTRAINT ocr_batch_admissions_manifest_sha256_valid CHECK (
		manifest_sha256 ~ '^[0-9a-f]{64}$'
	),
	CONSTRAINT ocr_batch_admissions_status_valid CHECK (
		status IN ('confirmed', 'enqueued', 'cancelled')
	),
	CONSTRAINT ocr_batch_admissions_enqueued_at_valid CHECK (
		(status = 'enqueued') = (enqueued_at IS NOT NULL)
	)
);

CREATE INDEX ocr_batch_admissions_status_confirmed_idx
	ON libri.ocr_batch_admissions (status, confirmed_at, id);

CREATE TRIGGER ocr_batch_admissions_set_updated_at
	BEFORE UPDATE ON libri.ocr_batch_admissions
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

ALTER TABLE libri.ocr_batch_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.ocr_batch_admissions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON libri.ocr_batch_admissions FROM PUBLIC, anon, authenticated, libri_worker;
GRANT ALL ON libri.ocr_batch_admissions TO service_role;

CREATE FUNCTION libri.confirm_explicit_ocr_batch_admission(
	p_library_id uuid,
	p_book_id uuid,
	p_run_id uuid,
	p_confirmation_id uuid,
	p_manifest_sha256 text,
	p_step_ids uuid[],
	p_image_ids uuid[],
	p_expected_ocr_versions integer[],
	p_image_content_sha256s text[],
	p_requested_by uuid
)
RETURNS TABLE (
	admission_id uuid,
	created boolean,
	admission_status text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	batch_size integer;
	locked_run record;
	current_step_ids uuid[];
	current_image_ids uuid[];
	current_expected_ocr_versions integer[];
	current_image_content_sha256s text[];
	inserted_id uuid;
	existing_admission record;
BEGIN
	batch_size := cardinality(p_step_ids);
	IF batch_size IS NULL
		OR batch_size < 1
		OR batch_size > 10
		OR cardinality(p_image_ids) IS DISTINCT FROM batch_size
		OR cardinality(p_expected_ocr_versions) IS DISTINCT FROM batch_size
		OR cardinality(p_image_content_sha256s) IS DISTINCT FROM batch_size THEN
		RAISE EXCEPTION 'OCR batch admission manifest cardinality is invalid'
			USING ERRCODE = '22023';
	END IF;
	IF p_confirmation_id IS NULL OR p_requested_by IS NULL THEN
		RAISE EXCEPTION 'OCR batch admission requires confirmation and requesting users'
			USING ERRCODE = '22023';
	END IF;
	IF p_manifest_sha256 IS NULL OR p_manifest_sha256 !~ '^[0-9a-f]{64}$' THEN
		RAISE EXCEPTION 'OCR batch admission manifest hash is invalid'
			USING ERRCODE = '22023';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM unnest(p_step_ids, p_image_ids, p_expected_ocr_versions, p_image_content_sha256s)
			AS requested(step_id, image_id, expected_ocr_version, image_content_sha256)
		WHERE requested.step_id IS NULL
			OR requested.image_id IS NULL
			OR requested.expected_ocr_version IS NULL
			OR requested.expected_ocr_version < 1
			OR requested.image_content_sha256 IS NULL
			OR requested.image_content_sha256 !~ '^[0-9a-f]{64}$'
	) OR (
		SELECT count(DISTINCT requested.step_id)
		FROM unnest(p_step_ids) AS requested(step_id)
	) <> batch_size OR (
		SELECT count(DISTINCT requested.image_id)
		FROM unnest(p_image_ids) AS requested(image_id)
	) <> batch_size THEN
		RAISE EXCEPTION 'OCR batch admission manifest values are invalid'
			USING ERRCODE = '22023';
	END IF;

	PERFORM 1
	FROM libri.library_members AS member
	WHERE member.library_id = p_library_id
		AND member.user_id = p_requested_by
		AND member.role IN ('owner', 'editor');
	IF NOT FOUND THEN
		RAISE EXCEPTION 'requesting user may not confirm OCR for this library'
			USING ERRCODE = '42501';
	END IF;

	SELECT run.*
	INTO locked_run
	FROM libri.research_runs AS run
	WHERE run.library_id = p_library_id AND run.id = p_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'OCR batch run was not found'
			USING ERRCODE = '22023';
	END IF;
	IF locked_run.queue_family <> 'libri_ingest'
		OR locked_run.kind <> 'ocr_book_batch'
		OR locked_run.subject_type <> 'book'
		OR locked_run.subject_id IS DISTINCT FROM p_book_id
		OR locked_run.requested_by_actor <> 'user'
		OR locked_run.requested_by IS DISTINCT FROM p_requested_by THEN
		RAISE EXCEPTION 'requesting user may not confirm this OCR batch'
			USING ERRCODE = '42501';
	END IF;
	SELECT
		array_agg(item.step_id ORDER BY item.position),
		array_agg(item.image_id ORDER BY item.position),
		array_agg(item.expected_ocr_version ORDER BY item.position),
		array_agg(item.image_content_sha256 ORDER BY item.position)
	INTO
		current_step_ids,
		current_image_ids,
		current_expected_ocr_versions,
		current_image_content_sha256s
	FROM libri.ocr_batch_items AS item
	WHERE item.library_id = p_library_id AND item.run_id = p_run_id;
	IF current_step_ids IS DISTINCT FROM p_step_ids
		OR current_image_ids IS DISTINCT FROM p_image_ids
		OR current_expected_ocr_versions IS DISTINCT FROM p_expected_ocr_versions
		OR current_image_content_sha256s IS DISTINCT FROM p_image_content_sha256s THEN
		RAISE EXCEPTION 'OCR batch admission does not match the reviewed manifest'
			USING ERRCODE = '22023';
	END IF;

	SELECT admission.*
	INTO existing_admission
	FROM libri.ocr_batch_admissions AS admission
	WHERE admission.library_id = p_library_id AND admission.run_id = p_run_id
	FOR UPDATE;
	IF FOUND THEN
		IF existing_admission.confirmation_id IS DISTINCT FROM p_confirmation_id
			OR existing_admission.confirmed_by IS DISTINCT FROM p_requested_by
			OR existing_admission.manifest_sha256 IS DISTINCT FROM p_manifest_sha256
			OR existing_admission.status NOT IN ('confirmed', 'enqueued') THEN
			RAISE EXCEPTION 'OCR batch admission conflicts with an existing confirmation'
				USING ERRCODE = '23505';
		END IF;
		RETURN QUERY SELECT existing_admission.id, false, existing_admission.status;
		RETURN;
	END IF;

	IF locked_run.status <> 'queued'
		OR locked_run.cancel_requested_at IS NOT NULL
		OR locked_run.deadline_at IS NULL
		OR locked_run.deadline_at <= now()
		OR locked_run.planned_steps <> batch_size
		OR locked_run.max_steps <> batch_size
		OR locked_run.max_attempts_per_step <> 1
		OR locked_run.max_concurrent_steps <> LEAST(batch_size, 2) THEN
		RAISE EXCEPTION 'OCR batch run is not confirmable'
			USING ERRCODE = '55000';
	END IF;

	PERFORM 1
	FROM libri.research_steps AS step
	WHERE step.library_id = p_library_id
		AND step.run_id = p_run_id
	GROUP BY step.library_id, step.run_id
	HAVING count(*) = batch_size
		AND bool_and(step.status = 'pending')
		AND bool_and(step.queue_family = 'libri_ingest')
		AND bool_and(step.kind = 'ocr_image')
		AND bool_and(step.attempts = 0)
		AND bool_and(step.max_attempts = 1)
		AND bool_and(step.active_queue_job_id IS NULL);
	IF NOT FOUND THEN
		RAISE EXCEPTION 'OCR batch steps are not confirmable'
			USING ERRCODE = '55000';
	END IF;

	INSERT INTO libri.ocr_batch_admissions (
		library_id,
		run_id,
		confirmation_id,
		confirmed_by,
		manifest_sha256
	) VALUES (
		p_library_id,
		p_run_id,
		p_confirmation_id,
		p_requested_by,
		p_manifest_sha256
	)
	RETURNING id INTO inserted_id;

	RETURN QUERY SELECT inserted_id, true, 'confirmed'::text;
END;
$function$;

REVOKE ALL ON FUNCTION libri.confirm_explicit_ocr_batch_admission
	FROM PUBLIC, anon, authenticated, libri_worker;
GRANT EXECUTE ON FUNCTION libri.confirm_explicit_ocr_batch_admission
	TO service_role;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
