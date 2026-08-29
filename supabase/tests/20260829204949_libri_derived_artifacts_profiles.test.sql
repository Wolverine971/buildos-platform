-- supabase/tests/20260829204949_libri_derived_artifacts_profiles.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_derived_artifacts_profiles_base.sql

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
	(SELECT count(*) = 21 FROM pg_tables WHERE schemaname = 'libri'),
	'phase 1C must leave exactly twenty-one Libri tables'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 21
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
		AND NOT has_table_privilege('anon', 'libri.agent_profiles', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.derived_artifacts', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.derived_artifact_evidence', 'SELECT'),
	'anon must not have schema or Phase 1C table access'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.agent_profiles', 'SELECT')
		AND has_table_privilege('authenticated', 'libri.derived_artifacts', 'SELECT')
		AND has_table_privilege('authenticated', 'libri.derived_artifact_evidence', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'libri.agent_profiles', 'INSERT, UPDATE, DELETE')
		AND NOT has_table_privilege('authenticated', 'libri.derived_artifacts', 'INSERT, UPDATE, DELETE')
		AND NOT has_table_privilege('authenticated', 'libri.derived_artifact_evidence', 'INSERT, UPDATE, DELETE'),
	'authenticated Phase 1C access must be read-only'
);
SELECT pg_temp.assert_true(
	has_table_privilege('service_role', 'libri.agent_profiles', 'SELECT, INSERT, UPDATE, DELETE')
		AND has_table_privilege('service_role', 'libri.derived_artifacts', 'SELECT, INSERT, UPDATE, DELETE')
		AND has_table_privilege('service_role', 'libri.derived_artifact_evidence', 'SELECT, INSERT, UPDATE, DELETE'),
	'the importer and worker service role need complete Phase 1C access'
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
	'phase 1C must not introduce SECURITY DEFINER functions'
);

INSERT INTO auth.users (id) VALUES
	('11111111-1111-4111-8111-111111111111'),
	('22222222-2222-4222-8222-222222222222'),
	('33333333-3333-4333-8333-333333333333'),
	('44444444-4444-4444-8444-444444444444');

INSERT INTO libri.libraries (id, slug, name, created_by) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'primary', 'Primary library', '11111111-1111-4111-8111-111111111111'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'secondary', 'Secondary library', '44444444-4444-4444-8444-444444444444');

INSERT INTO libri.library_members (library_id, user_id, role) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'owner'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'viewer'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '44444444-4444-4444-8444-444444444444', 'owner');

INSERT INTO libri.books (id, library_id, title) VALUES
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Primary book'),
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Secondary book');

INSERT INTO libri.chapters (id, library_id, book_id, position, number, title) VALUES
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 0, '1', 'Primary chapter'),
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 0, '1', 'Secondary chapter');

INSERT INTO libri.sources (id, library_id, source_type, source_key, title, status, discovered_by) VALUES
	('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'article', 'article:primary', 'Primary evidence source', 'content_cleaned', 'test'),
	('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'article', 'article:secondary', 'Secondary evidence source', 'content_cleaned', 'test');

INSERT INTO libri.source_chunks (
	id,
	library_id,
	source_id,
	book_id,
	chunk_type,
	content,
	content_sha256,
	idempotency_key
) VALUES
	(
		'20000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'10000000-0000-4000-8000-000000000001',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'source_excerpt',
		'Primary grounded evidence',
		repeat('1', 64),
		'chunk:primary'
	),
	(
		'20000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'10000000-0000-4000-8000-000000000002',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
		'source_excerpt',
		'Secondary grounded evidence',
		repeat('2', 64),
		'chunk:secondary'
	);

INSERT INTO libri.agent_profiles (
	id,
	library_id,
	book_id,
	name,
	slug,
	kind,
	primary_model,
	default_tools,
	enabled_tools,
	configuration
) VALUES
	(
		'30000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'Primary book expert',
		'primary-book-expert',
		'book_expert',
		'openai/gpt-5-mini',
		ARRAY['search_book'],
		ARRAY['search_book'],
		'{"citation_style":"inline"}'
	),
	(
		'30000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
		'Secondary book expert',
		'secondary-book-expert',
		'book_expert',
		'openai/gpt-5-mini',
		ARRAY['search_book'],
		ARRAY['search_book'],
		'{}'
	),
	(
		'30000000-0000-4000-8000-000000000003',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		NULL,
		'Primary librarian',
		'primary-librarian',
		'librarian',
		'openai/gpt-5-mini',
		ARRAY[]::text[],
		ARRAY[]::text[],
		'{}'
	);

INSERT INTO libri.derived_artifacts (
	id,
	library_id,
	book_id,
	chapter_id,
	agent_profile_id,
	artifact_type,
	title,
	content,
	structured_data,
	version,
	status,
	content_sha256,
	source_fingerprint,
	idempotency_key,
	input_snapshot,
	generated_by
) VALUES
	(
		'40000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		NULL,
		'chapter_summary',
		'Primary chapter summary',
		'A grounded summary of the primary chapter',
		'{}',
		1,
		'generated',
		repeat('3', 64),
		repeat('4', 64),
		'artifact:primary:chapter-summary:v1',
		'{"chapter_count":1}',
		'convex_migration'
	),
	(
		'40000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
		NULL,
		'chapter_summary',
		'Secondary chapter summary',
		'A grounded summary of the secondary chapter',
		'{}',
		1,
		'generated',
		repeat('5', 64),
		repeat('6', 64),
		'artifact:secondary:chapter-summary:v1',
		'{}',
		'convex_migration'
	),
	(
		'40000000-0000-4000-8000-000000000003',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		NULL,
		NULL,
		'30000000-0000-4000-8000-000000000001',
		'agent_knowledge_doc',
		'Primary book expert knowledge',
		'Persistent book expert briefing',
		'{}',
		1,
		'generated',
		repeat('7', 64),
		repeat('8', 64),
		'artifact:primary:knowledge:v1',
		'{}',
		'convex_migration'
	);
INSERT INTO libri.derived_artifact_evidence (
	library_id,
	artifact_id,
	source_chunk_id,
	role,
	rank,
	excerpt
) VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'40000000-0000-4000-8000-000000000001',
	'20000000-0000-4000-8000-000000000001',
	'citation',
	1,
	'Primary grounded evidence'
);

SELECT pg_temp.assert_true(
	(
		SELECT scope_type = 'chapter'
			AND scope_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
			AND search_vector @@ plainto_tsquery('english', 'grounded summary')
		FROM libri.derived_artifacts
		WHERE id = '40000000-0000-4000-8000-000000000001'
	),
	'derived artifacts must expose stable scope and generated search'
);
SELECT pg_temp.assert_true(
	(
		SELECT scope_type = 'agent_profile'
			AND scope_id = '30000000-0000-4000-8000-000000000001'
		FROM libri.derived_artifacts
		WHERE id = '40000000-0000-4000-8000-000000000003'
	),
	'agent knowledge must resolve through an agent-profile scope'
);

DO $$
BEGIN
	BEGIN
		INSERT INTO libri.agent_profiles (
			library_id,
			name,
			slug,
			kind,
			primary_model
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'Invalid book expert',
			'invalid-book-expert',
			'book_expert',
			'openai/gpt-5-mini'
		);
		RAISE EXCEPTION 'expected book-expert scope failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.derived_artifacts (
			library_id,
			book_id,
			artifact_type,
			content,
			content_sha256,
			idempotency_key
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'chapter_summary',
			'Invalid book-scoped chapter summary',
			repeat('9', 64),
			'invalid:chapter-scope'
		);
		RAISE EXCEPTION 'expected artifact type/scope failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.derived_artifacts (
			library_id,
			book_id,
			chapter_id,
			artifact_type,
			content,
			content_sha256,
			idempotency_key
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
			'chapter_summary',
			'Duplicate current summary',
			repeat('a', 64),
			'invalid:duplicate-current'
		);
		RAISE EXCEPTION 'expected duplicate current artifact failure';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.derived_artifact_evidence (
			library_id,
			artifact_id,
			source_chunk_id
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'40000000-0000-4000-8000-000000000001',
			'20000000-0000-4000-8000-000000000002'
		);
		RAISE EXCEPTION 'expected cross-library evidence failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;
END;
$$;

UPDATE libri.derived_artifacts
SET is_current = false
WHERE id = '40000000-0000-4000-8000-000000000001';
INSERT INTO libri.derived_artifacts (
	id,
	library_id,
	book_id,
	chapter_id,
	artifact_type,
	content,
	version,
	status,
	content_sha256,
	source_fingerprint,
	idempotency_key,
	supersedes_artifact_id
) VALUES (
	'40000000-0000-4000-8000-000000000004',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
	'chapter_summary',
	'Updated grounded chapter summary',
	2,
	'generated',
	repeat('b', 64),
	repeat('c', 64),
	'artifact:primary:chapter-summary:v2',
	'40000000-0000-4000-8000-000000000001'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.derived_artifacts WHERE scope_type = 'chapter' AND scope_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' AND artifact_type = 'chapter_summary' AND is_current),
	'exactly one current artifact must remain after a version handoff'
);

UPDATE libri.agent_profiles
SET updated_at = '2000-01-01T00:00:00Z', configuration = '{"citation_style":"footnote"}'
WHERE id = '30000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(
		SELECT updated_at > '2000-01-01T00:00:00Z'
		FROM libri.agent_profiles
		WHERE id = '30000000-0000-4000-8000-000000000001'
	),
	'agent-profile updates must refresh updated_at'
);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.agent_profiles), 'an owner must only see member-library profiles');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM libri.derived_artifacts), 'an owner must only see member-library artifacts');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.derived_artifact_evidence), 'an owner must only see member-library evidence');
SAVEPOINT protected_artifact_insert;
\set ON_ERROR_STOP off
INSERT INTO libri.derived_artifacts (
	library_id,
	book_id,
	artifact_type,
	content,
	content_sha256,
	idempotency_key
) VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	'book_summary',
	'Forbidden browser artifact',
	repeat('d', 64),
	'forbidden:browser-artifact'
);
\set protected_artifact_insert_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT protected_artifact_insert;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'protected_artifact_insert_sqlstate' = '42501',
	'authenticated clients must not bypass service routes for derived writes'
);
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.agent_profiles), 'a viewer may read member-library profiles');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM libri.derived_artifacts), 'a viewer may read member-library artifacts');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.agent_profiles), 'a non-member must not see profiles');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.derived_artifacts), 'a non-member must not see artifacts');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.agent_profiles), 'the secondary owner must only see secondary profiles');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.derived_artifacts), 'the secondary owner must only see secondary artifacts');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.derived_artifact_evidence), 'the secondary owner must not see primary evidence');
ROLLBACK;
