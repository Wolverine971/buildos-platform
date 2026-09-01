-- supabase/tests/20260901155435_libri_ocr_admission_finalizer_hardening.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_batch_dispatcher_access_base.sql
\ir ../migrations/20260901153414_libri_ocr_admission_dispatch_timestamp_guard.sql
\ir ../migrations/20260901155435_libri_ocr_admission_finalizer_hardening.sql

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF COALESCE(p_condition, false) IS NOT TRUE THEN
		RAISE EXCEPTION 'assertion failed: %', p_message;
	END IF;
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT routine.prosecdef
			AND routine.proconfig @> ARRAY['search_path=pg_catalog, libri']::text[]
		FROM pg_catalog.pg_proc AS routine
		WHERE routine.oid =
			'libri.finalize_ocr_batch_admission_dispatch(uuid,timestamptz)'::regprocedure
	),
	'finalizer must remain the reviewed security definer with a fixed search path'
);
SELECT pg_temp.assert_true(
	NOT pg_catalog.has_function_privilege(
		'libri_worker',
		'libri.enforce_ocr_batch_admission_dispatch()',
		'EXECUTE'
	)
	AND pg_catalog.has_function_privilege(
		'libri_worker',
		'libri.finalize_ocr_batch_admission_dispatch(uuid,timestamptz)',
		'EXECUTE'
	)
	AND NOT pg_catalog.has_function_privilege(
		'anon',
		'libri.finalize_ocr_batch_admission_dispatch(uuid,timestamptz)',
		'EXECUTE'
	)
	AND NOT pg_catalog.has_column_privilege(
		'libri_worker',
		'libri.ocr_batch_admissions',
		'status',
		'UPDATE'
	),
	'worker must have only the reviewed finalizer entry point and no raw transition grant'
);

INSERT INTO auth.users (id) VALUES ('d1000000-0000-4000-8000-000000000001');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'd2000000-0000-4000-8000-000000000001',
	'finalizer-hardening',
	'Finalizer hardening',
	'd1000000-0000-4000-8000-000000000001'
);
INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
	'd2000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	'owner'
);
INSERT INTO libri.books (id, library_id, title) VALUES (
	'd3000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'Finalizer hardening'
);
INSERT INTO libri.sources (
	id, library_id, source_type, source_key, title, status, discovered_by
) VALUES (
	'd4000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'scanned_image',
	'finalizer-hardening:image',
	'Finalizer hardening image',
	'ready',
	'convex_migration'
);
INSERT INTO libri.images (
	id, library_id, book_id, source_id, object_path, original_filename,
	mime_type, byte_size, content_sha256, image_type, ocr_status, ocr_version
) VALUES (
	'd5000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'd3000000-0000-4000-8000-000000000001',
	'd4000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001/books/d3000000-0000-4000-8000-000000000001/images/d5000000-0000-4000-8000-000000000001/original.jpeg',
	'page.jpeg',
	'image/jpeg',
	1024,
	repeat('a', 64),
	'page',
	'pending',
	0
);

SELECT run_id
FROM libri.plan_explicit_ocr_batch(
	'd2000000-0000-4000-8000-000000000001',
	'd3000000-0000-4000-8000-000000000001',
	ARRAY['d5000000-0000-4000-8000-000000000001'::uuid],
	'ocr-batch:finalizer-hardening',
	'd1000000-0000-4000-8000-000000000001'
)
\gset planned_

SELECT
	item.step_id,
	item.image_id,
	item.position,
	item.expected_ocr_version,
	item.image_content_sha256,
	step.priority,
	step.payload_version,
	run.correlation_id,
	encode(
		pg_catalog.sha256(
			convert_to(
				'{"version":1,"runId":"' || item.run_id::text
					|| '","libraryId":"' || item.library_id::text
					|| '","bookId":"d3000000-0000-4000-8000-000000000001"'
					|| ',"items":[{"stepId":"' || item.step_id::text
					|| '","imageId":"' || item.image_id::text
					|| '","position":' || item.position::text
					|| ',"expectedOcrVersion":' || item.expected_ocr_version::text
					|| ',"imageContentSha256":"' || item.image_content_sha256 || '"}]}',
				'UTF8'
			)
		),
		'hex'
	) AS manifest_sha256
FROM libri.ocr_batch_items AS item
JOIN libri.research_steps AS step
	ON step.library_id = item.library_id
	AND step.run_id = item.run_id
	AND step.id = item.step_id
JOIN libri.research_runs AS run
	ON run.library_id = item.library_id AND run.id = item.run_id
WHERE item.run_id = :'planned_run_id'
\gset item_

INSERT INTO libri.ocr_batch_admissions (
	id, library_id, run_id, confirmation_id, confirmed_by, manifest_sha256
) VALUES (
	'd6000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	:'planned_run_id',
	'd7000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	:'item_manifest_sha256'
);

SET ROLE libri_worker;
DO $$
BEGIN
	BEGIN
		UPDATE libri.ocr_batch_admissions
		SET status = 'enqueued', enqueued_at = transaction_timestamp(), updated_at = now()
		WHERE id = 'd6000000-0000-4000-8000-000000000001';
		RAISE EXCEPTION 'raw worker update bypassed the finalization contract';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	BEGIN
		PERFORM * FROM libri.finalize_ocr_batch_admission_dispatch(
			'd6000000-0000-4000-8000-000000000001',
			clock_timestamp() - interval '1 second'
		);
		RAISE EXCEPTION 'expired worker finalization was accepted';
	EXCEPTION WHEN query_canceled THEN NULL;
	END;
END;
$$;
RESET ROLE;

CREATE FUNCTION libri.test_delay_ocr_admission_finalization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $$
BEGIN
	PERFORM pg_catalog.pg_sleep(0.25);
	RETURN NEW;
END;
$$;
CREATE TRIGGER aaa_test_delay_ocr_admission_finalization
	BEFORE UPDATE ON libri.ocr_batch_admissions
	FOR EACH ROW EXECUTE FUNCTION libri.test_delay_ocr_admission_finalization();

SET ROLE libri_worker;
DO $$
DECLARE
	context record;
	queue_row_id uuid;
BEGIN
	SELECT
		admission.id AS admission_id,
		admission.library_id,
		admission.run_id,
		admission.manifest_sha256,
		library.created_by,
		run.correlation_id,
		item.step_id,
		item.position,
		step.priority,
		step.payload_version
	INTO context
	FROM libri.ocr_batch_admissions AS admission
	JOIN libri.research_runs AS run
		ON run.library_id = admission.library_id AND run.id = admission.run_id
	JOIN libri.libraries AS library ON library.id = admission.library_id
	JOIN libri.ocr_batch_items AS item
		ON item.library_id = admission.library_id AND item.run_id = admission.run_id
	JOIN libri.research_steps AS step
		ON step.library_id = item.library_id
		AND step.run_id = item.run_id
		AND step.id = item.step_id
	WHERE admission.id = 'd6000000-0000-4000-8000-000000000001';

	BEGIN
		INSERT INTO public.queue_jobs (
			queue_job_id, user_id, job_type, metadata, status, priority,
			scheduled_for, dedup_key, attempts, max_attempts
		) VALUES (
			'libri_ingest_finalizer_expiry_probe',
			context.created_by,
			'libri_ingest',
			jsonb_build_object(
				'correlationId', context.correlation_id::text,
				'libraryId', context.library_id::text,
				'researchRunId', context.run_id::text,
				'researchStepId', context.step_id::text,
				'payloadVersion', context.payload_version,
				'libriAdmissionId', context.admission_id::text,
				'libriManifestSha256', context.manifest_sha256,
				'libriBatchPosition', context.position
			),
			'pending',
			context.priority,
			transaction_timestamp(),
			'libri:research-step:' || context.step_id::text,
			0,
			1
		)
		RETURNING id INTO queue_row_id;

		UPDATE libri.research_steps
		SET
			status = 'queued',
			scheduled_for = transaction_timestamp(),
			active_queue_job_id = queue_row_id,
			updated_at = now()
		WHERE id = context.step_id;

		PERFORM * FROM libri.finalize_ocr_batch_admission_dispatch(
			context.admission_id,
			clock_timestamp() + interval '0.15 seconds'
		);
		RAISE EXCEPTION 'finalization committed after its dispatch window expired';
	EXCEPTION WHEN query_canceled THEN NULL;
	END;
END;
$$;
RESET ROLE;

DROP TRIGGER aaa_test_delay_ocr_admission_finalization ON libri.ocr_batch_admissions;
DROP FUNCTION libri.test_delay_ocr_admission_finalization();

SELECT pg_temp.assert_true(
	(
		SELECT status = 'confirmed' AND enqueued_at IS NULL
		FROM libri.ocr_batch_admissions
		WHERE id = 'd6000000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.queue_jobs
		WHERE queue_job_id = 'libri_ingest_finalizer_expiry_probe'
	),
	'finalizer postcheck must roll back queue, step, and admission writes after expiry'
);

DO $$
BEGIN
	BEGIN
		UPDATE libri.research_steps
		SET payload = jsonb_set(payload, '{maxOutputChars}', '1'::jsonb)
		WHERE id = (
			SELECT item.step_id
			FROM libri.ocr_batch_items AS item
			JOIN libri.ocr_batch_admissions AS admission
				ON admission.library_id = item.library_id
				AND admission.run_id = item.run_id
			WHERE admission.id = 'd6000000-0000-4000-8000-000000000001'
		);
		RAISE EXCEPTION 'confirmed step payload changed';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		UPDATE libri.images
		SET content_sha256 = repeat('f', 64)
		WHERE id = 'd5000000-0000-4000-8000-000000000001';
		RAISE EXCEPTION 'confirmed image identity changed';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		DELETE FROM libri.ocr_batch_items
		WHERE step_id = (
			SELECT item.step_id
			FROM libri.ocr_batch_items AS item
			JOIN libri.ocr_batch_admissions AS admission
				ON admission.library_id = item.library_id
				AND admission.run_id = item.run_id
			WHERE admission.id = 'd6000000-0000-4000-8000-000000000001'
		);
		RAISE EXCEPTION 'confirmed batch item was deleted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

BEGIN;
SET LOCAL ROLE libri_worker;
INSERT INTO public.queue_jobs (
	queue_job_id, user_id, job_type, metadata, status, priority,
	scheduled_for, dedup_key, attempts, max_attempts
) VALUES (
	'libri_ingest_finalizer_hardening',
	'd1000000-0000-4000-8000-000000000001',
	'libri_ingest',
	jsonb_build_object(
		'correlationId', :'item_correlation_id',
		'libraryId', 'd2000000-0000-4000-8000-000000000001',
		'researchRunId', :'planned_run_id',
		'researchStepId', :'item_step_id',
		'payloadVersion', :'item_payload_version'::integer,
		'libriAdmissionId', 'd6000000-0000-4000-8000-000000000001',
		'libriManifestSha256', :'item_manifest_sha256',
		'libriBatchPosition', :'item_position'::integer
	),
	'pending',
	:'item_priority'::integer,
	transaction_timestamp(),
	'libri:research-step:' || :'item_step_id',
	0,
	1
)
RETURNING id
\gset queue_
UPDATE libri.research_steps
SET
	status = 'queued',
	scheduled_for = transaction_timestamp(),
	active_queue_job_id = :'queue_id',
	updated_at = now()
WHERE id = :'item_step_id';
DO $$
BEGIN
	BEGIN
		UPDATE libri.ocr_batch_admissions
		SET status = 'enqueued', enqueued_at = transaction_timestamp(), updated_at = now()
		WHERE id = 'd6000000-0000-4000-8000-000000000001';
		RAISE EXCEPTION 'raw worker transition bypassed the finalizer with valid evidence';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;
SELECT admission_id
FROM libri.finalize_ocr_batch_admission_dispatch(
	'd6000000-0000-4000-8000-000000000001',
	clock_timestamp() + interval '5 minutes'
);
COMMIT;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'enqueued' AND enqueued_at IS NOT NULL
		FROM libri.ocr_batch_admissions
		WHERE id = 'd6000000-0000-4000-8000-000000000001'
	)
	AND (
		SELECT count(*) = 1
		FROM public.queue_jobs
		WHERE metadata->>'libriAdmissionId' = 'd6000000-0000-4000-8000-000000000001'
	),
	'exact queue and manifest evidence must finalize the admission atomically'
);

DO $$
BEGIN
	BEGIN
		UPDATE libri.research_steps
		SET payload = jsonb_set(payload, '{maxOutputChars}', '1'::jsonb)
		WHERE id = (
			SELECT item.step_id
			FROM libri.ocr_batch_items AS item
			JOIN libri.ocr_batch_admissions AS admission
				ON admission.library_id = item.library_id
				AND admission.run_id = item.run_id
			WHERE admission.id = 'd6000000-0000-4000-8000-000000000001'
		);
		RAISE EXCEPTION 'enqueued step payload changed';
		EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		UPDATE libri.research_steps
		SET active_queue_job_id = NULL
		WHERE id = (
			SELECT item.step_id
			FROM libri.ocr_batch_items AS item
			JOIN libri.ocr_batch_admissions AS admission
				ON admission.library_id = item.library_id
				AND admission.run_id = item.run_id
			WHERE admission.id = 'd6000000-0000-4000-8000-000000000001'
		);
		RAISE EXCEPTION 'enqueued queue linkage changed';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 3
		FROM pg_catalog.pg_trigger AS trigger
		WHERE trigger.tgname IN (
			'ocr_batch_items_confirmed_immutability_guard',
			'research_steps_confirmed_ocr_contract_guard',
			'images_admitted_ocr_contract_guard'
		)
		AND trigger.tgenabled = 'O'
	),
	'all immutable-manifest guards must remain enabled'
);
