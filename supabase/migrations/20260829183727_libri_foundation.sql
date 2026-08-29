-- libri-migration: true
-- Libri phase 1A: isolated ownership and catalog foundation.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS libri;

REVOKE ALL ON SCHEMA libri FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA libri TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA libri
	REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA libri
	REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA libri
	REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION libri.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	NEW.updated_at = pg_catalog.now();
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION libri.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE libri.libraries (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	slug text NOT NULL,
	name text NOT NULL,
	description text,
	created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT libraries_slug_nonempty CHECK (length(btrim(slug)) > 0),
	CONSTRAINT libraries_name_nonempty CHECK (length(btrim(name)) > 0),
	CONSTRAINT libraries_slug_unique UNIQUE (slug)
);

CREATE INDEX libraries_created_by_idx ON libri.libraries (created_by);

CREATE TABLE libri.library_members (
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	role text NOT NULL DEFAULT 'viewer',
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (library_id, user_id),
	CONSTRAINT library_members_role_valid CHECK (role IN ('owner', 'editor', 'viewer'))
);

CREATE INDEX library_members_user_id_idx ON libri.library_members (user_id, library_id);

CREATE TABLE libri.people (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	slug text,
	name text NOT NULL,
	name_normalized text,
	bio text,
	links jsonb NOT NULL DEFAULT '{}'::jsonb,
	search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
		setweight(to_tsvector('english', coalesce(bio, '')), 'B')
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT people_name_nonempty CHECK (length(btrim(name)) > 0),
	CONSTRAINT people_links_object CHECK (jsonb_typeof(links) = 'object'),
	CONSTRAINT people_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT people_library_slug_unique UNIQUE (library_id, slug)
);

CREATE INDEX people_library_name_normalized_idx
	ON libri.people (library_id, name_normalized)
	WHERE name_normalized IS NOT NULL;
CREATE INDEX people_search_vector_idx ON libri.people USING gin (search_vector);

CREATE TABLE libri.books (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	folder text,
	slug text,
	title text NOT NULL,
	title_normalized text,
	subtitle text,
	year integer,
	page_count integer,
	isbn10 text,
	isbn10_normalized text,
	isbn13 text,
	isbn13_normalized text,
	publisher text,
	edition text,
	ownership text NOT NULL DEFAULT 'library',
	author_names_search text,
	indexing jsonb NOT NULL DEFAULT '{"hasCover":false,"hasToc":false,"chaptersExtracted":false,"ocrComplete":false,"enriched":false}'::jsonb,
	toc jsonb,
	list_metadata jsonb,
	completeness jsonb,
	search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
		setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
		setweight(to_tsvector('english', coalesce(author_names_search, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(isbn10_normalized, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(isbn13_normalized, '')), 'A') ||
		setweight(to_tsvector('english', coalesce(publisher, '')), 'C')
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT books_title_nonempty CHECK (length(btrim(title)) > 0),
	CONSTRAINT books_page_count_positive CHECK (page_count IS NULL OR page_count > 0),
	CONSTRAINT books_year_reasonable CHECK (year IS NULL OR year BETWEEN 1 AND 9999),
	CONSTRAINT books_ownership_valid CHECK (ownership IN ('owned', 'library', 'wishlist', 'returned')),
	CONSTRAINT books_indexing_object CHECK (jsonb_typeof(indexing) = 'object'),
	CONSTRAINT books_toc_object CHECK (toc IS NULL OR jsonb_typeof(toc) = 'object'),
	CONSTRAINT books_list_metadata_object CHECK (
		list_metadata IS NULL OR jsonb_typeof(list_metadata) = 'object'
	),
	CONSTRAINT books_completeness_object CHECK (
		completeness IS NULL OR jsonb_typeof(completeness) = 'object'
	),
	CONSTRAINT books_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT books_library_slug_unique UNIQUE (library_id, slug)
);

CREATE INDEX books_library_ownership_idx ON libri.books (library_id, ownership, created_at DESC);
CREATE INDEX books_library_title_normalized_idx
	ON libri.books (library_id, title_normalized)
	WHERE title_normalized IS NOT NULL;
CREATE UNIQUE INDEX books_library_isbn10_unique_idx
	ON libri.books (library_id, isbn10_normalized)
	WHERE isbn10_normalized IS NOT NULL;
CREATE UNIQUE INDEX books_library_isbn13_unique_idx
	ON libri.books (library_id, isbn13_normalized)
	WHERE isbn13_normalized IS NOT NULL;
CREATE INDEX books_search_vector_idx ON libri.books USING gin (search_vector);

CREATE TABLE libri.book_people (
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	book_id uuid NOT NULL,
	person_id uuid NOT NULL,
	role text NOT NULL,
	position integer,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (book_id, person_id, role),
	CONSTRAINT book_people_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT book_people_person_library_fk
		FOREIGN KEY (library_id, person_id)
		REFERENCES libri.people(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT book_people_role_valid CHECK (
		role IN ('author', 'editor', 'foreword', 'contributor')
	),
	CONSTRAINT book_people_position_nonnegative CHECK (position IS NULL OR position >= 0)
);

CREATE INDEX book_people_library_person_idx
	ON libri.book_people (library_id, person_id, book_id);
CREATE INDEX book_people_library_book_idx ON libri.book_people (library_id, book_id, position);

CREATE TABLE libri.domains (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	name text NOT NULL,
	description text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT domains_name_nonempty CHECK (length(btrim(name)) > 0),
	CONSTRAINT domains_library_id_id_unique UNIQUE (library_id, id)
);

CREATE UNIQUE INDEX domains_library_lower_name_unique_idx
	ON libri.domains (library_id, lower(btrim(name)));

CREATE TABLE libri.book_domains (
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	book_id uuid NOT NULL,
	domain_id uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (book_id, domain_id),
	CONSTRAINT book_domains_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT book_domains_domain_library_fk
		FOREIGN KEY (library_id, domain_id)
		REFERENCES libri.domains(library_id, id)
		ON DELETE CASCADE
);

CREATE INDEX book_domains_library_domain_idx
	ON libri.book_domains (library_id, domain_id, book_id);
CREATE INDEX book_domains_library_book_idx ON libri.book_domains (library_id, book_id);

CREATE TABLE libri.migration_id_map (
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	source_table text NOT NULL,
	source_id text NOT NULL,
	target_id uuid NOT NULL,
	source_hash text,
	imported_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (library_id, source_table, source_id),
	CONSTRAINT migration_id_map_source_table_nonempty CHECK (length(btrim(source_table)) > 0),
	CONSTRAINT migration_id_map_source_id_nonempty CHECK (length(btrim(source_id)) > 0)
);

CREATE INDEX migration_id_map_target_id_idx
	ON libri.migration_id_map (library_id, target_id);

CREATE TRIGGER libraries_set_updated_at
	BEFORE UPDATE ON libri.libraries
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER people_set_updated_at
	BEFORE UPDATE ON libri.people
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER books_set_updated_at
	BEFORE UPDATE ON libri.books
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER domains_set_updated_at
	BEFORE UPDATE ON libri.domains
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

ALTER TABLE libri.libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.libraries FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.library_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.library_members FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.people FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.books FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.book_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.book_people FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.domains FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.book_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.book_domains FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.migration_id_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.migration_id_map FORCE ROW LEVEL SECURITY;

CREATE POLICY libraries_select_member
	ON libri.libraries
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM libri.library_members AS member
			WHERE member.library_id = libraries.id
				AND member.user_id = (SELECT auth.uid())
		)
	);

CREATE POLICY libraries_update_owner
	ON libri.libraries
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM libri.library_members AS member
			WHERE member.library_id = libraries.id
				AND member.user_id = (SELECT auth.uid())
				AND member.role = 'owner'
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1
			FROM libri.library_members AS member
			WHERE member.library_id = libraries.id
				AND member.user_id = (SELECT auth.uid())
				AND member.role = 'owner'
		)
	);

CREATE POLICY library_members_select_self
	ON libri.library_members
	FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

CREATE POLICY people_select_member
	ON libri.people
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = people.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY people_insert_editor
	ON libri.people
	FOR INSERT
	TO authenticated
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = people.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY people_update_editor
	ON libri.people
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = people.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = people.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY people_delete_editor
	ON libri.people
	FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = people.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);

CREATE POLICY books_select_member
	ON libri.books
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = books.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY books_insert_editor
	ON libri.books
	FOR INSERT
	TO authenticated
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = books.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY books_update_editor
	ON libri.books
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = books.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = books.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY books_delete_editor
	ON libri.books
	FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = books.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);

CREATE POLICY book_people_select_member
	ON libri.book_people
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = book_people.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY book_people_insert_editor
	ON libri.book_people
	FOR INSERT
	TO authenticated
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = book_people.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY book_people_update_editor
	ON libri.book_people
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = book_people.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = book_people.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY book_people_delete_editor
	ON libri.book_people
	FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = book_people.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);

CREATE POLICY domains_select_member
	ON libri.domains
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = domains.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY domains_insert_editor
	ON libri.domains
	FOR INSERT
	TO authenticated
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = domains.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY domains_update_editor
	ON libri.domains
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = domains.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = domains.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY domains_delete_editor
	ON libri.domains
	FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = domains.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);

CREATE POLICY book_domains_select_member
	ON libri.book_domains
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = book_domains.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY book_domains_insert_editor
	ON libri.book_domains
	FOR INSERT
	TO authenticated
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = book_domains.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY book_domains_delete_editor
	ON libri.book_domains
	FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = book_domains.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);

REVOKE ALL ON ALL TABLES IN SCHEMA libri FROM PUBLIC, anon, authenticated;
GRANT SELECT ON libri.libraries TO authenticated;
GRANT UPDATE (slug, name, description) ON libri.libraries TO authenticated;
GRANT SELECT ON libri.library_members TO authenticated;
GRANT SELECT, INSERT, DELETE
	ON libri.people, libri.books, libri.book_people, libri.domains, libri.book_domains
	TO authenticated;
GRANT UPDATE (slug, name, name_normalized, bio, links)
	ON libri.people
	TO authenticated;
GRANT UPDATE (
	folder,
	slug,
	title,
	title_normalized,
	subtitle,
	year,
	page_count,
	isbn10,
	isbn10_normalized,
	isbn13,
	isbn13_normalized,
	publisher,
	edition,
	ownership,
	author_names_search,
	indexing,
	toc,
	list_metadata,
	completeness
)
	ON libri.books
	TO authenticated;
GRANT UPDATE (role, position) ON libri.book_people TO authenticated;
GRANT UPDATE (name, description) ON libri.domains TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA libri TO service_role;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
