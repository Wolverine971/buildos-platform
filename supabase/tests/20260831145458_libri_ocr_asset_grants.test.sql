-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_asset_grants_base.sql

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
		SELECT count(*) = 4 AND bool_and(NOT routine.prosecdef)
		FROM pg_catalog.pg_proc AS routine
		JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
		WHERE namespace.nspname = 'libri'
			AND routine.proname IN (
				'validate_ocr_asset_lease',
				'enforce_ocr_asset_grant_write',
				'issue_ocr_asset_grant',
				'consume_ocr_asset_grant'
			)
	),
	'OCR asset routines must remain security invoker'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'libri_worker',
		'libri.validate_ocr_asset_lease(uuid,integer,uuid,uuid)',
		'EXECUTE'
	)
		AND has_function_privilege(
			'libri_worker',
			'libri.issue_ocr_asset_grant(uuid,integer,uuid,uuid)',
			'EXECUTE'
		)
		AND NOT has_function_privilege(
			'libri_worker',
			'libri.consume_ocr_asset_grant(uuid)',
			'EXECUTE'
		)
		AND has_function_privilege(
			'service_role',
			'libri.consume_ocr_asset_grant(uuid)',
			'EXECUTE'
		)
		AND NOT has_function_privilege(
			'authenticated',
			'libri.consume_ocr_asset_grant(uuid)',
			'EXECUTE'
		),
	'only the worker may issue and only the server service role may consume grants'
);
SELECT pg_temp.assert_true(
	NOT has_table_privilege(
		'libri_worker', 'libri.images', 'SELECT'
	)
		AND has_column_privilege(
			'libri_worker', 'libri.images', 'bucket_id', 'SELECT'
		)
		AND NOT has_column_privilege(
			'libri_worker', 'libri.images', 'object_path', 'SELECT'
		)
		AND NOT has_table_privilege(
			'libri_worker', 'storage.buckets', 'SELECT, INSERT, UPDATE, DELETE'
		)
		AND NOT has_table_privilege(
			'libri_worker', 'storage.objects', 'SELECT, INSERT, UPDATE, DELETE'
		)
		AND has_column_privilege(
			'libri_worker', 'libri.ocr_asset_grants', 'step_id', 'INSERT'
		)
		AND has_column_privilege(
			'libri_worker', 'libri.ocr_asset_grants', 'id', 'SELECT'
		)
		AND NOT has_column_privilege(
			'libri_worker', 'libri.ocr_asset_grants', 'library_id', 'INSERT'
		)
		AND NOT has_table_privilege(
			'libri_worker', 'libri.ocr_asset_grants', 'UPDATE, DELETE'
		)
		AND NOT has_table_privilege(
			'authenticated', 'libri.ocr_asset_grants', 'SELECT, INSERT, UPDATE, DELETE'
		),
	'worker grants must hide object paths, deny Storage access, and expose only opaque receipts'
);

INSERT INTO auth.users (id) VALUES ('91111111-1111-4111-8111-111111111111');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'ocr-asset-grant-test',
	'OCR asset grant test library',
	'91111111-1111-4111-8111-111111111111'
);
INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'91111111-1111-4111-8111-111111111111',
	'owner'
);
INSERT INTO libri.books (id, library_id, title) VALUES (
	'9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'OCR capability test book'
);
INSERT INTO libri.sources (
	id, library_id, source_type, source_key, title, status, discovered_by
) VALUES
(
	'91000000-0000-4000-8000-000000000001',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'scanned_image',
	'ocr-capability:one',
	'OCR capability image one',
	'ready',
	'convex_migration'
),
(
	'91000000-0000-4000-8000-000000000002',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'scanned_image',
	'ocr-capability:two',
	'OCR capability image two',
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
	'92000000-0000-4000-8000-000000000001',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'91000000-0000-4000-8000-000000000001',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/92000000-0000-4000-8000-000000000001/original.jpeg',
	'page-one.jpeg',
	'image/jpeg',
	4096,
	repeat('a', 64),
	'page',
	'pending',
	0
),
(
	'92000000-0000-4000-8000-000000000002',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'91000000-0000-4000-8000-000000000002',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/92000000-0000-4000-8000-000000000002/original.webp',
	'page-two.webp',
	'image/webp',
	2048,
	repeat('b', 64),
	'page',
	'pending',
	0
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
	status,
	started_at,
	planned_steps,
	deadline_at
) VALUES (
	'93000000-0000-4000-8000-000000000001',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'ocr-asset-grant-run',
	'libri_ingest',
	'ocr_image',
	'book',
	'9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'system',
	'running',
	now(),
	2,
	now() + interval '10 minutes'
);

INSERT INTO libri.research_steps (
	id,
	library_id,
	run_id,
	idempotency_key,
	queue_family,
	kind,
	stage,
	position,
	status,
	payload_version,
	payload,
	active_queue_job_id,
	active_processing_token,
	execution_generation,
	lease_token,
	lease_owner,
	leased_at,
	lease_expires_at,
	last_heartbeat_at,
	started_at
) VALUES
(
	'94000000-0000-4000-8000-000000000001',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'93000000-0000-4000-8000-000000000001',
	'ocr-asset-valid-step',
	'libri_ingest',
	'ocr_image',
	'capture_sources',
	0,
	'leased',
	1,
	'{"version":1,"kind":"ocr_image","imageId":"92000000-0000-4000-8000-000000000001","expectedOcrVersion":1,"maxOutputChars":100000}'::jsonb,
	'94111111-1111-4111-8111-111111111111',
	'94222222-2222-4222-8222-222222222222',
	1,
	'94333333-3333-4333-8333-333333333333',
	'libri-worker:test',
	now(),
	now() + interval '5 minutes',
	now(),
	now()
),
(
	'94000000-0000-4000-8000-000000000002',
	'9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'93000000-0000-4000-8000-000000000001',
	'ocr-asset-extra-payload-step',
	'libri_ingest',
	'ocr_image',
	'capture_sources',
	1,
	'leased',
	1,
	'{"version":1,"kind":"ocr_image","imageId":"92000000-0000-4000-8000-000000000002","expectedOcrVersion":1,"maxOutputChars":100000,"unexpected":true}'::jsonb,
	'94444444-4444-4444-8444-444444444444',
	'94555555-5555-4555-8555-555555555555',
	1,
	'94666666-6666-4666-8666-666666666666',
	'libri-worker:test',
	now(),
	now() + interval '5 minutes',
	now(),
	now()
);

INSERT INTO public.queue_jobs (
	id, queue_job_id, user_id, job_type, status, priority, scheduled_for
) VALUES (
	'95000000-0000-4000-8000-000000000001',
	'buildos_ocr_asset_control',
	'91111111-1111-4111-8111-111111111111',
	'other',
	'pending',
	1,
	now()
);

SET ROLE libri_worker;

CREATE TEMP TABLE issued_grant AS
SELECT * FROM libri.issue_ocr_asset_grant(
	'94000000-0000-4000-8000-000000000001',
	1,
	'94333333-3333-4333-8333-333333333333',
	'92000000-0000-4000-8000-000000000001'
);

SELECT pg_temp.assert_true(
	(
		SELECT grant_id IS NOT NULL
			AND expires_at > now() + interval '15 seconds'
			AND expires_at <= now() + interval '61 seconds'
		FROM issued_grant
	),
	'a valid exact lease must produce one short-lived opaque grant'
);

INSERT INTO libri.ocr_asset_grants (
	step_id, execution_generation, lease_token, image_id
) VALUES (
	'94000000-0000-4000-8000-000000000001',
	1,
	'94333333-3333-4333-8333-333333333333',
	'92000000-0000-4000-8000-000000000001'
);

DO $$
BEGIN
	BEGIN
		PERFORM * FROM libri.issue_ocr_asset_grant(
			'94000000-0000-4000-8000-000000000001',
			1,
			'94333333-3333-4333-8333-333333333333',
			'92000000-0000-4000-8000-000000000002'
		);
		RAISE EXCEPTION 'mismatched image grant unexpectedly succeeded';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM = 'mismatched image grant unexpectedly succeeded' THEN
			RAISE;
		END IF;
	END;

	BEGIN
		INSERT INTO libri.ocr_asset_grants (
			step_id, execution_generation, lease_token, image_id
		) VALUES (
			'94000000-0000-4000-8000-000000000001',
			2,
			'94333333-3333-4333-8333-333333333333',
			'92000000-0000-4000-8000-000000000001'
		);
		RAISE EXCEPTION 'stale generation insert unexpectedly succeeded';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM = 'stale generation insert unexpectedly succeeded' THEN
			RAISE;
		END IF;
	END;

	BEGIN
		PERFORM * FROM libri.issue_ocr_asset_grant(
			'94000000-0000-4000-8000-000000000002',
			1,
			'94666666-6666-4666-8666-666666666666',
			'92000000-0000-4000-8000-000000000002'
		);
		RAISE EXCEPTION 'extra payload key unexpectedly succeeded';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM = 'extra payload key unexpectedly succeeded' THEN
			RAISE;
		END IF;
	END;
END;
$$;

RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2
			AND bool_and(library_id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
			AND bool_and(run_id = '93000000-0000-4000-8000-000000000001')
			AND bool_and(expected_ocr_version = 1)
			AND bool_and(content_sha256 = repeat('a', 64))
			AND bool_and(expires_at <= issued_at + interval '60 seconds')
		FROM libri.ocr_asset_grants
	),
	'the trigger must derive and fence every routine and direct-DML grant'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND bool_and(status = 'pending')
			AND bool_and(job_type = 'other')
		FROM public.queue_jobs
		WHERE queue_job_id = 'buildos_ocr_asset_control'
	),
	'asset grant issuance must not mutate the BuildOS queue control'
);

CREATE TEMP TABLE grant_to_redeem AS
SELECT id
FROM libri.ocr_asset_grants
ORDER BY issued_at, id
LIMIT 1;
GRANT SELECT ON grant_to_redeem TO service_role;

SET ROLE service_role;

CREATE TEMP TABLE redeemed_asset AS
SELECT *
FROM libri.consume_ocr_asset_grant((SELECT id FROM grant_to_redeem));

SELECT pg_temp.assert_true(
	(
		SELECT bucket_id = 'libri-assets'
			AND object_path = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/92000000-0000-4000-8000-000000000001/original.jpeg'
			AND mime_type = 'image/jpeg'
			AND expires_at > now() + interval '5 seconds'
		FROM redeemed_asset
	),
	'the server-only consumer must resolve the exact private object once'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM libri.consume_ocr_asset_grant((SELECT id FROM grant_to_redeem))
	),
	'a consumed capability must not be redeemable twice'
);

RESET ROLE;

SET ROLE libri_worker;
CREATE TEMP TABLE cancelled_grant AS
SELECT * FROM libri.issue_ocr_asset_grant(
	'94000000-0000-4000-8000-000000000001',
	1,
	'94333333-3333-4333-8333-333333333333',
	'92000000-0000-4000-8000-000000000001'
);
GRANT SELECT ON cancelled_grant TO service_role;
RESET ROLE;

UPDATE libri.research_runs
SET cancel_requested_at = now(), status = 'cancelling'
WHERE id = '93000000-0000-4000-8000-000000000001';

SET ROLE service_role;
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 0
		FROM libri.consume_ocr_asset_grant((SELECT grant_id FROM cancelled_grant))
	),
	'run cancellation after issuance must invalidate an unconsumed capability'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT consumed_at IS NULL
		FROM libri.ocr_asset_grants
		WHERE id = (SELECT grant_id FROM cancelled_grant)
	),
	'a rejected stale capability must remain unconsumed for audit'
);

SELECT 'libri_ocr_asset_grants_contract_ok' AS result;
