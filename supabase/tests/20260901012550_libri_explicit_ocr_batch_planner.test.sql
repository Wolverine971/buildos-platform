-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_explicit_ocr_batch_planner_base.sql

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
		SELECT NOT routine.prosecdef
		FROM pg_catalog.pg_proc AS routine
		WHERE routine.oid =
			'libri.plan_explicit_ocr_batch(uuid,uuid,uuid[],text,uuid)'::regprocedure
	),
	'explicit OCR planning must remain security invoker'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'libri.plan_explicit_ocr_batch(uuid,uuid,uuid[],text,uuid)',
		'EXECUTE'
	)
		AND NOT has_function_privilege(
			'authenticated',
			'libri.plan_explicit_ocr_batch(uuid,uuid,uuid[],text,uuid)',
			'EXECUTE'
		)
		AND NOT has_function_privilege(
			'libri_worker',
			'libri.plan_explicit_ocr_batch(uuid,uuid,uuid[],text,uuid)',
			'EXECUTE'
		),
	'only the server service role may create explicit OCR batches'
);
SELECT pg_temp.assert_true(
	(
		SELECT relation.relrowsecurity AND relation.relforcerowsecurity
		FROM pg_catalog.pg_class AS relation
		WHERE relation.oid = 'libri.ocr_batch_items'::regclass
	)
		AND has_table_privilege('authenticated', 'libri.ocr_batch_items', 'SELECT')
		AND NOT has_table_privilege(
			'authenticated', 'libri.ocr_batch_items', 'INSERT, UPDATE, DELETE'
		)
		AND NOT has_table_privilege(
			'libri_worker', 'libri.ocr_batch_items', 'SELECT, INSERT, UPDATE, DELETE'
		),
	'the exact batch manifest must be member-readable and planner-owned'
);

INSERT INTO auth.users (id) VALUES
	('d1111111-1111-4111-8111-111111111111'),
	('d2222222-2222-4222-8222-222222222222'),
	('d3333333-3333-4333-8333-333333333333');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'ocr-batch-planner-test',
	'OCR batch planner test',
	'd1111111-1111-4111-8111-111111111111'
);
INSERT INTO libri.library_members (library_id, user_id, role) VALUES
	(
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'd1111111-1111-4111-8111-111111111111',
		'owner'
	),
	(
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'd2222222-2222-4222-8222-222222222222',
		'editor'
	),
	(
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'd3333333-3333-4333-8333-333333333333',
		'viewer'
	);
INSERT INTO libri.books (id, library_id, title) VALUES (
	'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'Bounded OCR batches'
);
INSERT INTO libri.sources (
	id,
	library_id,
	source_type,
	source_key,
	title,
	status,
	discovered_by
) VALUES
	(
		'dc000000-0000-4000-8000-000000000001',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'scanned_image',
		'ocr-batch:image-one',
		'OCR batch image one',
		'ready',
		'convex_migration'
	),
	(
		'dc000000-0000-4000-8000-000000000002',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'scanned_image',
		'ocr-batch:image-two',
		'OCR batch image two',
		'ready',
		'convex_migration'
	),
	(
		'dc000000-0000-4000-8000-000000000003',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'scanned_image',
		'ocr-batch:image-three',
		'OCR batch image three',
		'ready',
		'convex_migration'
	),
	(
		'dc000000-0000-4000-8000-000000000004',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'scanned_image',
		'ocr-batch:image-complete',
		'OCR batch complete image',
		'ready',
		'convex_migration'
	);
INSERT INTO libri.images (
	id,
	library_id,
	book_id,
	source_id,
	object_path,
	original_filename,
	mime_type,
	byte_size,
	content_sha256,
	image_type,
	ocr_status,
	ocr_version
) VALUES
	(
		'dd000000-0000-4000-8000-000000000001',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'dc000000-0000-4000-8000-000000000001',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/dd000000-0000-4000-8000-000000000001/original.jpeg',
		'page-one.jpeg',
		'image/jpeg',
		4096,
		repeat('a', 64),
		'page',
		'pending',
		0
	),
	(
		'dd000000-0000-4000-8000-000000000002',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'dc000000-0000-4000-8000-000000000002',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/dd000000-0000-4000-8000-000000000002/original.webp',
		'page-two.webp',
		'image/webp',
		2048,
		repeat('b', 64),
		'page',
		'failed',
		3
	),
	(
		'dd000000-0000-4000-8000-000000000003',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'dc000000-0000-4000-8000-000000000003',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/dd000000-0000-4000-8000-000000000003/original.png',
		'page-three.png',
		'image/png',
		1024,
		repeat('c', 64),
		'page',
		'pending',
		0
	),
	(
		'dd000000-0000-4000-8000-000000000004',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'dc000000-0000-4000-8000-000000000004',
		'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/dd000000-0000-4000-8000-000000000004/original.jpeg',
		'page-four.jpeg',
		'image/jpeg',
		1024,
		repeat('d', 64),
		'page',
		'complete',
		1
	);

INSERT INTO public.queue_jobs (
	id,
	queue_job_id,
	user_id,
	job_type,
	metadata,
	status,
	priority,
	scheduled_for
) VALUES (
	'de000000-0000-4000-8000-000000000001',
	'buildos_ocr_batch_control',
	'd1111111-1111-4111-8111-111111111111',
	'other',
	'{"control":"must-remain-byte-identical"}'::jsonb,
	'pending',
	1,
	'2026-09-01T00:00:00Z'
);

CREATE TEMP TABLE buildos_control_before AS
SELECT md5(row_to_json(control)::text) AS signature
FROM public.queue_jobs AS control
WHERE control.id = 'de000000-0000-4000-8000-000000000001';
GRANT SELECT ON buildos_control_before TO service_role;

SET ROLE service_role;

CREATE TEMP TABLE first_receipt AS
SELECT *
FROM libri.plan_explicit_ocr_batch(
	'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	ARRAY[
		'dd000000-0000-4000-8000-000000000001',
		'dd000000-0000-4000-8000-000000000002'
	]::uuid[],
	'ocr-batch:bounded-contract:one',
	'd2222222-2222-4222-8222-222222222222'
);

SELECT pg_temp.assert_true(
	(SELECT created AND cardinality(step_ids) = 2 FROM first_receipt),
	'the first exact request must atomically create one two-step batch'
);
SELECT pg_temp.assert_true(
	(
		SELECT
			run.status = 'queued'
			AND run.kind = 'ocr_book_batch'
			AND run.queue_family = 'libri_ingest'
			AND run.subject_type = 'book'
			AND run.subject_id = 'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
			AND run.requested_by = 'd2222222-2222-4222-8222-222222222222'
			AND run.planned_steps = 2
			AND run.max_steps = 2
			AND run.max_depth = 0
			AND run.max_sources = 2
			AND run.max_attempts_per_step = 1
			AND run.max_concurrent_steps = 2
			AND run.cost_budget_microusd = 200000
			AND run.deadline_at > run.created_at
			AND run.deadline_at <= run.created_at + interval '61 minutes'
		FROM libri.research_runs AS run
		WHERE run.id = (SELECT run_id FROM first_receipt)
	),
	'the batch run must carry finite execution and cost bounds'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2
			AND bool_and(step.status = 'pending')
			AND bool_and(step.max_attempts = 1)
			AND bool_and(step.active_queue_job_id IS NULL)
			AND array_agg(step.payload->>'imageId' ORDER BY step.position) = ARRAY[
				'dd000000-0000-4000-8000-000000000001',
				'dd000000-0000-4000-8000-000000000002'
			]
		FROM libri.research_steps AS step
		WHERE step.run_id = (SELECT run_id FROM first_receipt)
	),
	'the planner must create exact pending steps without transport rows'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2
			AND array_agg(item.expected_ocr_version ORDER BY item.position) = ARRAY[1, 4]
			AND array_agg(item.image_content_sha256 ORDER BY item.position) = ARRAY[
				repeat('a', 64),
				repeat('b', 64)
			]
		FROM libri.ocr_batch_items AS item
		WHERE item.run_id = (SELECT run_id FROM first_receipt)
	),
	'the immutable manifest must capture input order, hash, and next OCR version'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.queue_jobs)
		AND (SELECT signature FROM buildos_control_before) = (
			SELECT md5(row_to_json(control)::text)
			FROM public.queue_jobs AS control
			WHERE control.id = 'de000000-0000-4000-8000-000000000001'
		),
	'planning must not enqueue work or mutate the BuildOS queue control'
);

CREATE TEMP TABLE repeated_receipt AS
SELECT *
FROM libri.plan_explicit_ocr_batch(
	'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	ARRAY[
		'dd000000-0000-4000-8000-000000000001',
		'dd000000-0000-4000-8000-000000000002'
	]::uuid[],
	'ocr-batch:bounded-contract:one',
	'd2222222-2222-4222-8222-222222222222'
);
SELECT pg_temp.assert_true(
	(
		SELECT NOT repeated.created
			AND repeated.run_id = first.run_id
			AND repeated.step_ids = first.step_ids
		FROM repeated_receipt AS repeated
		CROSS JOIN first_receipt AS first
	)
		AND (SELECT count(*) = 1 FROM libri.research_runs)
		AND (SELECT count(*) = 2 FROM libri.research_steps),
	'an exact idempotent repeat must return the original manifest without duplication'
);

DO $$
BEGIN
	BEGIN
		PERFORM * FROM libri.plan_explicit_ocr_batch(
			'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			ARRAY[
				'dd000000-0000-4000-8000-000000000001',
				'dd000000-0000-4000-8000-000000000001'
			]::uuid[],
			'ocr-batch:duplicate-image',
			'd1111111-1111-4111-8111-111111111111'
		);
		RAISE EXCEPTION 'duplicate image IDs were accepted';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;

	BEGIN
		PERFORM * FROM libri.plan_explicit_ocr_batch(
			'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			ARRAY['dd000000-0000-4000-8000-000000000003']::uuid[],
			'ocr-batch:viewer-denied',
			'd3333333-3333-4333-8333-333333333333'
		);
		RAISE EXCEPTION 'viewer OCR planning was accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	BEGIN
		PERFORM * FROM libri.plan_explicit_ocr_batch(
			'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			ARRAY['dd000000-0000-4000-8000-000000000004']::uuid[],
			'ocr-batch:complete-image',
			'd1111111-1111-4111-8111-111111111111'
		);
		RAISE EXCEPTION 'completed image OCR planning was accepted';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;

	BEGIN
		PERFORM * FROM libri.plan_explicit_ocr_batch(
			'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			ARRAY['dd000000-0000-4000-8000-000000000001']::uuid[],
			'ocr-batch:overlapping-version',
			'd1111111-1111-4111-8111-111111111111'
		);
		RAISE EXCEPTION 'overlapping image-version OCR planning was accepted';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;

	BEGIN
		PERFORM * FROM libri.plan_explicit_ocr_batch(
			'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			ARRAY['dd000000-0000-4000-8000-000000000003']::uuid[],
			'ocr-batch:bounded-contract:one',
			'd2222222-2222-4222-8222-222222222222'
		);
		RAISE EXCEPTION 'idempotency mismatch was accepted';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.research_runs)
		AND (SELECT count(*) = 2 FROM libri.research_steps)
		AND (SELECT count(*) = 2 FROM libri.ocr_batch_items)
		AND (SELECT count(*) = 1 FROM public.queue_jobs),
	'rejected requests must roll back every run, step, manifest, and queue write'
);

UPDATE libri.research_steps
SET
	status = 'failed',
	completed_at = now(),
	error_class = 'synthetic_terminal_failure',
	error_message = 'contract retry fixture'
WHERE run_id = (SELECT run_id FROM first_receipt);

UPDATE libri.research_runs
SET
	status = 'failed',
	failed_steps = 2,
	finished_at = now(),
	error_class = 'synthetic_terminal_failure',
	error_message = 'contract retry fixture'
WHERE id = (SELECT run_id FROM first_receipt);

CREATE TEMP TABLE retry_receipt AS
SELECT *
FROM libri.plan_explicit_ocr_batch(
	'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	ARRAY['dd000000-0000-4000-8000-000000000001']::uuid[],
	'ocr-batch:terminal-failure-retry',
	'd2222222-2222-4222-8222-222222222222'
);

SELECT pg_temp.assert_true(
	(SELECT created AND cardinality(step_ids) = 1 FROM retry_receipt)
		AND (SELECT count(*) = 2 FROM libri.research_runs)
		AND (SELECT count(*) = 3 FROM libri.research_steps)
		AND (SELECT count(*) = 3 FROM libri.ocr_batch_items)
		AND (SELECT count(*) = 1 FROM public.queue_jobs),
	'a terminally failed OCR generation must be explicitly replannable without queue mutation'
);

RESET ROLE;
