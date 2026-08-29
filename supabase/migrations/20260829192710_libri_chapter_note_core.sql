-- libri-migration: true
-- Libri phase 1B.1: ordered chapters and book/chapter notes.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.chapters (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	book_id uuid NOT NULL,
	position integer NOT NULL,
	number text NOT NULL,
	title text NOT NULL,
	page_start text,
	page_end text,
	estimated_word_count integer,
	summary text,
	research_status text NOT NULL DEFAULT 'none',
	research_confidence numeric(4, 3),
	research_model text,
	research_updated_at timestamptz,
	research_version integer NOT NULL DEFAULT 1,
	research_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	enrichment_phase text,
	enrichment_updated_at timestamptz,
	enrichment_version integer NOT NULL DEFAULT 1,
	enrichment_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('simple', coalesce(number, '')), 'A') ||
		setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
		setweight(to_tsvector('english', coalesce(summary, '')), 'B')
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT chapters_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT chapters_position_nonnegative CHECK (position >= 0),
	CONSTRAINT chapters_number_nonempty CHECK (length(btrim(number)) > 0),
	CONSTRAINT chapters_title_nonempty CHECK (length(btrim(title)) > 0),
	CONSTRAINT chapters_page_start_nonempty CHECK (
		page_start IS NULL OR length(btrim(page_start)) > 0
	),
	CONSTRAINT chapters_page_end_nonempty CHECK (
		page_end IS NULL OR length(btrim(page_end)) > 0
	),
	CONSTRAINT chapters_estimated_word_count_positive CHECK (
		estimated_word_count IS NULL OR estimated_word_count > 0
	),
	CONSTRAINT chapters_research_status_valid CHECK (
		research_status IN ('none', 'complete', 'insufficient_evidence', 'failed')
	),
	CONSTRAINT chapters_research_confidence_valid CHECK (
		research_confidence IS NULL OR research_confidence BETWEEN 0 AND 1
	),
	CONSTRAINT chapters_research_version_positive CHECK (research_version > 0),
	CONSTRAINT chapters_research_payload_object CHECK (
		jsonb_typeof(research_payload) = 'object'
	),
	CONSTRAINT chapters_enrichment_phase_valid CHECK (
		enrichment_phase IS NULL OR enrichment_phase IN (
			'phase1_deduction',
			'phase2_evidence',
			'phase3_synthesis',
			'complete'
		)
	),
	CONSTRAINT chapters_enrichment_version_positive CHECK (enrichment_version > 0),
	CONSTRAINT chapters_enrichment_payload_object CHECK (
		jsonb_typeof(enrichment_payload) = 'object'
	),
	CONSTRAINT chapters_library_book_id_unique UNIQUE (library_id, book_id, id),
	CONSTRAINT chapters_library_book_position_unique UNIQUE (library_id, book_id, position)
);

CREATE INDEX chapters_library_research_status_idx
	ON libri.chapters (library_id, research_status, research_updated_at DESC);
CREATE INDEX chapters_library_enrichment_phase_idx
	ON libri.chapters (library_id, enrichment_phase, enrichment_updated_at DESC)
	WHERE enrichment_phase IS NOT NULL;
CREATE INDEX chapters_search_vector_idx ON libri.chapters USING gin (search_vector);

CREATE TABLE libri.notes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	book_id uuid NOT NULL,
	chapter_id uuid,
	owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
	visibility text NOT NULL DEFAULT 'private',
	content text NOT NULL,
	search_vector tsvector GENERATED ALWAYS AS (
		to_tsvector('english', coalesce(content, ''))
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT notes_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT notes_chapter_book_library_fk
		FOREIGN KEY (library_id, book_id, chapter_id)
		REFERENCES libri.chapters(library_id, book_id, id)
		ON DELETE CASCADE,
	CONSTRAINT notes_visibility_valid CHECK (visibility IN ('private', 'shared_link')),
	CONSTRAINT notes_content_nonempty CHECK (length(btrim(content)) > 0)
);

CREATE INDEX notes_library_book_updated_at_idx
	ON libri.notes (library_id, book_id, updated_at DESC);
CREATE INDEX notes_library_book_chapter_idx
	ON libri.notes (library_id, book_id, chapter_id)
	WHERE chapter_id IS NOT NULL;
CREATE INDEX notes_owner_user_updated_at_idx
	ON libri.notes (owner_user_id, updated_at DESC)
	WHERE owner_user_id IS NOT NULL;
CREATE INDEX notes_search_vector_idx ON libri.notes USING gin (search_vector);

CREATE TRIGGER chapters_set_updated_at
	BEFORE UPDATE ON libri.chapters
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER notes_set_updated_at
	BEFORE UPDATE ON libri.notes
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

ALTER TABLE libri.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.chapters FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.notes FORCE ROW LEVEL SECURITY;

CREATE POLICY chapters_select_member
	ON libri.chapters
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = chapters.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY chapters_insert_editor
	ON libri.chapters
	FOR INSERT
	TO authenticated
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = chapters.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY chapters_update_editor
	ON libri.chapters
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = chapters.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = chapters.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);
CREATE POLICY chapters_delete_editor
	ON libri.chapters
	FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = chapters.library_id
				AND member.user_id = (SELECT auth.uid())
				AND member.role IN ('owner', 'editor')
		)
	);

CREATE POLICY notes_select_member
	ON libri.notes
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = notes.library_id
				AND member.user_id = (SELECT auth.uid())
				AND (
					notes.visibility = 'shared_link'
					OR notes.owner_user_id = (SELECT auth.uid())
					OR member.role = 'owner'
				)
		)
	);
CREATE POLICY notes_insert_member
	ON libri.notes
	FOR INSERT
	TO authenticated
	WITH CHECK (
		owner_user_id = (SELECT auth.uid())
		AND EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = notes.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY notes_update_owner_or_library_owner
	ON libri.notes
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = notes.library_id
				AND member.user_id = (SELECT auth.uid())
				AND (
					notes.owner_user_id = (SELECT auth.uid())
					OR member.role = 'owner'
				)
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = notes.library_id
				AND member.user_id = (SELECT auth.uid())
				AND (
					notes.owner_user_id = (SELECT auth.uid())
					OR member.role = 'owner'
				)
		)
	);
CREATE POLICY notes_delete_owner_or_library_owner
	ON libri.notes
	FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = notes.library_id
				AND member.user_id = (SELECT auth.uid())
				AND (
					notes.owner_user_id = (SELECT auth.uid())
					OR member.role = 'owner'
				)
		)
	);

REVOKE ALL ON libri.chapters, libri.notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON libri.chapters, libri.notes TO authenticated;
GRANT INSERT (
	library_id,
	book_id,
	position,
	number,
	title,
	page_start,
	page_end,
	estimated_word_count
)
	ON libri.chapters
	TO authenticated;
GRANT UPDATE (position, number, title, page_start, page_end, estimated_word_count)
	ON libri.chapters
	TO authenticated;
GRANT INSERT (library_id, book_id, chapter_id, owner_user_id, visibility, content)
	ON libri.notes
	TO authenticated;
GRANT UPDATE (content, visibility) ON libri.notes TO authenticated;
GRANT ALL ON libri.chapters, libri.notes TO service_role;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
