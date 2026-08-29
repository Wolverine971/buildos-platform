-- supabase/tests/20260829201033_libri_source_registry_chunks.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_source_registry_chunks_base.sql

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
	(SELECT count(*) = 14 FROM pg_tables WHERE schemaname = 'libri'),
	'phase 1B.2 must leave exactly fourteen Libri tables'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 14
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
	NOT has_schema_privilege('anon', 'libri', 'USAGE')
		AND NOT has_table_privilege('anon', 'libri.sources', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.source_documents', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.source_book_links', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.source_chunks', 'SELECT'),
	'anon must not have schema or source-layer access'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.sources', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'libri.sources', 'INSERT, UPDATE, DELETE')
		AND has_table_privilege('authenticated', 'libri.source_documents', 'SELECT')
		AND NOT has_table_privilege(
			'authenticated',
			'libri.source_documents',
			'INSERT, UPDATE, DELETE'
		)
		AND has_table_privilege('authenticated', 'libri.source_book_links', 'SELECT')
		AND NOT has_table_privilege(
			'authenticated',
			'libri.source_book_links',
			'INSERT, UPDATE, DELETE'
		)
		AND has_table_privilege('authenticated', 'libri.source_chunks', 'SELECT')
		AND NOT has_table_privilege(
			'authenticated',
			'libri.source_chunks',
			'INSERT, UPDATE, DELETE'
		),
	'authenticated access to worker-owned sources and chunks must be read-only'
);
SELECT pg_temp.assert_true(
	has_column_privilege('authenticated', 'libri.notes', 'source_chunk_id', 'INSERT')
		AND NOT has_column_privilege('authenticated', 'libri.notes', 'source_chunk_id', 'UPDATE'),
	'authenticated notes may select a source chunk at creation but cannot re-parent later'
);
SELECT pg_temp.assert_true(
	has_table_privilege('service_role', 'libri.sources', 'SELECT, INSERT, UPDATE, DELETE')
		AND has_table_privilege(
			'service_role',
			'libri.source_documents',
			'SELECT, INSERT, UPDATE, DELETE'
		)
		AND has_table_privilege(
			'service_role',
			'libri.source_book_links',
			'SELECT, INSERT, UPDATE, DELETE'
		)
		AND has_table_privilege(
			'service_role',
			'libri.source_chunks',
			'SELECT, INSERT, UPDATE, DELETE'
		),
	'the importer and worker service role need complete source-layer access'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT expected.table_name
		FROM (
			VALUES
				('sources'),
				('source_documents'),
				('source_book_links'),
				('source_chunks')
		) AS expected(table_name)
		WHERE NOT EXISTS (
			SELECT 1
			FROM pg_policies policy
			WHERE policy.schemaname = 'libri'
				AND policy.tablename = expected.table_name
				AND policy.cmd = 'SELECT'
				AND policy.roles = ARRAY['authenticated']::name[]
		)
	),
	'every source-layer table must have an authenticated member-select policy'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_policies policy
		WHERE policy.schemaname = 'libri'
			AND policy.tablename IN (
				'sources',
				'source_documents',
				'source_book_links',
				'source_chunks'
			)
			AND policy.cmd <> 'SELECT'
	),
	'worker-owned source tables must not acquire authenticated mutation policies'
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
	'phase 1B.2 must not introduce SECURITY DEFINER functions'
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

INSERT INTO libri.people (id, library_id, name) VALUES
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Primary person');

INSERT INTO libri.chapters (id, library_id, book_id, position, number, title) VALUES
	(
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		0,
		'1',
		'Primary chapter'
	),
	(
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
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
	canonical_url,
	title,
	status,
	discovered_by
) VALUES
	(
		'10000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'podcast_episode',
		'url:primary-podcast',
		'https://example.com/podcast',
		'Primary podcast',
		'content_cleaned',
		'tavily_search'
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'youtube_video',
		'youtube:video-one',
		'https://www.youtube.com/watch?v=video-one',
		'Primary video',
		'ready',
		'youtube_import'
	),
	(
		'10000000-0000-4000-8000-000000000003',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'article',
		'url:secondary-article',
		'https://example.com/secondary',
		'Secondary article',
		'reference_only',
		'manual'
	);

INSERT INTO libri.source_documents (
	id,
	library_id,
	source_id,
	version,
	cleaned_content,
	content_sha256,
	idempotency_key,
	cleaned_at,
	extractor
) VALUES
	(
		'20000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'10000000-0000-4000-8000-000000000001',
		1,
		'Cleaned primary podcast evidence',
		repeat('a', 64),
		'convex:externalSources:primary',
		now(),
		'convex_migration'
	);

INSERT INTO libri.source_book_links (
	library_id,
	source_id,
	book_id,
	source_document_id,
	context_title,
	context_excerpt,
	discovered_by
) VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'10000000-0000-4000-8000-000000000001',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'20000000-0000-4000-8000-000000000001',
	'Primary podcast in book context',
	'A short book-specific excerpt',
	'tavily_search'
);

INSERT INTO libri.source_chunks (
	id,
	library_id,
	book_id,
	chapter_id,
	person_id,
	chunk_type,
	page_label,
	content,
	content_sha256,
	idempotency_key,
	topics
) VALUES (
	'30000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
	'ocr',
	'xi',
	'Captured systems evidence',
	repeat('b', 64),
	'convex:fragments:primary',
	ARRAY['systems']
);

INSERT INTO libri.source_chunks (
	id,
	library_id,
	source_id,
	chunk_type,
	sequence,
	start_ms,
	end_ms,
	language,
	content,
	content_sha256,
	idempotency_key
) VALUES (
	'30000000-0000-4000-8000-000000000002',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'10000000-0000-4000-8000-000000000002',
	'transcript',
	1,
	1000,
	2000,
	'en',
	'Video transcript evidence',
	repeat('c', 64),
	'convex:youtubeTranscriptFragments:primary'
);

INSERT INTO libri.notes (
	id,
	library_id,
	book_id,
	source_chunk_id,
	owner_user_id,
	visibility,
	content
) VALUES (
	'40000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'30000000-0000-4000-8000-000000000001',
	'11111111-1111-4111-8111-111111111111',
	'private',
	'Note grounded in the OCR chunk'
);

SELECT pg_temp.assert_true(
	(
		SELECT search_vector @@ plainto_tsquery('english', 'podcast')
		FROM libri.sources
		WHERE id = '10000000-0000-4000-8000-000000000001'
	) AND (
		SELECT search_vector @@ plainto_tsquery('english', 'systems')
		FROM libri.source_chunks
		WHERE id = '30000000-0000-4000-8000-000000000001'
	),
	'source metadata and chunk content must produce searchable vectors'
);
SELECT pg_temp.assert_true(
	(
		SELECT source_chunk_id = '30000000-0000-4000-8000-000000000001'
		FROM libri.notes
		WHERE id = '40000000-0000-4000-8000-000000000001'
	),
	'notes must retain a tenant-consistent source chunk link'
);

DO $$
BEGIN
	BEGIN
		INSERT INTO libri.sources (
			library_id,
			source_type,
			source_key,
			canonical_url,
			title
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'article',
			'url:duplicate',
			'https://example.com/podcast',
			'Duplicate canonical URL'
		);
		RAISE EXCEPTION 'expected canonical URL uniqueness failure';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.source_book_links (library_id, source_id, book_id)
		VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'10000000-0000-4000-8000-000000000001',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
		);
		RAISE EXCEPTION 'expected cross-library book link failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.source_chunks (
			library_id,
			chunk_type,
			sequence,
			content,
			content_sha256,
			idempotency_key
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'transcript',
			2,
			'Orphan transcript',
			repeat('d', 64),
			'invalid:transcript:orphan'
		);
		RAISE EXCEPTION 'expected transcript parent check failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.source_chunks (
			library_id,
			source_id,
			chunk_type,
			sequence,
			start_ms,
			content,
			content_sha256,
			idempotency_key
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'10000000-0000-4000-8000-000000000002',
			'transcript',
			2,
			2000,
			'Partial timing',
			repeat('e', 64),
			'invalid:timing:partial'
		);
		RAISE EXCEPTION 'expected timing pair check failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.source_chunks (
			library_id,
			book_id,
			chapter_id,
			chunk_type,
			content,
			content_sha256,
			idempotency_key
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
			'ocr',
			'Cross-book chapter chunk',
			repeat('f', 64),
			'invalid:chapter:cross-book'
		);
		RAISE EXCEPTION 'expected cross-book chapter failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.source_chunks (
			library_id,
			source_id,
			chunk_type,
			sequence,
			content,
			content_sha256,
			idempotency_key
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'10000000-0000-4000-8000-000000000002',
			'transcript',
			1,
			'Duplicate sequence',
			repeat('1', 64),
			'invalid:sequence:duplicate'
		);
		RAISE EXCEPTION 'expected source sequence uniqueness failure';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.notes (
			library_id,
			book_id,
			source_chunk_id,
			visibility,
			content
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
			'30000000-0000-4000-8000-000000000001',
			'shared_link',
			'Cross-book source note'
		);
		RAISE EXCEPTION 'expected cross-book note source failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;
END;
$$;

UPDATE libri.sources
SET updated_at = '2000-01-01T00:00:00Z', title = 'Primary podcast updated'
WHERE id = '10000000-0000-4000-8000-000000000001';
UPDATE libri.source_chunks
SET updated_at = '2000-01-01T00:00:00Z', content = 'Captured systems evidence updated'
WHERE id = '30000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(
		SELECT updated_at > '2000-01-01T00:00:00Z'
		FROM libri.sources
		WHERE id = '10000000-0000-4000-8000-000000000001'
	) AND (
		SELECT updated_at > '2000-01-01T00:00:00Z'
		FROM libri.source_chunks
		WHERE id = '30000000-0000-4000-8000-000000000001'
	),
	'source and chunk updates must refresh updated_at'
);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.sources), 'an owner must see only member-library sources');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.source_documents), 'an owner must see member-library source documents');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.source_book_links), 'an owner must see member-library source links');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.source_chunks), 'an owner must see member-library chunks');
SAVEPOINT protected_source_insert;
\set ON_ERROR_STOP off
INSERT INTO libri.sources (library_id, source_type, source_key, title)
VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'article',
	'forbidden:authenticated',
	'Forbidden authenticated source'
);
\set protected_source_insert_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT protected_source_insert;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'protected_source_insert_sqlstate' = '42501',
	'authenticated clients must not bypass service routes for source writes'
);
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.sources), 'a viewer may read member-library sources');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.source_chunks), 'a viewer may read member-library chunks');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.sources), 'a non-member must not see sources');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.source_documents), 'a non-member must not see source documents');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.source_book_links), 'a non-member must not see source links');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.source_chunks), 'a non-member must not see chunks');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.sources), 'the secondary owner must only see secondary sources');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.source_chunks), 'the secondary owner must not see primary chunks');
ROLLBACK;
