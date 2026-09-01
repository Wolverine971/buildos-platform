-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_batch_retry_guard_base.sql
\set libri_ocr_batch_fixture_loaded true
\ir 20260901012550_libri_explicit_ocr_batch_planner.test.sql
\unset libri_ocr_batch_fixture_loaded

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_catalog.pg_constraint AS constraint_row
		WHERE constraint_row.conrelid = 'libri.ocr_batch_items'::regclass
			AND constraint_row.conname = 'ocr_batch_items_image_version_unique'
	)
		AND EXISTS (
			SELECT 1
			FROM pg_catalog.pg_indexes AS index_row
			WHERE index_row.schemaname = 'libri'
				AND index_row.tablename = 'ocr_batch_items'
				AND index_row.indexname = 'ocr_batch_items_image_version_idx'
		)
		AND EXISTS (
			SELECT 1
			FROM pg_catalog.pg_trigger AS trigger_row
			WHERE trigger_row.tgrelid = 'libri.ocr_batch_items'::regclass
				AND trigger_row.tgname = 'ocr_batch_items_generation_guard'
				AND trigger_row.tgenabled = 'O'
				AND NOT trigger_row.tgisinternal
		),
	'the retry guard must replace permanent uniqueness with an enabled active-generation trigger'
);

SELECT pg_temp.assert_true(
	(
		SELECT NOT routine.prosecdef
			AND routine.proconfig @> ARRAY['search_path=pg_catalog, libri']::text[]
		FROM pg_catalog.pg_proc AS routine
		WHERE routine.oid =
			'libri.enforce_ocr_batch_item_generation_guard()'::regprocedure
	)
		AND has_function_privilege(
			'service_role',
			'libri.enforce_ocr_batch_item_generation_guard()',
			'EXECUTE'
		)
		AND NOT has_function_privilege(
			'authenticated',
			'libri.enforce_ocr_batch_item_generation_guard()',
			'EXECUTE'
		)
		AND NOT has_function_privilege(
			'libri_worker',
			'libri.enforce_ocr_batch_item_generation_guard()',
			'EXECUTE'
		),
	'the active-generation trigger function must remain invoker-safe and service-only'
);

SET ROLE service_role;

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
		AND (
			SELECT count(*) = 2
			FROM libri.ocr_batch_items
			WHERE image_id = 'dd000000-0000-4000-8000-000000000001'
				AND expected_ocr_version = 1
		)
		AND (SELECT count(*) = 1 FROM public.queue_jobs)
		AND (SELECT signature FROM buildos_control_before) = (
			SELECT md5(row_to_json(control)::text)
			FROM public.queue_jobs AS control
			WHERE control.id = 'de000000-0000-4000-8000-000000000001'
		),
	'a terminally failed OCR generation must be explicitly replannable without queue mutation'
);

RESET ROLE;
