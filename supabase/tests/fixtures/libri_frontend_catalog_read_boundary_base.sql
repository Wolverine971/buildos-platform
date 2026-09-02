-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the Libri frontend
-- catalog authorization boundary. Never apply this fixture to a linked database.

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'libri_frontend_reader'
	) THEN
		CREATE ROLE libri_frontend_reader
			LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
			CONNECTION LIMIT 3;
	END IF;
END;
$$;

CREATE SCHEMA libri;

CREATE TABLE libri.books (
	id uuid PRIMARY KEY,
	library_id uuid NOT NULL,
	slug text,
	title text NOT NULL,
	title_normalized text,
	subtitle text,
	year integer,
	isbn10 text,
	isbn13 text,
	publisher text,
	edition text,
	ownership text NOT NULL,
	indexing jsonb NOT NULL,
	completeness jsonb,
	created_at timestamptz NOT NULL
);

CREATE TABLE libri.people (
	id uuid PRIMARY KEY,
	library_id uuid NOT NULL,
	slug text,
	name text NOT NULL,
	bio text
);

CREATE TABLE libri.book_people (
	library_id uuid NOT NULL,
	book_id uuid NOT NULL,
	person_id uuid NOT NULL,
	role text NOT NULL,
	position integer
);

CREATE TABLE libri.domains (
	id uuid PRIMARY KEY,
	library_id uuid NOT NULL,
	name text NOT NULL,
	description text
);

CREATE TABLE libri.book_domains (
	library_id uuid NOT NULL,
	book_id uuid NOT NULL,
	domain_id uuid NOT NULL
);

ALTER TABLE libri.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.books FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.people FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.book_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.book_people FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.domains FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.book_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.book_domains FORCE ROW LEVEL SECURITY;

CREATE TABLE public.buildos_control (
	id integer PRIMARY KEY,
	value text NOT NULL
);

INSERT INTO public.buildos_control (id, value) VALUES (1, 'unchanged');
