-- libri-migration: true
-- Libri phase 4A: atomically plan one explicit, finite OCR batch without
-- enqueueing, polling, recursive discovery, or successor work.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.ocr_batch_items (
	library_id uuid NOT NULL,
	run_id uuid NOT NULL,
	step_id uuid NOT NULL,
	image_id uuid NOT NULL,
	position integer NOT NULL,
	expected_ocr_version integer NOT NULL,
	image_content_sha256 text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT ocr_batch_items_primary_key PRIMARY KEY (library_id, run_id, step_id),
	CONSTRAINT ocr_batch_items_step_fk
		FOREIGN KEY (library_id, run_id, step_id)
		REFERENCES libri.research_steps(library_id, run_id, id)
		ON DELETE CASCADE,
	CONSTRAINT ocr_batch_items_image_fk
		FOREIGN KEY (library_id, image_id)
		REFERENCES libri.images(library_id, id)
		ON DELETE RESTRICT,
	CONSTRAINT ocr_batch_items_run_position_unique UNIQUE (library_id, run_id, position),
	CONSTRAINT ocr_batch_items_image_version_unique UNIQUE (
		library_id,
		image_id,
		expected_ocr_version
	),
	CONSTRAINT ocr_batch_items_position_nonnegative CHECK (position >= 0),
	CONSTRAINT ocr_batch_items_expected_version_positive CHECK (expected_ocr_version > 0),
	CONSTRAINT ocr_batch_items_sha256_valid CHECK (
		image_content_sha256 ~ '^[0-9a-f]{64}$'
	)
);

ALTER TABLE libri.ocr_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.ocr_batch_items FORCE ROW LEVEL SECURITY;

CREATE POLICY ocr_batch_items_select_member
	ON libri.ocr_batch_items
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM libri.library_members AS member
			WHERE member.library_id = ocr_batch_items.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);

REVOKE ALL ON libri.ocr_batch_items FROM PUBLIC, anon, authenticated, libri_worker;
GRANT SELECT ON libri.ocr_batch_items TO authenticated;
GRANT ALL ON libri.ocr_batch_items TO service_role;

CREATE FUNCTION libri.plan_explicit_ocr_batch(
	p_library_id uuid,
	p_book_id uuid,
	p_image_ids uuid[],
	p_idempotency_key text,
	p_requested_by uuid
)
RETURNS TABLE (
	run_id uuid,
	created boolean,
	step_ids uuid[]
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	batch_size integer;
	desired_plan jsonb;
	existing_run record;
	new_run_id uuid;
	new_step_ids uuid[];
	matched_images integer;
	max_output_chars constant integer := 50000;
	reserved_microusd_per_image constant bigint := 100000;
BEGIN
	batch_size := cardinality(p_image_ids);
	IF batch_size IS NULL OR batch_size < 1 OR batch_size > 10 THEN
		RAISE EXCEPTION 'explicit OCR batch must contain between 1 and 10 images'
			USING ERRCODE = '22023';
	END IF;
	IF EXISTS (SELECT 1 FROM unnest(p_image_ids) AS requested(image_id) WHERE image_id IS NULL)
		OR (
			SELECT count(DISTINCT requested.image_id)
			FROM unnest(p_image_ids) AS requested(image_id)
		) <> batch_size THEN
		RAISE EXCEPTION 'explicit OCR batch image IDs must be non-null and unique'
			USING ERRCODE = '22023';
	END IF;
	IF p_idempotency_key IS NULL
		OR length(btrim(p_idempotency_key)) < 16
		OR length(p_idempotency_key) > 200
		OR p_idempotency_key <> btrim(p_idempotency_key) THEN
		RAISE EXCEPTION 'explicit OCR batch idempotency key must be 16 to 200 characters'
			USING ERRCODE = '22023';
	END IF;
	IF p_requested_by IS NULL THEN
		RAISE EXCEPTION 'explicit OCR batch requires a requesting user'
			USING ERRCODE = '22023';
	END IF;

	PERFORM 1
	FROM libri.library_members AS member
	WHERE member.library_id = p_library_id
		AND member.user_id = p_requested_by
		AND member.role IN ('owner', 'editor');
	IF NOT FOUND THEN
		RAISE EXCEPTION 'requesting user may not plan OCR for this library'
			USING ERRCODE = '42501';
	END IF;

	PERFORM 1
	FROM libri.books AS book
	WHERE book.library_id = p_library_id AND book.id = p_book_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'OCR batch book was not found in the requested library'
			USING ERRCODE = '22023';
	END IF;

	desired_plan := jsonb_build_object(
		'version', 1,
		'kind', 'explicit_ocr_book_batch',
		'imageIds', to_jsonb(p_image_ids),
		'imageCount', batch_size,
		'maxOutputChars', max_output_chars,
		'reservedMicrousdPerImage', reserved_microusd_per_image,
		'execution', jsonb_build_object(
			'mode', 'manual_exact_batch',
			'recurringPolling', false,
			'successorEnqueue', false
		)
	);

	SELECT candidate.*
	INTO existing_run
	FROM libri.research_runs AS candidate
	WHERE candidate.library_id = p_library_id
		AND candidate.idempotency_key = p_idempotency_key
	FOR UPDATE;
	IF FOUND THEN
		IF existing_run.queue_family <> 'libri_ingest'
			OR existing_run.kind <> 'ocr_book_batch'
			OR existing_run.subject_type <> 'book'
			OR existing_run.subject_id IS DISTINCT FROM p_book_id
			OR existing_run.requested_by_actor <> 'user'
			OR existing_run.requested_by IS DISTINCT FROM p_requested_by
			OR existing_run.plan_version <> 1
			OR existing_run.plan IS DISTINCT FROM desired_plan
			OR existing_run.max_steps <> batch_size
			OR existing_run.max_depth <> 0
			OR existing_run.max_sources <> batch_size
			OR existing_run.max_attempts_per_step <> 1
			OR existing_run.max_concurrent_steps <> LEAST(batch_size, 2)
			OR existing_run.cost_budget_microusd IS DISTINCT FROM
				reserved_microusd_per_image * batch_size::bigint
			OR existing_run.planned_steps <> batch_size THEN
			RAISE EXCEPTION 'idempotency key belongs to a different OCR batch contract'
				USING ERRCODE = '23505';
		END IF;

		SELECT array_agg(step.id ORDER BY step.position)
		INTO new_step_ids
		FROM libri.research_steps AS step
		WHERE step.library_id = p_library_id AND step.run_id = existing_run.id;
		IF cardinality(new_step_ids) IS DISTINCT FROM batch_size THEN
			RAISE EXCEPTION 'existing OCR batch manifest is incomplete'
				USING ERRCODE = '55000';
		END IF;
		RETURN QUERY SELECT existing_run.id, false, new_step_ids;
		RETURN;
	END IF;

	-- Lock in stable UUID order so overlapping planners cannot deadlock while
	-- they establish the unique image-version manifest below.
	PERFORM image.id
	FROM libri.images AS image
	WHERE image.library_id = p_library_id AND image.id = ANY(p_image_ids)
	ORDER BY image.id
	FOR UPDATE;

	SELECT count(*)
	INTO matched_images
	FROM libri.images AS image
	WHERE image.library_id = p_library_id
		AND image.book_id = p_book_id
		AND image.id = ANY(p_image_ids)
		AND image.ocr_status IN ('pending', 'failed');
	IF matched_images <> batch_size THEN
		RAISE EXCEPTION 'every OCR batch image must be pending or failed in the requested book'
			USING ERRCODE = '22023';
	END IF;

	INSERT INTO libri.research_runs (
		library_id,
		idempotency_key,
		queue_family,
		kind,
		subject_type,
		subject_id,
		requested_by_actor,
		requested_by,
		status,
		plan_version,
		plan,
		max_steps,
		max_depth,
		max_sources,
		max_attempts_per_step,
		max_concurrent_steps,
		cost_budget_microusd,
		deadline_at,
		planned_steps
	) VALUES (
		p_library_id,
		p_idempotency_key,
		'libri_ingest',
		'ocr_book_batch',
		'book',
		p_book_id,
		'user',
		p_requested_by,
		'queued',
		1,
		desired_plan,
		batch_size,
		0,
		batch_size,
		1,
		LEAST(batch_size, 2),
		reserved_microusd_per_image * batch_size::bigint,
		now() + interval '1 hour',
		batch_size
	)
	ON CONFLICT (library_id, idempotency_key) DO NOTHING
	RETURNING id INTO new_run_id;

	IF new_run_id IS NULL THEN
		SELECT candidate.*
		INTO existing_run
		FROM libri.research_runs AS candidate
		WHERE candidate.library_id = p_library_id
			AND candidate.idempotency_key = p_idempotency_key
		FOR UPDATE;
		IF existing_run.id IS NULL
			OR existing_run.queue_family <> 'libri_ingest'
			OR existing_run.kind <> 'ocr_book_batch'
			OR existing_run.subject_type <> 'book'
			OR existing_run.subject_id IS DISTINCT FROM p_book_id
			OR existing_run.requested_by_actor <> 'user'
			OR existing_run.requested_by IS DISTINCT FROM p_requested_by
			OR existing_run.plan_version <> 1
			OR existing_run.plan IS DISTINCT FROM desired_plan
			OR existing_run.max_steps <> batch_size
			OR existing_run.max_depth <> 0
			OR existing_run.max_sources <> batch_size
			OR existing_run.max_attempts_per_step <> 1
			OR existing_run.max_concurrent_steps <> LEAST(batch_size, 2)
			OR existing_run.cost_budget_microusd IS DISTINCT FROM
				reserved_microusd_per_image * batch_size::bigint
			OR existing_run.planned_steps <> batch_size THEN
			RAISE EXCEPTION 'idempotency key belongs to a different OCR batch contract'
				USING ERRCODE = '23505';
		END IF;
		SELECT array_agg(step.id ORDER BY step.position)
		INTO new_step_ids
		FROM libri.research_steps AS step
		WHERE step.library_id = p_library_id AND step.run_id = existing_run.id;
		IF cardinality(new_step_ids) IS DISTINCT FROM batch_size THEN
			RAISE EXCEPTION 'existing OCR batch manifest is incomplete'
				USING ERRCODE = '55000';
		END IF;
		RETURN QUERY SELECT existing_run.id, false, new_step_ids;
		RETURN;
	END IF;

	WITH requested AS (
		SELECT requested_image.image_id, requested_image.ordinality::integer - 1 AS position
		FROM unnest(p_image_ids) WITH ORDINALITY AS requested_image(image_id, ordinality)
	),
	inserted AS (
		INSERT INTO libri.research_steps (
			library_id,
			run_id,
			idempotency_key,
			queue_family,
			kind,
			stage,
			position,
			depth,
			status,
			priority,
			payload_version,
			payload,
			max_attempts
		)
		SELECT
			p_library_id,
			new_run_id,
			'ocr:image:' || image.id::text || ':version:' || (image.ocr_version + 1)::text,
			'libri_ingest',
			'ocr_image',
			'capture_sources',
			requested.position,
			0,
			'pending',
			100,
			1,
			jsonb_build_object(
				'version', 1,
				'kind', 'ocr_image',
				'imageId', image.id::text,
				'expectedOcrVersion', image.ocr_version + 1,
				'maxOutputChars', max_output_chars
			),
			1
		FROM requested
		JOIN libri.images AS image
			ON image.library_id = p_library_id AND image.id = requested.image_id
		ORDER BY requested.position
		RETURNING id, position
	)
	SELECT array_agg(inserted.id ORDER BY inserted.position)
	INTO new_step_ids
	FROM inserted;

	INSERT INTO libri.ocr_batch_items (
		library_id,
		run_id,
		step_id,
		image_id,
		position,
		expected_ocr_version,
		image_content_sha256
	)
	SELECT
		p_library_id,
		new_run_id,
		step.id,
		image.id,
		step.position,
		image.ocr_version + 1,
		image.content_sha256
	FROM libri.research_steps AS step
	JOIN unnest(p_image_ids) WITH ORDINALITY AS requested(image_id, ordinality)
		ON step.position = requested.ordinality::integer - 1
	JOIN libri.images AS image
		ON image.library_id = p_library_id AND image.id = requested.image_id
	WHERE step.library_id = p_library_id AND step.run_id = new_run_id
	ORDER BY step.position;

	RETURN QUERY SELECT new_run_id, true, new_step_ids;
END;
$function$;

REVOKE ALL ON FUNCTION libri.plan_explicit_ocr_batch
	FROM PUBLIC, anon, authenticated, libri_worker;
GRANT EXECUTE ON FUNCTION libri.plan_explicit_ocr_batch
	TO service_role;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
