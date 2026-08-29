-- libri-migration: true
-- Libri phase 1B.2: source registry, versioned source documents, book links, and evidence chunks.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.sources (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	source_type text NOT NULL,
	source_key text NOT NULL,
	canonical_url text,
	title text NOT NULL,
	site_name text,
	author_name text,
	published_at timestamptz,
	status text NOT NULL DEFAULT 'reference_only',
	discovered_by text NOT NULL DEFAULT 'manual',
	discovered_at timestamptz NOT NULL DEFAULT now(),
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(canonical_url, '')), 'B') ||
		setweight(to_tsvector('english', coalesce(site_name, '')), 'C') ||
		setweight(to_tsvector('english', coalesce(author_name, '')), 'C')
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT sources_type_valid CHECK (
		source_type IN (
			'podcast_episode',
			'blog_post',
			'book_review',
			'article',
			'academic_paper',
			'web_page',
			'youtube_video',
			'uploaded_document',
			'scanned_image',
			'other'
		)
	),
	CONSTRAINT sources_key_nonempty CHECK (length(btrim(source_key)) > 0),
	CONSTRAINT sources_title_nonempty CHECK (length(btrim(title)) > 0),
	CONSTRAINT sources_url_http CHECK (
		canonical_url IS NULL OR canonical_url ~ '^https?://'
	),
	CONSTRAINT sources_status_valid CHECK (
		status IN ('reference_only', 'content_fetched', 'content_cleaned', 'ready', 'failed')
	),
	CONSTRAINT sources_discovered_by_nonempty CHECK (length(btrim(discovered_by)) > 0),
	CONSTRAINT sources_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
	CONSTRAINT sources_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT sources_library_key_unique UNIQUE (library_id, source_key)
);

CREATE UNIQUE INDEX sources_library_canonical_url_unique_idx
	ON libri.sources (library_id, canonical_url)
	WHERE canonical_url IS NOT NULL;
CREATE INDEX sources_library_type_status_idx
	ON libri.sources (library_id, source_type, status, updated_at DESC);
CREATE INDEX sources_search_vector_idx ON libri.sources USING gin (search_vector);

CREATE TABLE libri.source_documents (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	source_id uuid NOT NULL,
	version integer NOT NULL DEFAULT 1,
	raw_content text,
	cleaned_content text,
	content_sha256 text NOT NULL,
	idempotency_key text NOT NULL,
	fetched_at timestamptz,
	cleaned_at timestamptz,
	extractor text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT source_documents_source_library_fk
		FOREIGN KEY (library_id, source_id)
		REFERENCES libri.sources(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT source_documents_version_positive CHECK (version > 0),
	CONSTRAINT source_documents_content_present CHECK (
		length(btrim(coalesce(raw_content, ''))) > 0
		OR length(btrim(coalesce(cleaned_content, ''))) > 0
	),
	CONSTRAINT source_documents_sha256_valid CHECK (
		content_sha256 ~ '^[0-9a-f]{64}$'
	),
	CONSTRAINT source_documents_idempotency_key_nonempty CHECK (
		length(btrim(idempotency_key)) > 0
	),
	CONSTRAINT source_documents_extractor_nonempty CHECK (
		extractor IS NULL OR length(btrim(extractor)) > 0
	),
	CONSTRAINT source_documents_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
	CONSTRAINT source_documents_library_source_id_unique UNIQUE (library_id, source_id, id),
	CONSTRAINT source_documents_library_source_version_unique UNIQUE (
		library_id,
		source_id,
		version
	),
	CONSTRAINT source_documents_library_idempotency_unique UNIQUE (
		library_id,
		idempotency_key
	),
	CONSTRAINT source_documents_library_source_hash_unique UNIQUE (
		library_id,
		source_id,
		content_sha256
	)
);

CREATE INDEX source_documents_library_source_created_at_idx
	ON libri.source_documents (library_id, source_id, created_at DESC);

CREATE TABLE libri.source_book_links (
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	source_id uuid NOT NULL,
	book_id uuid NOT NULL,
	source_document_id uuid,
	relationship text NOT NULL DEFAULT 'reference',
	context_title text,
	context_excerpt text,
	discovered_by text NOT NULL DEFAULT 'manual',
	discovered_at timestamptz NOT NULL DEFAULT now(),
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (library_id, source_id, book_id),
	CONSTRAINT source_book_links_source_library_fk
		FOREIGN KEY (library_id, source_id)
		REFERENCES libri.sources(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT source_book_links_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT source_book_links_document_source_fk
		FOREIGN KEY (library_id, source_id, source_document_id)
		REFERENCES libri.source_documents(library_id, source_id, id)
		ON DELETE RESTRICT,
	CONSTRAINT source_book_links_relationship_valid CHECK (
		relationship IN ('primary', 'reference', 'supplemental')
	),
	CONSTRAINT source_book_links_context_title_nonempty CHECK (
		context_title IS NULL OR length(btrim(context_title)) > 0
	),
	CONSTRAINT source_book_links_context_excerpt_nonempty CHECK (
		context_excerpt IS NULL OR length(btrim(context_excerpt)) > 0
	),
	CONSTRAINT source_book_links_discovered_by_nonempty CHECK (
		length(btrim(discovered_by)) > 0
	)
);

CREATE INDEX source_book_links_library_book_source_idx
	ON libri.source_book_links (library_id, book_id, source_id);
CREATE INDEX source_book_links_library_source_document_idx
	ON libri.source_book_links (library_id, source_id, source_document_id)
	WHERE source_document_id IS NOT NULL;

CREATE TABLE libri.source_chunks (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	source_id uuid,
	source_document_id uuid,
	book_id uuid,
	chapter_id uuid,
	person_id uuid,
	chunk_type text NOT NULL,
	sequence integer,
	page_label text,
	start_ms bigint,
	end_ms bigint,
	speaker text,
	language text,
	content text NOT NULL,
	content_sha256 text NOT NULL,
	idempotency_key text NOT NULL,
	topics text[] NOT NULL DEFAULT '{}'::text[],
	verification_status text,
	verification_notes text,
	verification_updated_at timestamptz,
	merged_into_chunk_id uuid,
	is_archived boolean NOT NULL DEFAULT false,
	archived_at timestamptz,
	merged_at timestamptz,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	search_vector tsvector GENERATED ALWAYS AS (
		to_tsvector('english', coalesce(content, ''))
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT source_chunks_source_library_fk
		FOREIGN KEY (library_id, source_id)
		REFERENCES libri.sources(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT source_chunks_document_source_fk
		FOREIGN KEY (library_id, source_id, source_document_id)
		REFERENCES libri.source_documents(library_id, source_id, id)
		ON DELETE CASCADE,
	CONSTRAINT source_chunks_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT source_chunks_chapter_book_library_fk
		FOREIGN KEY (library_id, book_id, chapter_id)
		REFERENCES libri.chapters(library_id, book_id, id)
		ON DELETE CASCADE,
	CONSTRAINT source_chunks_person_library_fk
		FOREIGN KEY (library_id, person_id)
		REFERENCES libri.people(library_id, id)
		ON DELETE SET NULL (person_id),
	CONSTRAINT source_chunks_merged_library_fk
		FOREIGN KEY (library_id, merged_into_chunk_id)
		REFERENCES libri.source_chunks(library_id, id)
		ON DELETE RESTRICT,
	CONSTRAINT source_chunks_type_valid CHECK (
		chunk_type IN (
			'ocr',
			'excerpt',
			'highlight',
			'concept',
			'quote',
			'transcript',
			'source_excerpt',
			'other'
		)
	),
	CONSTRAINT source_chunks_parent_present CHECK (source_id IS NOT NULL OR book_id IS NOT NULL),
	CONSTRAINT source_chunks_document_has_source CHECK (
		source_document_id IS NULL OR source_id IS NOT NULL
	),
	CONSTRAINT source_chunks_chapter_has_book CHECK (chapter_id IS NULL OR book_id IS NOT NULL),
	CONSTRAINT source_chunks_transcript_identity CHECK (
		chunk_type <> 'transcript' OR (source_id IS NOT NULL AND sequence IS NOT NULL)
	),
	CONSTRAINT source_chunks_sequence_nonnegative CHECK (sequence IS NULL OR sequence >= 0),
	CONSTRAINT source_chunks_page_label_nonempty CHECK (
		page_label IS NULL OR length(btrim(page_label)) > 0
	),
	CONSTRAINT source_chunks_timing_pair CHECK (
		(start_ms IS NULL AND end_ms IS NULL)
		OR (start_ms IS NOT NULL AND end_ms IS NOT NULL)
	),
	CONSTRAINT source_chunks_timing_nonnegative CHECK (
		(start_ms IS NULL OR start_ms >= 0)
		AND (end_ms IS NULL OR end_ms >= 0)
	),
	CONSTRAINT source_chunks_timing_order CHECK (
		start_ms IS NULL OR end_ms >= start_ms
	),
	CONSTRAINT source_chunks_speaker_nonempty CHECK (
		speaker IS NULL OR length(btrim(speaker)) > 0
	),
	CONSTRAINT source_chunks_language_nonempty CHECK (
		language IS NULL OR length(btrim(language)) > 0
	),
	CONSTRAINT source_chunks_content_nonempty CHECK (length(btrim(content)) > 0),
	CONSTRAINT source_chunks_sha256_valid CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
	CONSTRAINT source_chunks_idempotency_key_nonempty CHECK (
		length(btrim(idempotency_key)) > 0
	),
	CONSTRAINT source_chunks_topics_no_nulls CHECK (array_position(topics, NULL) IS NULL),
	CONSTRAINT source_chunks_verification_status_valid CHECK (
		verification_status IS NULL OR verification_status IN ('verified', 'flagged')
	),
	CONSTRAINT source_chunks_merge_not_self CHECK (merged_into_chunk_id IS NULL OR merged_into_chunk_id <> id),
	CONSTRAINT source_chunks_merge_archived CHECK (
		merged_into_chunk_id IS NULL
		OR (is_archived AND archived_at IS NOT NULL AND merged_at IS NOT NULL)
	),
	CONSTRAINT source_chunks_archive_timestamp CHECK (
		is_archived OR archived_at IS NULL
	),
	CONSTRAINT source_chunks_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
	CONSTRAINT source_chunks_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT source_chunks_library_book_id_unique UNIQUE (library_id, book_id, id),
	CONSTRAINT source_chunks_library_idempotency_unique UNIQUE (library_id, idempotency_key)
);

CREATE UNIQUE INDEX source_chunks_library_source_sequence_unique_idx
	ON libri.source_chunks (library_id, source_id, sequence)
	WHERE source_id IS NOT NULL AND sequence IS NOT NULL;
CREATE INDEX source_chunks_library_source_document_idx
	ON libri.source_chunks (library_id, source_id, source_document_id)
	WHERE source_id IS NOT NULL;
CREATE INDEX source_chunks_library_book_chapter_idx
	ON libri.source_chunks (library_id, book_id, chapter_id, created_at)
	WHERE book_id IS NOT NULL;
CREATE INDEX source_chunks_library_person_idx
	ON libri.source_chunks (library_id, person_id)
	WHERE person_id IS NOT NULL;
CREATE INDEX source_chunks_library_merged_into_idx
	ON libri.source_chunks (library_id, merged_into_chunk_id)
	WHERE merged_into_chunk_id IS NOT NULL;
CREATE INDEX source_chunks_library_content_hash_idx
	ON libri.source_chunks (library_id, content_sha256);
CREATE INDEX source_chunks_search_vector_idx ON libri.source_chunks USING gin (search_vector);

ALTER TABLE libri.notes
	ADD COLUMN source_chunk_id uuid,
	ADD CONSTRAINT notes_source_chunk_book_library_fk
		FOREIGN KEY (library_id, book_id, source_chunk_id)
		REFERENCES libri.source_chunks(library_id, book_id, id)
		ON DELETE SET NULL (source_chunk_id);

CREATE INDEX notes_library_book_source_chunk_idx
	ON libri.notes (library_id, book_id, source_chunk_id)
	WHERE source_chunk_id IS NOT NULL;

CREATE TRIGGER sources_set_updated_at
	BEFORE UPDATE ON libri.sources
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER source_chunks_set_updated_at
	BEFORE UPDATE ON libri.source_chunks
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

ALTER TABLE libri.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.sources FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.source_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.source_book_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.source_book_links FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.source_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.source_chunks FORCE ROW LEVEL SECURITY;

CREATE POLICY sources_select_member
	ON libri.sources
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = sources.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY source_documents_select_member
	ON libri.source_documents
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = source_documents.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY source_book_links_select_member
	ON libri.source_book_links
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = source_book_links.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY source_chunks_select_member
	ON libri.source_chunks
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = source_chunks.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);

REVOKE ALL ON
	libri.sources,
	libri.source_documents,
	libri.source_book_links,
	libri.source_chunks
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON
	libri.sources,
	libri.source_documents,
	libri.source_book_links,
	libri.source_chunks
	TO authenticated;
GRANT ALL ON
	libri.sources,
	libri.source_documents,
	libri.source_book_links,
	libri.source_chunks
	TO service_role;
GRANT INSERT (
	library_id,
	book_id,
	chapter_id,
	source_chunk_id,
	owner_user_id,
	visibility,
	content
)
	ON libri.notes
	TO authenticated;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
