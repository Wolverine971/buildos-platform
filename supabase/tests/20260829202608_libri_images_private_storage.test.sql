-- supabase/tests/20260829202608_libri_images_private_storage.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_images_private_storage_base.sql

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
	(SELECT count(*) = 15 FROM pg_tables WHERE schemaname = 'libri'),
	'phase 1B.3 must leave exactly fifteen Libri tables'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 15
		FROM pg_class relation
		JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
		WHERE namespace.nspname = 'libri'
			AND relation.relkind = 'r'
			AND relation.relrowsecurity
			AND relation.relforcerowsecurity
	),
	'every Libri table must enable and force RLS'
);
SELECT pg_temp.assert_true(
	(
		SELECT NOT public
			AND file_size_limit = 26214400
			AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
		FROM storage.buckets
		WHERE id = 'libri-assets' AND name = 'libri-assets'
	),
	'the Libri bucket must be private and limited to reviewed image types and sizes'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'storage'
			AND tablename = 'objects'
			AND policyname LIKE 'libri%'
	),
	'Libri assets must use server-mediated signed access rather than shared storage policies'
);
SELECT pg_temp.assert_true(
	NOT has_schema_privilege('anon', 'libri', 'USAGE')
		AND NOT has_table_privilege('anon', 'libri.images', 'SELECT'),
	'anon must not have schema or image metadata access'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.images', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'libri.images', 'INSERT, UPDATE, DELETE'),
	'authenticated image metadata access must be read-only'
);
SELECT pg_temp.assert_true(
	has_table_privilege('service_role', 'libri.images', 'SELECT, INSERT, UPDATE, DELETE'),
	'the importer and worker service role need complete image metadata access'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_constraint foreign_key
		JOIN pg_class relation ON relation.oid = foreign_key.conrelid
		JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
		WHERE foreign_key.contype = 'f'
			AND namespace.nspname = 'libri'
			AND NOT EXISTS (
				SELECT 1
				FROM pg_index index_definition
				WHERE index_definition.indrelid = foreign_key.conrelid
					AND index_definition.indisvalid
					AND (
						SELECT array_agg(attribute_number ORDER BY ordinal_position)
						FROM unnest(index_definition.indkey::smallint[])
							WITH ORDINALITY AS indexed_column(attribute_number, ordinal_position)
						WHERE ordinal_position <= cardinality(foreign_key.conkey)
					) = foreign_key.conkey
			)
	),
	'every Libri foreign key must have a valid index with matching leading columns'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_constraint dependency
		JOIN pg_class source_relation ON source_relation.oid = dependency.conrelid
		JOIN pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
		JOIN pg_class target_relation ON target_relation.oid = dependency.confrelid
		JOIN pg_namespace target_namespace ON target_namespace.oid = target_relation.relnamespace
		WHERE dependency.contype = 'f'
			AND source_namespace.nspname <> 'libri'
			AND target_namespace.nspname = 'libri'
	),
	'non-Libri schemas must not acquire foreign keys to Libri'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_proc procedure
		JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
		WHERE namespace.nspname = 'libri' AND procedure.prosecdef
	),
	'phase 1B.3 must not introduce SECURITY DEFINER functions'
);

INSERT INTO auth.users (id) VALUES
	('11111111-1111-4111-8111-111111111111'),
	('22222222-2222-4222-8222-222222222222'),
	('33333333-3333-4333-8333-333333333333'),
	('44444444-4444-4444-8444-444444444444');

INSERT INTO libri.libraries (id, slug, name, created_by) VALUES
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'primary',
		'Primary library',
		'11111111-1111-4111-8111-111111111111'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'secondary',
		'Secondary library',
		'44444444-4444-4444-8444-444444444444'
	);

INSERT INTO libri.library_members (library_id, user_id, role) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'owner'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'viewer'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '44444444-4444-4444-8444-444444444444', 'owner');

INSERT INTO libri.books (id, library_id, title) VALUES
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Primary book'),
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Secondary book');

INSERT INTO libri.chapters (id, library_id, book_id, position, number, title) VALUES
	(
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		0,
		'1',
		'Primary chapter'
	),
	(
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
		0,
		'1',
		'Secondary chapter'
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
		'10000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'scanned_image',
		'image:primary-one',
		'Primary scanned page',
		'ready',
		'convex_migration'
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'scanned_image',
		'image:primary-two',
		'Primary duplicate-filename page',
		'ready',
		'convex_migration'
	),
	(
		'10000000-0000-4000-8000-000000000003',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'scanned_image',
		'image:secondary',
		'Secondary scanned page',
		'ready',
		'convex_migration'
	);

INSERT INTO libri.images (
	id,
	library_id,
	book_id,
	chapter_id,
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
) VALUES
	(
		'20000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		'10000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/20000000-0000-4000-8000-000000000001/original.jpeg',
		'image.jpg',
		'image/jpeg',
		1024,
		repeat('a', 64),
		'page',
		'xi',
		'complete',
		1
	),
	(
		'20000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		NULL,
		'10000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/books/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/images/20000000-0000-4000-8000-000000000002/original.webp',
		'image.jpg',
		'image/webp',
		2048,
		repeat('b', 64),
		'cover',
		NULL,
		'complete',
		0
	),
	(
		'20000000-0000-4000-8000-000000000003',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
		NULL,
		'10000000-0000-4000-8000-000000000003',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/books/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/images/20000000-0000-4000-8000-000000000003/original.png',
		'secondary.png',
		'image/png',
		4096,
		repeat('c', 64),
		'toc',
		NULL,
		'failed',
		0
	);

INSERT INTO libri.source_chunks (
	id,
	library_id,
	source_id,
	book_id,
	chapter_id,
	image_id,
	chunk_type,
	page_label,
	content,
	content_sha256,
	idempotency_key
) VALUES (
	'30000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'10000000-0000-4000-8000-000000000001',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
	'20000000-0000-4000-8000-000000000001',
	'ocr',
	'xi',
	'Grounded OCR evidence',
	repeat('d', 64),
	'convex:fragments:grounded'
);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM libri.images WHERE original_filename = 'image.jpg'),
	'legacy duplicate filenames in one book must remain valid when object paths differ'
);
SELECT pg_temp.assert_true(
	(
		SELECT image_id = '20000000-0000-4000-8000-000000000001'
			AND source_id = '10000000-0000-4000-8000-000000000001'
		FROM libri.source_chunks
		WHERE id = '30000000-0000-4000-8000-000000000001'
	),
	'OCR chunks must resolve to the matching same-book image source'
);

DO $$
BEGIN
	BEGIN
		INSERT INTO libri.images (
			library_id,
			book_id,
			source_id,
			object_path,
			original_filename,
			mime_type,
			byte_size,
			content_sha256,
			image_type
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'10000000-0000-4000-8000-000000000003',
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/invalid-cross-library.jpeg',
			'invalid.jpeg',
			'image/jpeg',
			100,
			repeat('e', 64),
			'page'
		);
		RAISE EXCEPTION 'expected cross-library image source failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.images (
			library_id,
			book_id,
			source_id,
			object_path,
			original_filename,
			mime_type,
			byte_size,
			content_sha256,
			image_type
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'10000000-0000-4000-8000-000000000002',
			'wrong-library-prefix/image.jpeg',
			'invalid.jpeg',
			'image/jpeg',
			100,
			repeat('e', 64),
			'page'
		);
		RAISE EXCEPTION 'expected object path library-prefix failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.images (
			library_id,
			book_id,
			source_id,
			object_path,
			original_filename,
			mime_type,
			byte_size,
			content_sha256,
			image_type
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'10000000-0000-4000-8000-000000000002',
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/invalid.gif',
			'invalid.gif',
			'image/gif',
			100,
			repeat('e', 64),
			'page'
		);
		RAISE EXCEPTION 'expected image MIME restriction failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.source_chunks (
			library_id,
			book_id,
			chunk_type,
			content,
			content_sha256,
			idempotency_key
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'ocr',
			'Ungrounded OCR content',
			repeat('f', 64),
			'invalid:ocr:ungrounded'
		);
		RAISE EXCEPTION 'expected OCR image/source requirement failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.source_chunks (
			library_id,
			source_id,
			book_id,
			image_id,
			chunk_type,
			content,
			content_sha256,
			idempotency_key
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'10000000-0000-4000-8000-000000000002',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'20000000-0000-4000-8000-000000000001',
			'ocr',
			'Mismatched image source',
			repeat('1', 64),
			'invalid:ocr:mismatched-source'
		);
		RAISE EXCEPTION 'expected image/source pairing failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;
END;
$$;

UPDATE libri.images
SET updated_at = '2000-01-01T00:00:00Z', description = 'Updated image description'
WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(
		SELECT updated_at > '2000-01-01T00:00:00Z'
		FROM libri.images
		WHERE id = '20000000-0000-4000-8000-000000000001'
	),
	'image updates must refresh updated_at'
);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.images), 'an owner must only see member-library images');
SAVEPOINT protected_image_insert;
\set ON_ERROR_STOP off
INSERT INTO libri.images (
	library_id,
	book_id,
	source_id,
	object_path,
	original_filename,
	mime_type,
	byte_size,
	content_sha256,
	image_type
) VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'10000000-0000-4000-8000-000000000002',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/forbidden.jpeg',
	'forbidden.jpeg',
	'image/jpeg',
	100,
	repeat('2', 64),
	'page'
);
\set protected_image_insert_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT protected_image_insert;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'protected_image_insert_sqlstate' = '42501',
	'authenticated clients must not bypass service routes for image writes'
);
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.images), 'a viewer may read member-library image metadata');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.images), 'a non-member must not see image metadata');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.images), 'the secondary owner must only see secondary images');
ROLLBACK;
