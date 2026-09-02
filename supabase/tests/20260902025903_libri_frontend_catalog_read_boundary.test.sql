-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_frontend_catalog_read_boundary_base.sql

SELECT md5(row_to_json(control)::text) AS buildos_control_before
FROM public.buildos_control control
WHERE id = 1
\gset

\ir ../migrations/20260902025903_libri_frontend_catalog_read_boundary.sql

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
	has_column_privilege('libri_frontend_reader', 'libri.books', 'title', 'SELECT')
		AND has_column_privilege('libri_frontend_reader', 'libri.books', 'created_at', 'SELECT')
		AND NOT has_column_privilege(
			'libri_frontend_reader',
			'libri.books',
			'title_normalized',
			'SELECT'
		)
		AND NOT has_column_privilege(
			'libri_frontend_reader',
			'libri.books',
			'library_id',
			'SELECT'
		)
		AND NOT has_table_privilege('libri_frontend_reader', 'libri.books', 'INSERT, UPDATE, DELETE')
		AND NOT has_table_privilege(
			'libri_frontend_reader',
			'public.buildos_control',
			'SELECT, INSERT, UPDATE, DELETE'
		),
	'frontend reader must receive only the reviewed Libri catalog columns'
);

SELECT pg_temp.assert_true(
	(
		SELECT array_agg(policyname::text ORDER BY policyname::text)
		FROM pg_policies
		WHERE schemaname = 'libri'
			AND 'libri_frontend_reader' = ANY(roles)
	) = ARRAY[
		'book_domains_libri_frontend_reader_select',
		'book_people_libri_frontend_reader_select',
		'books_libri_frontend_reader_select',
		'domains_libri_frontend_reader_select',
		'people_libri_frontend_reader_select'
	],
	'frontend reader must receive exactly five reviewed catalog policies'
);

INSERT INTO libri.books (
	id, library_id, slug, title, title_normalized, ownership, indexing, created_at
) VALUES
	(
		'81000000-0000-4000-8000-000000000001',
		'f09948c4-e4e0-581c-8689-7258bea2f501',
		'visible-book',
		'Visible book',
		'visible book',
		'owned',
		'{}',
		now()
	),
	(
		'81000000-0000-4000-8000-000000000002',
		'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'hidden-book',
		'Hidden book',
		'hidden book',
		'owned',
		'{}',
		now()
	);

INSERT INTO libri.people (id, library_id, slug, name, bio) VALUES
	(
		'82000000-0000-4000-8000-000000000001',
		'f09948c4-e4e0-581c-8689-7258bea2f501',
		'visible-author',
		'Visible author',
		'private biography'
	),
	(
		'82000000-0000-4000-8000-000000000002',
		'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'hidden-author',
		'Hidden author',
		'private biography'
	);

INSERT INTO libri.book_people (library_id, book_id, person_id, role, position) VALUES
	(
		'f09948c4-e4e0-581c-8689-7258bea2f501',
		'81000000-0000-4000-8000-000000000001',
		'82000000-0000-4000-8000-000000000001',
		'author',
		0
	),
	(
		'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'81000000-0000-4000-8000-000000000002',
		'82000000-0000-4000-8000-000000000002',
		'author',
		0
	);

INSERT INTO libri.domains (id, library_id, name, description) VALUES
	(
		'83000000-0000-4000-8000-000000000001',
		'f09948c4-e4e0-581c-8689-7258bea2f501',
		'visible-domain',
		'private description'
	),
	(
		'83000000-0000-4000-8000-000000000002',
		'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'hidden-domain',
		'private description'
	);

INSERT INTO libri.book_domains (library_id, book_id, domain_id) VALUES
	(
		'f09948c4-e4e0-581c-8689-7258bea2f501',
		'81000000-0000-4000-8000-000000000001',
		'83000000-0000-4000-8000-000000000001'
	),
	(
		'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'81000000-0000-4000-8000-000000000002',
		'83000000-0000-4000-8000-000000000002'
	);

SET ROLE libri_frontend_reader;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.books),
	'frontend reader must see only the exact migrated Libri library'
);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.people), 'people RLS must be scoped');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.book_people),
	'book-person RLS must be scoped'
);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.domains), 'domain RLS must be scoped');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM libri.book_domains),
	'book-domain RLS must be scoped'
);

DO $$
BEGIN
	BEGIN
		PERFORM title_normalized FROM libri.books;
		RAISE EXCEPTION 'frontend reader unexpectedly read an ungranted book column';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.books (
			id, library_id, title, ownership, indexing, created_at
		) VALUES (
			'81000000-0000-4000-8000-000000000003',
			'f09948c4-e4e0-581c-8689-7258bea2f501',
			'Forbidden write',
			'owned',
			'{}',
			now()
		);
		RAISE EXCEPTION 'frontend reader unexpectedly inserted a book';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;

	BEGIN
		PERFORM value FROM public.buildos_control;
		RAISE EXCEPTION 'frontend reader unexpectedly read a BuildOS table';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;

RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT md5(row_to_json(control)::text) FROM public.buildos_control control WHERE id = 1) =
		:'buildos_control_before',
	'frontend boundary migration and role activity must preserve the BuildOS control'
);
