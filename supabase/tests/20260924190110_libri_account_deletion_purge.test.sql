-- supabase/tests/20260924190110_libri_account_deletion_purge.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
-- Contract for 20260924190110_libri_account_deletion_purge.sql: a person's Libri
-- footprint (a library with OCR admissions and a published upload chain, notes
-- and uploads in shared libraries, memberships) is removed, shared libraries
-- survive under another owner, and nothing left RESTRICTs the auth user delete.
\set ON_ERROR_STOP on
\ir fixtures/libri_account_deletion_purge_base.sql
\ir ../migrations/20260924190110_libri_account_deletion_purge.sql

CREATE FUNCTION pg_temp.expect(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF p_condition IS NOT TRUE THEN
		RAISE EXCEPTION 'libri account deletion contract failed: %', p_message;
	END IF;
END;
$$;

-- u = person deleting, o = someone else.
-- l1: created by u, sole owner. l2: created by u, co-owned by o. l3: created by o, u edits.
INSERT INTO auth.users (id) VALUES
	('11111111-1111-4111-8111-111111111111'),
	('22222222-2222-4222-8222-222222222222');

INSERT INTO libri.libraries (id, slug, name, created_by) VALUES
	('a1000000-0000-4000-8000-000000000001', 'solo', 'Solo', '11111111-1111-4111-8111-111111111111'),
	('a2000000-0000-4000-8000-000000000002', 'shared', 'Shared', '11111111-1111-4111-8111-111111111111'),
	('a3000000-0000-4000-8000-000000000003', 'others', 'Others', '22222222-2222-4222-8222-222222222222');

INSERT INTO libri.library_members (library_id, user_id, role, created_at) VALUES
	('a1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner', now()),
	('a2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'owner', now() - interval '1 day'),
	('a2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'owner', now()),
	('a3000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'owner', now()),
	('a3000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'editor', now());

INSERT INTO libri.books (id, library_id, title) VALUES
	('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Solo book'),
	('b2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Shared book'),
	('b3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'Other book');

INSERT INTO libri.chapters (id, library_id, book_id, position, number, title) VALUES
	('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
		'b1000000-0000-4000-8000-000000000001', 0, '1', 'Opening');

INSERT INTO libri.notes (library_id, book_id, chapter_id, owner_user_id, content) VALUES
	('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
		'c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'solo note'),
	('a2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', NULL,
		'11111111-1111-4111-8111-111111111111', 'my note in a shared library'),
	('a2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', NULL,
		'22222222-2222-4222-8222-222222222222', 'co-owner note'),
	('a3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000003', NULL,
		'11111111-1111-4111-8111-111111111111', 'my note in someone else''s library');

-- Published upload in l1: publication, image and source share one id.
INSERT INTO libri.sources (id, library_id, source_type, source_key, title) VALUES
	('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
		'scanned_image', 'upload:d1', 'Scanned page');

INSERT INTO libri.images (
	id, library_id, book_id, source_id, object_path, original_filename, mime_type,
	byte_size, content_sha256, image_type
) VALUES (
	'd1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
	'b1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
	'a1000000-0000-4000-8000-000000000001/images/d1000000-0000-4000-8000-000000000001/original.jpeg',
	'page.jpg', 'image/jpeg', 1024, repeat('a', 64), 'page'
);

-- An admitted OCR batch over that image: the guards refuse ordinary deletes.
INSERT INTO libri.research_runs (
	id, library_id, idempotency_key, queue_family, kind, subject_type, subject_id,
	requested_by_actor, requested_by, planned_steps
) VALUES (
	'e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
	'ocr-run-1', 'libri_ingest', 'ocr_book_batch', 'book', 'b1000000-0000-4000-8000-000000000001',
	'user', '11111111-1111-4111-8111-111111111111', 1
);
INSERT INTO libri.research_steps (
	id, library_id, run_id, idempotency_key, queue_family, kind, stage, position
) VALUES (
	'e2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001', 'ocr-step-1', 'libri_ingest', 'ocr_image',
	'normalize_chunks', 0
);
INSERT INTO libri.ocr_batch_items (
	library_id, run_id, step_id, image_id, position, expected_ocr_version, image_content_sha256
) VALUES (
	'a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 0, 1,
	repeat('a', 64)
);
INSERT INTO libri.ocr_batch_admissions (library_id, run_id, confirmation_id, confirmed_by, manifest_sha256)
VALUES (
	'a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
	gen_random_uuid(), '11111111-1111-4111-8111-111111111111', repeat('b', 64)
);

-- The full upload pipeline for the published image in l1.
INSERT INTO libri.image_upload_intents (
	id, library_id, book_id, requested_by, idempotency_key, file_metadata, object_path, status,
	created_at, signing_deadline, expires_at, submitted_at
)
SELECT
	'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
	'b1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
	'solo-upload-000001', '{}'::jsonb,
	'a1000000-0000-4000-8000-000000000001/uploads/f1000000-0000-4000-8000-000000000001/original.jpeg',
	'awaiting_verification', stamp, stamp + interval '10 minutes', stamp + interval '135 minutes',
	stamp + interval '5 minutes'
FROM (SELECT now() - interval '3 hours' AS stamp) AS base;
INSERT INTO libri.image_upload_processing (
	upload_id, status, attempt, lease_token, lease_expires_at, available_at, updated_at
) VALUES (
	'f1000000-0000-4000-8000-000000000001', 'published', 1, gen_random_uuid(), now(), now(), now()
);
INSERT INTO libri.image_upload_publications (
	id, upload_id, library_id, book_id, attempt, lease_token, object_path, file_metadata,
	verified_metadata, status, published_at, storage_object_id, image_id, source_id, followup_status
) VALUES (
	'd1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
	'a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 1,
	gen_random_uuid(),
	'a1000000-0000-4000-8000-000000000001/images/d1000000-0000-4000-8000-000000000001/original.jpeg',
	'{}'::jsonb, '{}'::jsonb, 'published', now(), gen_random_uuid(),
	'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'dispatched'
);
INSERT INTO libri.image_upload_retirements (
	upload_id, library_id, outcome, protected_publication_id, retired_at, inspect_after
) VALUES (
	'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'published',
	'd1000000-0000-4000-8000-000000000001', now() - interval '1 hour', now() + interval '26 hours'
);
INSERT INTO libri.image_upload_cleanup_targets (id, upload_id, library_id, kind, object_path) VALUES (
	'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
	'a1000000-0000-4000-8000-000000000001', 'staging',
	'a1000000-0000-4000-8000-000000000001/uploads/f1000000-0000-4000-8000-000000000001/original.jpeg'
);
INSERT INTO libri.image_upload_cleanup_checks (
	target_id, library_id, generation, lease_token, lease_expires_at, status, next_check_at
) VALUES (
	'f2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1,
	gen_random_uuid(), now() + interval '1 minute', 'leased', now()
);
INSERT INTO libri.image_upload_issuances (
	upload_id, library_id, request_id, object_path, attempted_at, sign_before, reservation_expires_at
) VALUES (
	'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
	gen_random_uuid(),
	'a1000000-0000-4000-8000-000000000001/uploads/f1000000-0000-4000-8000-000000000001/original.jpeg',
	now() - interval '3 hours', now() - interval '3 hours' + interval '5 seconds', now()
);

-- The person's own uploads in libraries that survive.
INSERT INTO libri.image_upload_intents (
	id, library_id, book_id, requested_by, idempotency_key, file_metadata, object_path, status,
	created_at, signing_deadline, expires_at
)
SELECT
	upload.id, upload.library_id, upload.book_id, '11111111-1111-4111-8111-111111111111',
	upload.idempotency_key, '{}'::jsonb,
	upload.library_id::text || '/uploads/' || upload.id::text || '/original.png',
	'reserved', stamp, stamp + interval '10 minutes', stamp + interval '135 minutes'
FROM (
	VALUES
		('f3000000-0000-4000-8000-000000000002'::uuid, 'a2000000-0000-4000-8000-000000000002'::uuid,
			'b2000000-0000-4000-8000-000000000002'::uuid, 'shared-upload-00001'),
		('f4000000-0000-4000-8000-000000000003'::uuid, 'a3000000-0000-4000-8000-000000000003'::uuid,
			'b3000000-0000-4000-8000-000000000003'::uuid, 'others-upload-00001')
) AS upload(id, library_id, book_id, idempotency_key),
	(SELECT now() - interval '1 hour' AS stamp) AS base;
INSERT INTO libri.image_upload_issuances (
	upload_id, library_id, request_id, object_path, attempted_at, sign_before, reservation_expires_at
) VALUES (
	'f3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002',
	gen_random_uuid(),
	'a2000000-0000-4000-8000-000000000002/uploads/f3000000-0000-4000-8000-000000000002/original.png',
	now() - interval '1 hour', now() - interval '1 hour' + interval '5 seconds', now()
);

-- Before this migration nothing could remove l1: admissions and the upload chain block it.
DO $$
BEGIN
	BEGIN
		DELETE FROM libri.libraries WHERE id = 'a1000000-0000-4000-8000-000000000001';
		RAISE EXCEPTION 'plain library delete unexpectedly succeeded';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM = 'plain library delete unexpectedly succeeded' THEN
			RAISE;
		END IF;
	END;
END;
$$;

-- Storage scope: the purged library (swept by prefix) and staging paths elsewhere.
SELECT pg_temp.expect(
	libri.account_deletion_storage_scope('11111111-1111-4111-8111-111111111111')
		= jsonb_build_object(
			'library_ids', jsonb_build_array('a1000000-0000-4000-8000-000000000001'),
			'object_paths', jsonb_build_array(
				'a2000000-0000-4000-8000-000000000002/uploads/f3000000-0000-4000-8000-000000000002/original.png',
				'a3000000-0000-4000-8000-000000000003/uploads/f4000000-0000-4000-8000-000000000003/original.png'
			)
		),
	'storage scope lists the purged library and the person''s staging uploads'
);

SELECT pg_temp.expect(
	libri.purge_account_deletion('11111111-1111-4111-8111-111111111111')
		= jsonb_build_object(
			'libraries_deleted', 1,
			'libraries_transferred', 1,
			'notes_deleted', 2,
			'uploads_deleted', 3
		),
	'purge summary'
);

DO $$
DECLARE
	v_table record;
	v_count bigint;
BEGIN
	FOR v_table IN
		SELECT class.relname
		FROM pg_catalog.pg_class AS class
		JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = class.oid
		WHERE class.relnamespace = 'libri'::regnamespace
			AND class.relkind = 'r'
			AND attribute.attname = 'library_id'
			AND NOT attribute.attisdropped
	LOOP
		EXECUTE format('SELECT count(*) FROM libri.%I WHERE library_id = $1', v_table.relname)
		INTO v_count
		USING 'a1000000-0000-4000-8000-000000000001'::uuid;
		PERFORM pg_temp.expect(v_count = 0, 'solo library rows left in libri.' || v_table.relname);
	END LOOP;
END;
$$;

SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM libri.libraries WHERE id = 'a1000000-0000-4000-8000-000000000001'),
	'solo library deleted'
);
SELECT pg_temp.expect(
	(SELECT created_by FROM libri.libraries WHERE id = 'a2000000-0000-4000-8000-000000000002')
		= '22222222-2222-4222-8222-222222222222',
	'co-owned library kept and handed to the remaining owner'
);
SELECT pg_temp.expect(
	(SELECT created_by FROM libri.libraries WHERE id = 'a3000000-0000-4000-8000-000000000003')
		= '22222222-2222-4222-8222-222222222222',
	'someone else''s library untouched'
);
SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM libri.notes WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'),
	'the person''s notes are gone everywhere'
);
SELECT pg_temp.expect(
	EXISTS (SELECT 1 FROM libri.notes WHERE owner_user_id = '22222222-2222-4222-8222-222222222222'),
	'co-owner note kept'
);
SELECT pg_temp.expect(
	NOT EXISTS (
		SELECT 1 FROM libri.image_upload_intents
		WHERE requested_by = '11111111-1111-4111-8111-111111111111'
	)
	AND NOT EXISTS (
		SELECT 1 FROM libri.image_upload_issuances
		WHERE upload_id = 'f3000000-0000-4000-8000-000000000002'
	),
	'the person''s uploads and their issuance rows are gone'
);
SELECT pg_temp.expect(
	NOT EXISTS (
		SELECT 1 FROM libri.library_members
		WHERE user_id = '11111111-1111-4111-8111-111111111111'
	),
	'memberships removed'
);

-- Nothing in libri blocks the auth user delete any more; a rerun is a no-op.
DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';
SELECT pg_temp.expect(
	libri.purge_account_deletion('11111111-1111-4111-8111-111111111111')
		= jsonb_build_object(
			'libraries_deleted', 0,
			'libraries_transferred', 0,
			'notes_deleted', 0,
			'uploads_deleted', 0
		),
	'rerun after completion is a no-op'
);

SELECT pg_temp.expect(
	has_function_privilege('service_role', 'libri.purge_account_deletion(uuid)', 'EXECUTE')
		AND has_function_privilege('service_role', 'libri.account_deletion_storage_scope(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'libri.purge_account_deletion(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'libri.account_deletion_storage_scope(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('libri_worker', 'libri.purge_account_deletion(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('service_role', 'libri.account_deletion_library_ids(uuid)', 'EXECUTE'),
	'only service_role can call the purge'
);
