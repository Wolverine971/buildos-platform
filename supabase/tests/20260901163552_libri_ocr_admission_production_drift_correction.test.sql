-- supabase/tests/20260901163552_libri_ocr_admission_production_drift_correction.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_batch_dispatcher_access_base.sql
\ir ../migrations/20260901153414_libri_ocr_admission_dispatch_timestamp_guard.sql
\ir ../migrations/20260901155435_libri_ocr_admission_finalizer_hardening.sql

-- Reproduce all four observed stale properties before applying the correction:
-- the global metadata scan, invoker-rights finalizer without a post-update
-- expiry check, mutable enqueued queue link, and raw worker update grant.
CREATE OR REPLACE FUNCTION libri.enforce_ocr_batch_admission_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	receipt_count bigint;
BEGIN
	SELECT count(*)
	INTO receipt_count
	FROM public.queue_jobs AS queue
	WHERE queue.metadata->>'libriAdmissionId' = OLD.id::text;
	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION libri.finalize_ocr_batch_admission_dispatch(
	p_admission_id uuid,
	p_dispatch_expires_at timestamptz
)
RETURNS TABLE (
	admission_id uuid,
	enqueued_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
BEGIN
	RETURN QUERY
	SELECT admission.id, admission.enqueued_at
	FROM libri.ocr_batch_admissions AS admission
	WHERE admission.id = p_admission_id AND false;
END;
$function$;

CREATE OR REPLACE FUNCTION libri.enforce_confirmed_ocr_step_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
BEGIN
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

GRANT UPDATE ON TABLE libri.ocr_batch_admissions TO libri_worker;
GRANT UPDATE (status, enqueued_at, updated_at)
	ON TABLE libri.ocr_batch_admissions TO libri_worker;

\ir ../migrations/20260901163552_libri_ocr_admission_production_drift_correction.sql

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
	'correction must restore the reviewed security-definer finalizer'
);

SELECT pg_temp.assert_true(
	pg_catalog.has_function_privilege(
		'libri_worker',
		'libri.finalize_ocr_batch_admission_dispatch(uuid,timestamptz)',
		'EXECUTE'
	)
	AND NOT pg_catalog.has_function_privilege(
		'libri_worker',
		'libri.enforce_ocr_batch_admission_dispatch()',
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
	)
	AND NOT pg_catalog.has_column_privilege(
		'libri_worker',
		'libri.ocr_batch_admissions',
		'enqueued_at',
		'UPDATE'
	)
	AND NOT pg_catalog.has_column_privilege(
		'libri_worker',
		'libri.ocr_batch_admissions',
		'updated_at',
		'UPDATE'
	)
	AND NOT pg_catalog.has_table_privilege(
		'libri_worker',
		'libri.ocr_batch_admissions',
		'UPDATE'
	),
	'correction must restore the worker privilege boundary'
);

SELECT pg_temp.assert_true(
	pg_catalog.strpos(
		pg_catalog.pg_get_functiondef(
			'libri.enforce_ocr_batch_admission_dispatch()'::regprocedure
		),
		'receipt_count'
	) = 0,
	'correction must remove the shared queue metadata scan'
);

SELECT pg_temp.assert_true(
	pg_catalog.strpos(
		pg_catalog.pg_get_functiondef(
			'libri.finalize_ocr_batch_admission_dispatch(uuid,timestamptz)'::regprocedure
		),
		'dispatch window expired during finalization'
	) > 0,
	'correction must retain the post-update expiry rollback'
);

SELECT pg_temp.assert_true(
	pg_catalog.strpos(
		pg_catalog.pg_get_functiondef(
			'libri.enforce_confirmed_ocr_step_contract()'::regprocedure
		),
		'NEW.active_queue_job_id IS DISTINCT FROM OLD.active_queue_job_id'
	) > 0,
	'correction must freeze the active queue link after enqueue'
);

SELECT 'libri OCR admission production drift correction contract passed' AS result;
