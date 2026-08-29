-- supabase/tests/20260829192710_libri_chapter_note_core.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_chapter_note_core_base.sql

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
	(SELECT count(*) = 10 FROM pg_tables WHERE schemaname = 'libri'),
	'phase 1B.1 must leave exactly ten Libri tables'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 10
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
		AND NOT has_table_privilege('anon', 'libri.chapters', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.notes', 'SELECT'),
	'anon must not have schema or chapter/note access'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.chapters', 'SELECT, DELETE')
		AND NOT has_table_privilege('authenticated', 'libri.chapters', 'UPDATE')
		AND has_column_privilege('authenticated', 'libri.chapters', 'number', 'INSERT')
		AND has_column_privilege('authenticated', 'libri.chapters', 'title', 'UPDATE')
		AND NOT has_column_privilege(
			'authenticated',
			'libri.chapters',
			'research_payload',
			'INSERT'
		)
		AND NOT has_column_privilege(
			'authenticated',
			'libri.chapters',
			'research_status',
			'UPDATE'
		)
		AND NOT has_column_privilege('authenticated', 'libri.chapters', 'book_id', 'UPDATE'),
	'authenticated chapter writes must exclude worker-owned and identity columns'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.notes', 'SELECT, DELETE')
		AND NOT has_table_privilege('authenticated', 'libri.notes', 'UPDATE')
		AND has_column_privilege('authenticated', 'libri.notes', 'content', 'INSERT')
		AND has_column_privilege('authenticated', 'libri.notes', 'content', 'UPDATE')
		AND NOT has_column_privilege('authenticated', 'libri.notes', 'owner_user_id', 'UPDATE')
		AND NOT has_column_privilege('authenticated', 'libri.notes', 'book_id', 'UPDATE'),
	'authenticated note writes must preserve ownership and parent identity'
);
SELECT pg_temp.assert_true(
	has_table_privilege('service_role', 'libri.chapters', 'SELECT, INSERT, UPDATE, DELETE')
		AND has_table_privilege('service_role', 'libri.notes', 'SELECT, INSERT, UPDATE, DELETE'),
	'the importer and worker service role need complete chapter/note access'
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
				('book_domains', 'DELETE'),
				('chapters', 'SELECT'),
				('chapters', 'INSERT'),
				('chapters', 'UPDATE'),
				('chapters', 'DELETE'),
				('notes', 'SELECT'),
				('notes', 'INSERT'),
				('notes', 'UPDATE'),
				('notes', 'DELETE')
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
	'phase 1B.1 must not introduce SECURITY DEFINER functions'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'libri'
			AND table_name = 'notes'
			AND column_name = 'fragment_id'
	),
	'fragment ownership must wait for the phase 1B.2 source registry'
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
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'owner'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'viewer'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '44444444-4444-4444-8444-444444444444', 'owner'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '55555555-5555-4555-8555-555555555555', 'editor');

INSERT INTO libri.books (id, library_id, title) VALUES
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Primary book'),
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Secondary book');

INSERT INTO libri.chapters (
	id,
	library_id,
	book_id,
	position,
	number,
	title,
	page_start,
	summary,
	research_status,
	research_confidence,
	research_payload,
	enrichment_phase,
	enrichment_payload
) VALUES
	(
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		0,
		'1',
		'Opening Systems',
		'xi',
		'How systems begin.',
		'complete',
		0.800,
		'{"topics":["systems"],"source_urls":["https://example.com/source"]}',
		'complete',
		'{"chapter_purpose":"setup"}'
	),
	(
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		1,
		'1',
		'Another Chapter One',
		'12',
		NULL,
		'insufficient_evidence',
		0.000,
		'{}',
		NULL,
		'{}'
	),
	(
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
		0,
		'intro',
		'Secondary Introduction',
		'1',
		NULL,
		'none',
		NULL,
		'{}',
		NULL,
		'{}'
	);

INSERT INTO libri.notes (
	id,
	library_id,
	book_id,
	chapter_id,
	owner_user_id,
	visibility,
	content
) VALUES
	(
		'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		NULL,
		NULL,
		'shared_link',
		'Legacy ownerless book note'
	),
	(
		'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
		'11111111-1111-4111-8111-111111111111',
		'private',
		'Owner private chapter note'
	),
	(
		'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
		'55555555-5555-4555-8555-555555555555',
		'private',
		'Editor private chapter note'
	),
	(
		'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
		NULL,
		NULL,
		'shared_link',
		'Secondary shared note'
	),
	(
		'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		NULL,
		'33333333-3333-4333-8333-333333333333',
		'private',
		'Former member private note'
	);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM libri.chapters WHERE book_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' AND number = '1'),
	'repeated legacy display numbers must remain valid when positions differ'
);
SELECT pg_temp.assert_true(
	(
		SELECT page_start = 'xi'
			AND search_vector @@ plainto_tsquery('english', 'systems')
		FROM libri.chapters
		WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
	),
	'chapter page labels and generated search must preserve source semantics'
);
SELECT pg_temp.assert_true(
	(
		SELECT search_vector @@ plainto_tsquery('english', 'ownerless')
		FROM libri.notes
		WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
	),
	'note search vectors must be generated from content'
);

DO $$
BEGIN
	BEGIN
		INSERT INTO libri.chapters (library_id, book_id, position, number, title)
		VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
			9,
			'9',
			'Cross-library chapter'
		);
		RAISE EXCEPTION 'expected cross-library chapter foreign-key failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.notes (library_id, book_id, chapter_id, visibility, content)
		VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
			'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
			'shared_link',
			'Cross-book chapter note'
		);
		RAISE EXCEPTION 'expected cross-book note foreign-key failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.chapters (library_id, book_id, position, number, title)
		VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
			0,
			'duplicate-position',
			'Duplicate position'
		);
		RAISE EXCEPTION 'expected chapter position uniqueness failure';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.chapters (
			library_id,
			book_id,
			position,
			number,
			title,
			research_payload
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
			9,
			'9',
			'Invalid payload',
			'[]'
		);
		RAISE EXCEPTION 'expected research payload object check failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.chapters (
			library_id,
			book_id,
			position,
			number,
			title,
			research_confidence
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
			9,
			'9',
			'Invalid confidence',
			1.001
		);
		RAISE EXCEPTION 'expected research confidence range failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;
END;
$$;

UPDATE libri.chapters
SET updated_at = '2000-01-01T00:00:00Z', title = 'Opening Systems Updated'
WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
UPDATE libri.notes
SET updated_at = '2000-01-01T00:00:00Z', content = 'Legacy ownerless note updated'
WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
SELECT pg_temp.assert_true(
	(
		SELECT updated_at > '2000-01-01T00:00:00Z'
		FROM libri.chapters
		WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
	) AND (
		SELECT updated_at > '2000-01-01T00:00:00Z'
		FROM libri.notes
		WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
	),
	'chapter and note updates must refresh updated_at'
);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.chapters), 'an owner must only see chapters in their library');
SELECT pg_temp.assert_true((SELECT count(*) = 4 FROM libri.notes), 'an owner may administer all notes in their library');
WITH inserted AS (
	INSERT INTO libri.chapters (library_id, book_id, position, number, title)
	VALUES (
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		2,
		'2',
		'Owner chapter'
	)
	RETURNING id
)
SELECT pg_temp.assert_true(count(*) = 1, 'an owner must be able to create a chapter') FROM inserted;
WITH changed AS (
	UPDATE libri.notes
	SET content = 'Owner administered editor note'
	WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'
	RETURNING id
)
SELECT pg_temp.assert_true(count(*) = 1, 'a library owner may administer a foreign private note') FROM changed;
SAVEPOINT protected_research_update;
\set ON_ERROR_STOP off
UPDATE libri.chapters
SET research_status = 'complete'
WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
\set protected_research_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT protected_research_update;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'protected_research_sqlstate' = '42501',
	'authenticated users must not write worker-owned research fields'
);
SAVEPOINT owner_cross_library_insert;
\set ON_ERROR_STOP off
INSERT INTO libri.chapters (library_id, book_id, position, number, title)
VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
	9,
	'9',
	'Forbidden secondary chapter'
);
\set owner_cross_library_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT owner_cross_library_insert;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'owner_cross_library_sqlstate' = '42501',
	'an owner must not create chapters in another library'
);
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.chapters), 'a viewer may read member-library chapters');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.notes), 'a viewer must only see shared notes before creating their own');
SAVEPOINT viewer_chapter_insert;
\set ON_ERROR_STOP off
INSERT INTO libri.chapters (library_id, book_id, position, number, title)
VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
	9,
	'9',
	'Forbidden viewer chapter'
);
\set viewer_chapter_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT viewer_chapter_insert;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(:'viewer_chapter_sqlstate' = '42501', 'a viewer must not create chapters');
WITH inserted AS (
	INSERT INTO libri.notes (library_id, book_id, owner_user_id, visibility, content)
	VALUES (
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		'22222222-2222-4222-8222-222222222222',
		'private',
		'Viewer private note'
	)
	RETURNING id
)
SELECT pg_temp.assert_true(count(*) = 1, 'a member viewer may create their own private note') FROM inserted;
WITH changed AS (
	UPDATE libri.notes
	SET content = 'Viewer changed legacy note'
	WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
	RETURNING id
)
SELECT pg_temp.assert_true(count(*) = 0, 'a viewer must not edit an ownerless legacy note') FROM changed;
SAVEPOINT viewer_claim_owner;
\set ON_ERROR_STOP off
INSERT INTO libri.notes (library_id, book_id, owner_user_id, visibility, content)
VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
	'11111111-1111-4111-8111-111111111111',
	'private',
	'Viewer claiming owner identity'
);
\set viewer_claim_owner_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT viewer_claim_owner;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'viewer_claim_owner_sqlstate' = '42501',
	'a member must not create a note under another identity'
);
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM libri.notes), 'an editor must see shared and self-owned private notes only');
WITH inserted AS (
	INSERT INTO libri.chapters (library_id, book_id, position, number, title)
	VALUES (
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
		2,
		'2',
		'Editor chapter'
	)
	RETURNING id
)
SELECT pg_temp.assert_true(count(*) = 1, 'an editor must be able to create a chapter') FROM inserted;
WITH changed AS (
	UPDATE libri.notes
	SET content = 'Editor updated own note'
	WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'
	RETURNING id
)
SELECT pg_temp.assert_true(count(*) = 1, 'an editor may update their own note') FROM changed;
WITH changed AS (
	UPDATE libri.notes
	SET content = 'Editor attempted owner note change'
	WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
	RETURNING id
)
SELECT pg_temp.assert_true(count(*) = 0, 'an editor must not update a foreign private note') FROM changed;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.chapters), 'a non-member must not see chapters');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.notes), 'a non-member must not see notes');
WITH changed AS (
	UPDATE libri.notes
	SET content = 'Former member attempted note change'
	WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5'
	RETURNING id
)
SELECT pg_temp.assert_true(count(*) = 0, 'a former member must not retain note write access') FROM changed;
SAVEPOINT nonmember_note_insert;
\set ON_ERROR_STOP off
INSERT INTO libri.notes (library_id, book_id, owner_user_id, visibility, content)
VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
	'33333333-3333-4333-8333-333333333333',
	'private',
	'Forbidden non-member note'
);
\set nonmember_note_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT nonmember_note_insert;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'nonmember_note_sqlstate' = '42501',
	'a non-member must not create notes'
);
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.chapters), 'the secondary owner must only see secondary chapters');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.notes), 'the secondary owner must only see secondary notes');
ROLLBACK;
