-- supabase/tests/20260829183727_libri_foundation.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_foundation_base.sql

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
	(SELECT count(*) = 8 FROM pg_tables WHERE schemaname = 'libri'),
	'the foundation must create exactly eight Libri tables'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 8
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
	NOT has_schema_privilege('anon', 'libri', 'USAGE'),
	'anon must not have Libri schema access'
);
SELECT pg_temp.assert_true(
	has_schema_privilege('authenticated', 'libri', 'USAGE'),
	'authenticated callers need Libri schema usage'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.books', 'SELECT, INSERT, DELETE')
		AND NOT has_table_privilege('authenticated', 'libri.books', 'UPDATE')
		AND has_column_privilege('authenticated', 'libri.books', 'title', 'UPDATE')
		AND NOT has_column_privilege('authenticated', 'libri.books', 'library_id', 'UPDATE')
		AND NOT has_column_privilege('authenticated', 'libri.books', 'created_at', 'UPDATE'),
	'authenticated catalog writes must use RLS and immutable identity columns'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.libraries', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'libri.libraries', 'UPDATE')
		AND has_column_privilege('authenticated', 'libri.libraries', 'name', 'UPDATE')
		AND NOT has_column_privilege('authenticated', 'libri.libraries', 'created_by', 'UPDATE'),
	'library owners may update presentation fields but not ownership provenance'
);
SELECT pg_temp.assert_true(
	NOT has_table_privilege('authenticated', 'libri.book_domains', 'UPDATE'),
	'book-domain edges are immutable and must be replaced rather than reassigned'
);
SELECT pg_temp.assert_true(
	NOT has_table_privilege('authenticated', 'libri.migration_id_map', 'SELECT'),
	'migration bookkeeping must remain service-only'
);
SELECT pg_temp.assert_true(
	has_table_privilege('service_role', 'libri.migration_id_map', 'SELECT, INSERT, UPDATE, DELETE'),
	'the importer service role needs migration bookkeeping access'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_proc procedure
		JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
		WHERE namespace.nspname = 'libri' AND procedure.prosecdef
	),
	'the foundation must not introduce SECURITY DEFINER functions'
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
	'non-Libri schemas must not acquire foreign-key dependencies on Libri'
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
			AND source_namespace.nspname = 'libri'
			AND target_namespace.nspname NOT IN ('libri', 'auth')
	),
	'Libri foreign keys may depend only on Libri ownership or Supabase auth identities'
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
						SELECT array_agg(attribute_number ORDER BY position)
						FROM unnest(index_definition.indkey::smallint[])
							WITH ORDINALITY AS indexed_column(attribute_number, position)
						WHERE position <= cardinality(foreign_key.conkey)
					) = foreign_key.conkey
			)
	),
	'every Libri foreign key must have a valid index with matching leading columns'
);

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT expected.table_name, expected.command
		FROM (
			VALUES
				('libraries', 'SELECT'),
				('libraries', 'UPDATE'),
				('library_members', 'SELECT'),
				('people', 'SELECT'),
				('people', 'INSERT'),
				('people', 'UPDATE'),
				('people', 'DELETE'),
				('books', 'SELECT'),
				('books', 'INSERT'),
				('books', 'UPDATE'),
				('books', 'DELETE'),
				('book_people', 'SELECT'),
				('book_people', 'INSERT'),
				('book_people', 'UPDATE'),
				('book_people', 'DELETE'),
				('domains', 'SELECT'),
				('domains', 'INSERT'),
				('domains', 'UPDATE'),
				('domains', 'DELETE'),
				('book_domains', 'SELECT'),
				('book_domains', 'INSERT'),
				('book_domains', 'DELETE')
		) AS expected(table_name, command)
		WHERE NOT EXISTS (
			SELECT 1
			FROM pg_policies policy
			WHERE policy.schemaname = 'libri'
				AND policy.tablename = expected.table_name
				AND policy.cmd = expected.command
		)
	),
	'every authenticated Libri operation must have a matching RLS policy'
);

INSERT INTO auth.users (id) VALUES
	('11111111-1111-4111-8111-111111111111'),
	('22222222-2222-4222-8222-222222222222'),
	('33333333-3333-4333-8333-333333333333'),
	('44444444-4444-4444-8444-444444444444'),
	('55555555-5555-4555-8555-555555555555');

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
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'11111111-1111-4111-8111-111111111111',
		'owner'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'22222222-2222-4222-8222-222222222222',
		'viewer'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'44444444-4444-4444-8444-444444444444',
		'owner'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'55555555-5555-4555-8555-555555555555',
		'editor'
	);

INSERT INTO libri.people (id, library_id, name) VALUES
	(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'Primary Author'
	),
	(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'Secondary Author'
	);

INSERT INTO libri.books (
	id, library_id, slug, title, isbn13_normalized, author_names_search
) VALUES
	(
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'primary-book',
		'Systems Architecture',
		'9780000000001',
		'Primary Author'
	),
	(
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'secondary-book',
		'Secondary Systems',
		'9780000000001',
		'Secondary Author'
	);

SELECT pg_temp.assert_true(
	(
		SELECT search_vector @@ plainto_tsquery('english', 'architecture')
		FROM libri.books
		WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
	),
	'book search vectors must be generated from canonical fields'
);

UPDATE libri.books
SET updated_at = '2000-01-01T00:00:00Z', title = 'Systems Architecture, Updated'
WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
SELECT pg_temp.assert_true(
	(
		SELECT updated_at > '2000-01-01T00:00:00Z'
		FROM libri.books
		WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
	),
	'book updates must refresh updated_at'
);

DO $$
BEGIN
	BEGIN
		INSERT INTO libri.book_people (library_id, book_id, person_id, role)
		VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
				'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
				'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
				'author'
			);
			RAISE EXCEPTION 'expected cross-library foreign key failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;
END;
$$;

INSERT INTO libri.migration_id_map (
	library_id,
	source_table,
	source_id,
	target_id
) VALUES
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'people',
		'convex-person-primary',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'people',
		'convex-person-duplicate',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
	);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM libri.migration_id_map),
	'multiple deduplicated source IDs must be allowed to map to one target UUID'
);

DO $$
BEGIN
	BEGIN
		INSERT INTO libri.books (library_id, title, isbn13_normalized)
		VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'Duplicate ISBN',
			'9780000000001'
		);
		RAISE EXCEPTION 'expected same-library ISBN uniqueness failure';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;
END;
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'11111111-1111-4111-8111-111111111111',
	true
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.libraries),
	'an owner must only see their library'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.books),
	'an owner must only see books in their library'
);
WITH inserted AS (
	INSERT INTO libri.books (library_id, title)
	VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Owner-created book')
	RETURNING id
)
SELECT pg_temp.assert_true(
	count(*) = 1,
	'an owner must be able to create catalog records'
)
FROM inserted;
SAVEPOINT cross_library_insert;
\set ON_ERROR_STOP off
INSERT INTO libri.books (library_id, title)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Forbidden cross-library book');
\set cross_library_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT cross_library_insert;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'cross_library_sqlstate' = '42501',
	'an authenticated owner must not insert into another library'
);
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'55555555-5555-4555-8555-555555555555',
	true
);
WITH inserted AS (
	INSERT INTO libri.people (
		id,
		library_id,
		name
	) VALUES (
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'Editor-created author'
	)
	RETURNING id
)
SELECT pg_temp.assert_true(
	count(*) = 1,
	'an editor must be able to insert catalog records'
)
FROM inserted;
WITH updated AS (
	UPDATE libri.people
	SET bio = 'Editor-updated biography'
	WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5'
	RETURNING id
)
SELECT pg_temp.assert_true(
	count(*) = 1,
	'an editor must be able to update mutable catalog fields'
)
FROM updated;
WITH deleted AS (
	DELETE FROM libri.people
	WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5'
	RETURNING id
)
SELECT pg_temp.assert_true(
	count(*) = 1,
	'an editor must be able to delete catalog records'
)
FROM deleted;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'22222222-2222-4222-8222-222222222222',
	true
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.books),
	'a viewer must be able to read their library'
);
WITH updated AS (
	UPDATE libri.books SET title = 'Viewer mutation' RETURNING id
)
SELECT pg_temp.assert_true(
	count(*) = 0,
	'a viewer must not be able to update catalog records'
)
FROM updated;
WITH updated AS (
	UPDATE libri.libraries SET description = 'Viewer mutation' RETURNING id
)
SELECT pg_temp.assert_true(
	count(*) = 0,
	'a viewer must not be able to update their library'
)
FROM updated;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'33333333-3333-4333-8333-333333333333',
	true
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM libri.libraries),
	'a non-member must not see libraries'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM libri.books),
	'a non-member must not see catalog records'
);
ROLLBACK;
