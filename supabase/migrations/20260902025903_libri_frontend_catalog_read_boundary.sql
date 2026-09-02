-- libri-migration: true
-- Libri frontend catalog shadow-read boundary. The login role is provisioned
-- separately without a password before this tracked grant/RLS migration runs.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

REVOKE ALL ON ALL TABLES IN SCHEMA libri FROM libri_frontend_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA libri FROM libri_frontend_reader;

GRANT USAGE ON SCHEMA libri TO libri_frontend_reader;

GRANT SELECT (
	id,
	slug,
	title,
	subtitle,
	year,
	isbn10,
	isbn13,
	publisher,
	edition,
	ownership,
	indexing,
	completeness,
	created_at
) ON TABLE libri.books TO libri_frontend_reader;

GRANT SELECT (id, slug, name)
	ON TABLE libri.people TO libri_frontend_reader;

GRANT SELECT (book_id, person_id, role, position)
	ON TABLE libri.book_people TO libri_frontend_reader;

GRANT SELECT (id, name)
	ON TABLE libri.domains TO libri_frontend_reader;

GRANT SELECT (book_id, domain_id)
	ON TABLE libri.book_domains TO libri_frontend_reader;

CREATE POLICY books_libri_frontend_reader_select
	ON libri.books
	FOR SELECT
	TO libri_frontend_reader
	USING (library_id = 'f09948c4-e4e0-581c-8689-7258bea2f501'::uuid);

CREATE POLICY people_libri_frontend_reader_select
	ON libri.people
	FOR SELECT
	TO libri_frontend_reader
	USING (library_id = 'f09948c4-e4e0-581c-8689-7258bea2f501'::uuid);

CREATE POLICY book_people_libri_frontend_reader_select
	ON libri.book_people
	FOR SELECT
	TO libri_frontend_reader
	USING (library_id = 'f09948c4-e4e0-581c-8689-7258bea2f501'::uuid);

CREATE POLICY domains_libri_frontend_reader_select
	ON libri.domains
	FOR SELECT
	TO libri_frontend_reader
	USING (library_id = 'f09948c4-e4e0-581c-8689-7258bea2f501'::uuid);

CREATE POLICY book_domains_libri_frontend_reader_select
	ON libri.book_domains
	FOR SELECT
	TO libri_frontend_reader
	USING (library_id = 'f09948c4-e4e0-581c-8689-7258bea2f501'::uuid);
