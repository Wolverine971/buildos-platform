-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_batch_dispatcher_access_base.sql

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
	has_table_privilege('libri_worker', 'libri.ocr_batch_items', 'SELECT')
		AND NOT has_table_privilege('libri_worker', 'libri.ocr_batch_items', 'INSERT, UPDATE, DELETE')
		AND has_table_privilege('libri_worker', 'libri.ocr_batch_admissions', 'SELECT')
		AND NOT has_table_privilege('libri_worker', 'libri.ocr_batch_admissions', 'INSERT, DELETE')
		AND has_column_privilege(
			'libri_worker',
			'libri.ocr_batch_admissions',
			'status',
			'UPDATE'
		)
		AND has_column_privilege(
			'libri_worker',
			'libri.ocr_batch_admissions',
			'enqueued_at',
			'UPDATE'
		)
		AND NOT has_column_privilege(
			'libri_worker',
			'libri.ocr_batch_admissions',
			'manifest_sha256',
			'UPDATE'
		),
	'worker dispatch authority must remain read-mostly and column-scoped'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 3
		FROM pg_catalog.pg_policy AS policy
		WHERE policy.polrelid IN (
			'libri.ocr_batch_items'::regclass,
			'libri.ocr_batch_admissions'::regclass
		)
			AND policy.polname IN (
				'ocr_batch_items_libri_worker_select_admitted',
				'ocr_batch_admissions_libri_worker_select_dispatchable',
				'ocr_batch_admissions_libri_worker_mark_enqueued'
			)
	)
		AND (
			SELECT NOT routine.prosecdef
				AND routine.proconfig @> ARRAY['search_path=pg_catalog, libri']::text[]
			FROM pg_catalog.pg_proc AS routine
			WHERE routine.oid =
				'libri.enforce_ocr_batch_admission_dispatch()'::regprocedure
		)
		AND has_function_privilege(
			'libri_worker',
			'libri.enforce_ocr_batch_admission_dispatch()',
			'EXECUTE'
		),
	'worker dispatcher RLS and the invoker transition guard must be installed'
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM pg_catalog.pg_indexes
		WHERE schemaname = 'libri'
			AND tablename = 'ocr_batch_admissions'
			AND indexname = 'ocr_batch_admissions_confirmed_by_idx'
	),
	'confirmed_by foreign-key lookups must have a covering index'
);

INSERT INTO auth.users (id) VALUES ('f1000000-0000-4000-8000-000000000001');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'f2000000-0000-4000-8000-000000000001',
	'dispatch-contract',
	'Dispatch contract',
	'f1000000-0000-4000-8000-000000000001'
);
INSERT INTO libri.research_runs (
	id,
	library_id,
	idempotency_key,
	queue_family,
	kind,
	subject_type,
	subject_id,
	requested_by_actor,
	requested_by,
	max_steps,
	max_depth,
	max_sources,
	max_attempts_per_step,
	max_concurrent_steps,
	deadline_at,
	planned_steps
) VALUES
(
	'f3000000-0000-4000-8000-000000000001',
	'f2000000-0000-4000-8000-000000000001',
	'dispatch-contract-one',
	'libri_ingest',
	'ocr_book_batch',
	'book',
	'f4000000-0000-4000-8000-000000000001',
	'user',
	'f1000000-0000-4000-8000-000000000001',
	1,
	0,
	1,
	1,
	1,
	now() + interval '1 hour',
	1
),
(
	'f3000000-0000-4000-8000-000000000002',
	'f2000000-0000-4000-8000-000000000001',
	'dispatch-contract-two',
	'libri_ingest',
	'ocr_book_batch',
	'book',
	'f4000000-0000-4000-8000-000000000002',
	'user',
	'f1000000-0000-4000-8000-000000000001',
	1,
	0,
	1,
	1,
	1,
	now() + interval '1 hour',
	1
);
INSERT INTO libri.ocr_batch_admissions (
	id,
	library_id,
	run_id,
	confirmation_id,
	confirmed_by,
	manifest_sha256
) VALUES
(
	'f5000000-0000-4000-8000-000000000001',
	'f2000000-0000-4000-8000-000000000001',
	'f3000000-0000-4000-8000-000000000001',
	'f6000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	repeat('a', 64)
),
(
	'f5000000-0000-4000-8000-000000000002',
	'f2000000-0000-4000-8000-000000000001',
	'f3000000-0000-4000-8000-000000000002',
	'f6000000-0000-4000-8000-000000000002',
	'f1000000-0000-4000-8000-000000000001',
	repeat('b', 64)
);

SET ROLE libri_worker;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM libri.ocr_batch_admissions),
	'worker may see only dispatchable confirmed or enqueued admissions'
);

UPDATE libri.ocr_batch_admissions
SET status = 'enqueued', enqueued_at = now(), updated_at = now()
WHERE id = 'f5000000-0000-4000-8000-000000000001';

DO $$
BEGIN
	BEGIN
		UPDATE libri.ocr_batch_admissions
		SET status = 'cancelled', enqueued_at = NULL, updated_at = now()
		WHERE id = 'f5000000-0000-4000-8000-000000000002';
		RAISE EXCEPTION 'libri_worker cancelled an admission';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	BEGIN
		UPDATE libri.ocr_batch_admissions
		SET manifest_sha256 = repeat('c', 64)
		WHERE id = 'f5000000-0000-4000-8000-000000000002';
		RAISE EXCEPTION 'libri_worker rewrote a confirmed manifest';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'enqueued' AND enqueued_at IS NOT NULL
		FROM libri.ocr_batch_admissions
		WHERE id = 'f5000000-0000-4000-8000-000000000001'
	)
		AND (
			SELECT status = 'confirmed'
				AND enqueued_at IS NULL
				AND manifest_sha256 = repeat('b', 64)
			FROM libri.ocr_batch_admissions
			WHERE id = 'f5000000-0000-4000-8000-000000000002'
		),
	'worker may advance confirmed to enqueued but may not cancel or rewrite admissions'
);

SET ROLE service_role;
UPDATE libri.ocr_batch_admissions
SET status = 'cancelled', enqueued_at = NULL
WHERE id = 'f5000000-0000-4000-8000-000000000002';
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'cancelled'
		FROM libri.ocr_batch_admissions
		WHERE id = 'f5000000-0000-4000-8000-000000000002'
	),
	'service authority must retain the separate cancellation path'
);
