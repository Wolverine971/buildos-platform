-- supabase/tests/20260901153414_libri_ocr_admission_dispatch_timestamp_guard.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_batch_dispatcher_access_base.sql
\ir ../migrations/20260901153414_libri_ocr_admission_dispatch_timestamp_guard.sql

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
			AND routine.proconfig @> ARRAY['search_path=pg_catalog, libri']::text[]
		FROM pg_catalog.pg_proc AS routine
		WHERE routine.oid =
			'libri.enforce_ocr_batch_admission_dispatch()'::regprocedure
	),
	'dispatch timestamp guard must remain security invoker with a fixed search path'
);

INSERT INTO auth.users (id) VALUES ('f1000000-0000-4000-8000-000000000001');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'f2000000-0000-4000-8000-000000000001',
	'dispatch-timestamp-guard',
	'Dispatch timestamp guard',
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
	'dispatch-timestamp-future',
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
	'dispatch-timestamp-now',
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
	id, library_id, run_id, confirmation_id, confirmed_by, manifest_sha256
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

DO $$
BEGIN
	BEGIN
		UPDATE libri.ocr_batch_admissions
		SET status = 'enqueued', enqueued_at = now() + interval '1 hour', updated_at = now()
		WHERE id = 'f5000000-0000-4000-8000-000000000001';
		RAISE EXCEPTION 'libri_worker recorded a future enqueue timestamp';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

UPDATE libri.ocr_batch_admissions
SET status = 'enqueued', enqueued_at = now(), updated_at = now()
WHERE id = 'f5000000-0000-4000-8000-000000000002';

RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'confirmed' AND enqueued_at IS NULL
		FROM libri.ocr_batch_admissions
		WHERE id = 'f5000000-0000-4000-8000-000000000001'
	)
	AND (
		SELECT status = 'enqueued' AND enqueued_at IS NOT NULL
		FROM libri.ocr_batch_admissions
		WHERE id = 'f5000000-0000-4000-8000-000000000002'
	),
	'worker must enqueue only with the current transaction timestamp'
);
