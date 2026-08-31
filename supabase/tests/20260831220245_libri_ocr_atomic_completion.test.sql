-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_atomic_completion_base.sql

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
				'enforce_ocr_image_worker_write',
				'enforce_ocr_source_chunk_worker_write',
				'authorize_ocr_provider_call',
				'persist_and_settle_ocr_result'
			)
	),
	'OCR execution routines must remain security invoker'
);

SELECT pg_temp.assert_true(
	has_function_privilege(
		'libri_worker',
		'libri.authorize_ocr_provider_call(uuid,uuid,uuid,integer,uuid,uuid,uuid)',
		'EXECUTE'
	)
		AND has_function_privilege(
			'libri_worker',
			'libri.persist_and_settle_ocr_result(uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text,numeric,text,bigint,bigint,bigint,text)',
			'EXECUTE'
		)
		AND NOT has_table_privilege(
			'libri_worker', 'libri.images', 'SELECT, UPDATE'
		)
		AND has_column_privilege(
			'libri_worker', 'libri.images', 'ocr_status', 'UPDATE'
		)
		AND NOT has_column_privilege(
			'libri_worker', 'libri.images', 'object_path', 'SELECT, UPDATE'
		)
		AND NOT has_table_privilege(
			'libri_worker', 'libri.source_chunks', 'SELECT, INSERT, UPDATE, DELETE'
		)
		AND has_column_privilege(
			'libri_worker', 'libri.source_chunks', 'content', 'INSERT'
		)
		AND NOT has_column_privilege(
			'libri_worker', 'libri.source_chunks', 'verification_status', 'INSERT'
		),
	'worker access must remain column-scoped to OCR state and chunks'
);

INSERT INTO auth.users (id) VALUES ('a1111111-1111-4111-8111-111111111111');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'ocr-atomic-test',
	'OCR atomic test library',
	'a1111111-1111-4111-8111-111111111111'
);
INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'a1111111-1111-4111-8111-111111111111',
	'owner'
);
INSERT INTO libri.books (id, library_id, title) VALUES (
	'abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'OCR atomic test book'
);
INSERT INTO libri.sources (
	id, library_id, source_type, source_key, title, status, discovered_by
) VALUES (
	'ac000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'scanned_image',
	'ocr-atomic:image-one',
	'OCR atomic image one',
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
	page_label,
	ocr_status,
	ocr_version
) VALUES (
	'ad000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'ac000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/ad000000-0000-4000-8000-000000000001/original.jpeg',
	'page-one.jpeg',
	'image/jpeg',
	4096,
	repeat('a', 64),
	'page',
	'1',
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
	cost_budget_microusd,
	deadline_at
) VALUES (
	'ae000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'ocr-atomic-run',
	'libri_ingest',
	'ocr_image',
	'book',
	'abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'system',
	'running',
	now(),
	2,
	1000000,
	now() + interval '10 minutes'
);

INSERT INTO public.queue_jobs (
	id,
	queue_job_id,
	user_id,
	job_type,
	status,
	priority,
	scheduled_for,
	processing_token,
	started_at
) VALUES
(
	'af000000-0000-4000-8000-000000000001',
	'libri_ocr_atomic_one',
	'a1111111-1111-4111-8111-111111111111',
	'libri_ingest',
	'processing',
	100,
	now(),
	'af111111-1111-4111-8111-111111111111',
	now()
),
(
	'af000000-0000-4000-8000-000000000002',
	'libri_ocr_atomic_competitor',
	'a1111111-1111-4111-8111-111111111111',
	'libri_ingest',
	'processing',
	100,
	now(),
	'af222222-2222-4222-8222-222222222222',
	now()
),
(
	'af000000-0000-4000-8000-000000000003',
	'buildos_ocr_atomic_control',
	'a1111111-1111-4111-8111-111111111111',
	'other',
	'pending',
	1,
	now(),
	NULL,
	NULL
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
	'b0000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'ae000000-0000-4000-8000-000000000001',
	'ocr-atomic-valid-step',
	'libri_ingest',
	'ocr_image',
	'capture_sources',
	0,
	'leased',
	1,
	'{"version":1,"kind":"ocr_image","imageId":"ad000000-0000-4000-8000-000000000001","expectedOcrVersion":1,"maxOutputChars":100000}'::jsonb,
	'af000000-0000-4000-8000-000000000001',
	'af111111-1111-4111-8111-111111111111',
	1,
	'b0111111-1111-4111-8111-111111111111',
	'libri-worker:test',
	now(),
	now() + interval '5 minutes',
	now(),
	now()
),
(
	'b0000000-0000-4000-8000-000000000002',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'ae000000-0000-4000-8000-000000000001',
	'ocr-atomic-competing-step',
	'libri_ingest',
	'ocr_image',
	'capture_sources',
	1,
	'leased',
	1,
	'{"version":1,"kind":"ocr_image","imageId":"ad000000-0000-4000-8000-000000000001","expectedOcrVersion":1,"maxOutputChars":100000}'::jsonb,
	'af000000-0000-4000-8000-000000000002',
	'af222222-2222-4222-8222-222222222222',
	1,
	'b0222222-2222-4222-8222-222222222222',
	'libri-worker:test',
	now(),
	now() + interval '5 minutes',
	now(),
	now()
);

SET ROLE libri_worker;

CREATE TEMP TABLE primary_reservation AS
SELECT * FROM libri.reserve_provider_cost(
	'b0000000-0000-4000-8000-000000000001',
	1,
	'b0111111-1111-4111-8111-111111111111',
	'ocr:image:ad000000-0000-4000-8000-000000000001:version:1',
	'openrouter',
	'openai/gpt-4.1-mini',
	100000
);

CREATE TEMP TABLE primary_authorization AS
SELECT * FROM libri.authorize_ocr_provider_call(
	'af000000-0000-4000-8000-000000000001',
	'af111111-1111-4111-8111-111111111111',
	'b0000000-0000-4000-8000-000000000001',
	1,
	'b0111111-1111-4111-8111-111111111111',
	(SELECT reservation_id FROM primary_reservation),
	'ad000000-0000-4000-8000-000000000001'
);

SELECT pg_temp.assert_true(
	(
		SELECT authorized AND outcome = 'started'
			AND max_output_chars = 100000
			AND provider = 'openrouter'
			AND model = 'openai/gpt-4.1-mini'
		FROM primary_authorization
	),
	'the exact queue, lease, reservation, and image must authorize one paid call'
);

SELECT pg_temp.assert_true(
	(
		SELECT NOT authorized AND outcome = 'started'
		FROM libri.authorize_ocr_provider_call(
			'af000000-0000-4000-8000-000000000001',
			'af111111-1111-4111-8111-111111111111',
			'b0000000-0000-4000-8000-000000000001',
			1,
			'b0111111-1111-4111-8111-111111111111',
			(SELECT reservation_id FROM primary_reservation),
			'ad000000-0000-4000-8000-000000000001'
		)
	),
	'a repeated authorization must expose reconciliation state instead of allowing a second call'
);

CREATE TEMP TABLE competing_reservation AS
SELECT * FROM libri.reserve_provider_cost(
	'b0000000-0000-4000-8000-000000000002',
	1,
	'b0222222-2222-4222-8222-222222222222',
	'ocr:image:ad000000-0000-4000-8000-000000000001:version:1',
	'openrouter',
	'openai/gpt-4.1-mini',
	100000
);

SELECT pg_temp.assert_true(
	(
		SELECT NOT authorized AND outcome = 'image_unavailable'
		FROM libri.authorize_ocr_provider_call(
			'af000000-0000-4000-8000-000000000002',
			'af222222-2222-4222-8222-222222222222',
			'b0000000-0000-4000-8000-000000000002',
			1,
			'b0222222-2222-4222-8222-222222222222',
			(SELECT reservation_id FROM competing_reservation),
			'ad000000-0000-4000-8000-000000000001'
		)
	),
	'a competing lease must not authorize a duplicate paid call for the claimed image'
);

SELECT * FROM libri.release_provider_cost(
	(SELECT reservation_id FROM competing_reservation),
	1,
	'b0222222-2222-4222-8222-222222222222',
	'image_already_claimed'
);

CREATE TEMP TABLE persisted_result AS
SELECT * FROM libri.persist_and_settle_ocr_result(
	'af000000-0000-4000-8000-000000000001',
	'af111111-1111-4111-8111-111111111111',
	'b0000000-0000-4000-8000-000000000001',
	1,
	'b0111111-1111-4111-8111-111111111111',
	(SELECT reservation_id FROM primary_reservation),
	'ad000000-0000-4000-8000-000000000001',
	'Atomic OCR text',
	'One sentence summary.',
	0.95,
	'en',
	1234,
	25,
	9,
	'openrouter-request-atomic-1'
);

SELECT pg_temp.assert_true(
	(
		SELECT accepted AND outcome = 'settled' AND source_chunk_id IS NOT NULL
			AND ocr_version = 1 AND NOT over_budget
			AND total_spent_microusd = 1234
		FROM persisted_result
	),
	'OCR persistence and cost settlement must succeed under the exact live fence'
);

DO $$
BEGIN
	BEGIN
		UPDATE libri.images
		SET ocr_status = 'failed', ocr_metadata = '{}'::jsonb
		WHERE id = 'ad000000-0000-4000-8000-000000000001';
		RAISE EXCEPTION 'invalid direct image transition unexpectedly succeeded';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM = 'invalid direct image transition unexpectedly succeeded' THEN
			RAISE;
		END IF;
	END;

	BEGIN
		INSERT INTO libri.source_chunks (
			library_id, source_id, book_id, image_id, chunk_type,
			content, content_sha256, idempotency_key, metadata
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'ac000000-0000-4000-8000-000000000001',
			'abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			NULL,
			'other',
			'not OCR',
			repeat('f', 64),
			'not-ocr',
			'{}'::jsonb
		);
		RAISE EXCEPTION 'non-OCR direct chunk unexpectedly succeeded';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM = 'non-OCR direct chunk unexpectedly succeeded' THEN
			RAISE;
		END IF;
	END;
END;
$$;

RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT ocr_status = 'complete' AND ocr_version = 1
			AND ocr_metadata->>'sourceChunkId' = (
				SELECT source_chunk_id::text FROM persisted_result
			)
		FROM libri.images
		WHERE id = 'ad000000-0000-4000-8000-000000000001'
	),
	'image completion must point to the exact durable OCR chunk'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND bool_and(chunk_type = 'ocr')
			AND bool_and(content = 'Atomic OCR text')
			AND bool_and(content_sha256 = encode(
				extensions.digest(convert_to('Atomic OCR text', 'UTF8'), 'sha256'),
				'hex'
			))
		FROM libri.source_chunks
		WHERE image_id = 'ad000000-0000-4000-8000-000000000001'
	),
	'OCR output must be stored once with a database-derived content hash'
);
SELECT pg_temp.assert_true(
	(
		SELECT status = 'settled'
			AND actual_cost_microusd = 1234
			AND prompt_tokens = 25
			AND completion_tokens = 9
			AND provider_request_id = 'openrouter-request-atomic-1'
		FROM libri.provider_cost_reservations
		WHERE id = (SELECT reservation_id FROM primary_reservation)
	),
	'provider usage must settle in the same database operation as OCR persistence'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1 AND bool_and(status = 'pending') AND bool_and(job_type = 'other')
		FROM public.queue_jobs
		WHERE queue_job_id = 'buildos_ocr_atomic_control'
	),
	'OCR authorization and persistence must not mutate the BuildOS queue control'
);

SELECT 'libri_ocr_atomic_completion_contract_ok' AS result;
