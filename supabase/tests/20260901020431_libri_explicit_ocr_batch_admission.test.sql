-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_explicit_ocr_batch_admission_base.sql
\set libri_ocr_batch_fixture_loaded true
\ir 20260901012550_libri_explicit_ocr_batch_planner.test.sql
\unset libri_ocr_batch_fixture_loaded

SELECT pg_temp.assert_true(
	(
		SELECT relation.relrowsecurity AND relation.relforcerowsecurity
		FROM pg_catalog.pg_class AS relation
		WHERE relation.oid = 'libri.ocr_batch_admissions'::regclass
	)
		AND has_table_privilege('service_role', 'libri.ocr_batch_admissions', 'SELECT, INSERT, UPDATE, DELETE')
		AND NOT has_table_privilege('authenticated', 'libri.ocr_batch_admissions', 'SELECT, INSERT, UPDATE, DELETE')
		AND NOT has_table_privilege('libri_worker', 'libri.ocr_batch_admissions', 'SELECT, INSERT, UPDATE, DELETE'),
	'admissions must remain server-only and inert until a later dispatcher migration'
);

SELECT pg_temp.assert_true(
	(
		SELECT NOT routine.prosecdef
			AND routine.proconfig @> ARRAY['search_path=pg_catalog, libri']::text[]
		FROM pg_catalog.pg_proc AS routine
		WHERE routine.oid =
			'libri.confirm_explicit_ocr_batch_admission(uuid,uuid,uuid,uuid,text,uuid[],uuid[],integer[],text[],uuid)'::regprocedure
	)
		AND has_function_privilege(
			'service_role',
			'libri.confirm_explicit_ocr_batch_admission(uuid,uuid,uuid,uuid,text,uuid[],uuid[],integer[],text[],uuid)',
			'EXECUTE'
		)
		AND NOT has_function_privilege(
			'authenticated',
			'libri.confirm_explicit_ocr_batch_admission(uuid,uuid,uuid,uuid,text,uuid[],uuid[],integer[],text[],uuid)',
			'EXECUTE'
		)
		AND NOT has_function_privilege(
			'libri_worker',
			'libri.confirm_explicit_ocr_batch_admission(uuid,uuid,uuid,uuid,text,uuid[],uuid[],integer[],text[],uuid)',
			'EXECUTE'
		),
	'only the authenticated server control plane may record an OCR batch admission'
);

SET ROLE service_role;

CREATE TEMP TABLE confirmation_manifest AS
SELECT
	array_agg(item.step_id ORDER BY item.position) AS step_ids,
	array_agg(item.image_id ORDER BY item.position) AS image_ids,
	array_agg(item.expected_ocr_version ORDER BY item.position) AS expected_ocr_versions,
	array_agg(item.image_content_sha256 ORDER BY item.position) AS image_content_sha256s
FROM libri.ocr_batch_items AS item
WHERE item.run_id = (SELECT run_id FROM first_receipt);

CREATE TEMP TABLE first_admission AS
SELECT *
FROM libri.confirm_explicit_ocr_batch_admission(
	'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	(SELECT run_id FROM first_receipt),
	'df000000-0000-4000-8000-000000000001',
	repeat('e', 64),
	(SELECT step_ids FROM confirmation_manifest),
	(SELECT image_ids FROM confirmation_manifest),
	(SELECT expected_ocr_versions FROM confirmation_manifest),
	(SELECT image_content_sha256s FROM confirmation_manifest),
	'd2222222-2222-4222-8222-222222222222'
);

SELECT pg_temp.assert_true(
	(SELECT created AND admission_status = 'confirmed' FROM first_admission)
		AND (SELECT count(*) = 1 FROM libri.ocr_batch_admissions)
		AND (
			SELECT count(*) = 2
				AND bool_and(step.status = 'pending')
				AND bool_and(step.active_queue_job_id IS NULL)
			FROM libri.research_steps AS step
			WHERE step.run_id = (SELECT run_id FROM first_receipt)
		)
		AND (SELECT count(*) = 1 FROM public.queue_jobs)
		AND (SELECT signature FROM buildos_control_before) = (
			SELECT md5(row_to_json(control)::text)
			FROM public.queue_jobs AS control
			WHERE control.id = 'de000000-0000-4000-8000-000000000001'
		),
	'confirmation must persist one exact admission without queue or step mutation'
);

CREATE TEMP TABLE repeated_admission AS
SELECT *
FROM libri.confirm_explicit_ocr_batch_admission(
	'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	(SELECT run_id FROM first_receipt),
	'df000000-0000-4000-8000-000000000001',
	repeat('e', 64),
	(SELECT step_ids FROM confirmation_manifest),
	(SELECT image_ids FROM confirmation_manifest),
	(SELECT expected_ocr_versions FROM confirmation_manifest),
	(SELECT image_content_sha256s FROM confirmation_manifest),
	'd2222222-2222-4222-8222-222222222222'
);

SELECT pg_temp.assert_true(
	(
		SELECT NOT repeated.created
			AND repeated.admission_id = first.admission_id
			AND repeated.admission_status = first.admission_status
		FROM repeated_admission AS repeated
		CROSS JOIN first_admission AS first
	)
		AND (SELECT count(*) = 1 FROM libri.ocr_batch_admissions)
		AND (SELECT count(*) = 1 FROM public.queue_jobs),
	'an exact admission replay must return the original record without transport duplication'
);

DO $$
BEGIN
	BEGIN
		PERFORM *
		FROM libri.confirm_explicit_ocr_batch_admission(
			'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			(SELECT run_id FROM first_receipt),
			'df000000-0000-4000-8000-000000000002',
			repeat('e', 64),
			(SELECT step_ids FROM confirmation_manifest),
			(SELECT image_ids FROM confirmation_manifest),
			(SELECT expected_ocr_versions FROM confirmation_manifest),
			(SELECT image_content_sha256s FROM confirmation_manifest),
			'd1111111-1111-4111-8111-111111111111'
		);
		RAISE EXCEPTION 'a different library editor confirmed another user''s plan';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	BEGIN
		PERFORM *
		FROM libri.confirm_explicit_ocr_batch_admission(
			'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			(SELECT run_id FROM first_receipt),
			'df000000-0000-4000-8000-000000000002',
			repeat('f', 64),
			(SELECT step_ids FROM confirmation_manifest),
			(SELECT image_ids[2:2] || image_ids[1:1] FROM confirmation_manifest),
			(SELECT expected_ocr_versions FROM confirmation_manifest),
			(SELECT image_content_sha256s FROM confirmation_manifest),
			'd2222222-2222-4222-8222-222222222222'
		);
		RAISE EXCEPTION 'a stale or reordered manifest was admitted';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.ocr_batch_admissions)
		AND (SELECT count(*) = 1 FROM public.queue_jobs)
		AND (SELECT signature FROM buildos_control_before) = (
			SELECT md5(row_to_json(control)::text)
			FROM public.queue_jobs AS control
			WHERE control.id = 'de000000-0000-4000-8000-000000000001'
		),
	'rejected confirmations must preserve the admission and BuildOS queue controls'
);

UPDATE libri.ocr_batch_admissions
SET
	status = 'enqueued',
	enqueued_at = now()
WHERE id = (SELECT admission_id FROM first_admission);

UPDATE libri.research_steps
SET status = 'queued'
WHERE run_id = (SELECT run_id FROM first_receipt);

UPDATE libri.research_runs
SET
	status = 'running',
	started_at = now(),
	deadline_at = now() - interval '1 minute'
WHERE id = (SELECT run_id FROM first_receipt);

CREATE TEMP TABLE enqueued_replay AS
SELECT *
FROM libri.confirm_explicit_ocr_batch_admission(
	'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	(SELECT run_id FROM first_receipt),
	'df000000-0000-4000-8000-000000000001',
	repeat('e', 64),
	(SELECT step_ids FROM confirmation_manifest),
	(SELECT image_ids FROM confirmation_manifest),
	(SELECT expected_ocr_versions FROM confirmation_manifest),
	(SELECT image_content_sha256s FROM confirmation_manifest),
	'd2222222-2222-4222-8222-222222222222'
);

SELECT pg_temp.assert_true(
	(
		SELECT NOT replay.created
			AND replay.admission_id = first.admission_id
			AND replay.admission_status = 'enqueued'
		FROM enqueued_replay AS replay
		CROSS JOIN first_admission AS first
	)
		AND (SELECT count(*) = 1 FROM libri.ocr_batch_admissions)
		AND (SELECT count(*) = 1 FROM public.queue_jobs),
	'an exact replay must remain readable after a later dispatcher advances the batch'
);

RESET ROLE;
