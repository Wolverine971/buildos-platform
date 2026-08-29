-- libri-migration: true
-- libri-allow-storage: buckets:insert
-- Libri phase 1B.3: canonical image metadata and a private server-mediated Storage bucket.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

INSERT INTO storage.buckets (
	id,
	name,
	public,
	file_size_limit,
	allowed_mime_types
) VALUES (
	'libri-assets',
	'libri-assets',
	false,
	26214400,
	ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE libri.images (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	book_id uuid NOT NULL,
	chapter_id uuid,
	source_id uuid NOT NULL,
	bucket_id text NOT NULL DEFAULT 'libri-assets',
	object_path text NOT NULL,
	original_filename text NOT NULL,
	mime_type text NOT NULL,
	byte_size bigint NOT NULL,
	content_sha256 text NOT NULL,
	image_type text NOT NULL,
	page_label text,
	description text,
	ocr_status text NOT NULL DEFAULT 'pending',
	ocr_version integer NOT NULL DEFAULT 0,
	ocr_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT images_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT images_chapter_book_library_fk
		FOREIGN KEY (library_id, book_id, chapter_id)
		REFERENCES libri.chapters(library_id, book_id, id)
		ON DELETE SET NULL (chapter_id),
	CONSTRAINT images_source_library_fk
		FOREIGN KEY (library_id, source_id)
		REFERENCES libri.sources(library_id, id)
		ON DELETE RESTRICT,
	CONSTRAINT images_bucket_fixed CHECK (bucket_id = 'libri-assets'),
	CONSTRAINT images_object_path_nonempty CHECK (length(btrim(object_path)) > 0),
	CONSTRAINT images_object_path_library_prefix CHECK (
		object_path LIKE library_id::text || '/%'
	),
	CONSTRAINT images_object_path_safe CHECK (
		object_path !~ '(^|/)\.\.(/|$)' AND object_path !~ '^/'
	),
	CONSTRAINT images_original_filename_nonempty CHECK (
		length(btrim(original_filename)) > 0
	),
	CONSTRAINT images_mime_type_valid CHECK (
		mime_type IN ('image/jpeg', 'image/png', 'image/webp')
	),
	CONSTRAINT images_byte_size_positive CHECK (byte_size > 0 AND byte_size <= 26214400),
	CONSTRAINT images_sha256_valid CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
	CONSTRAINT images_type_valid CHECK (
		image_type IN ('cover', 'toc', 'page', 'chart', 'diagram', 'glossary')
	),
	CONSTRAINT images_page_label_nonempty CHECK (
		page_label IS NULL OR length(btrim(page_label)) > 0
	),
	CONSTRAINT images_ocr_status_valid CHECK (
		ocr_status IN ('pending', 'processing', 'complete', 'failed')
	),
	CONSTRAINT images_ocr_version_nonnegative CHECK (ocr_version >= 0),
	CONSTRAINT images_ocr_metadata_object CHECK (jsonb_typeof(ocr_metadata) = 'object'),
	CONSTRAINT images_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT images_library_source_unique UNIQUE (library_id, source_id),
	CONSTRAINT images_library_book_id_source_unique UNIQUE (
		library_id,
		book_id,
		id,
		source_id
	),
	CONSTRAINT images_bucket_object_unique UNIQUE (bucket_id, object_path)
);

CREATE INDEX images_library_book_chapter_idx
	ON libri.images (library_id, book_id, chapter_id, created_at);
CREATE INDEX images_library_book_type_idx
	ON libri.images (library_id, book_id, image_type, created_at);
CREATE INDEX images_library_content_hash_idx
	ON libri.images (library_id, content_sha256);

ALTER TABLE libri.source_chunks
	ADD COLUMN image_id uuid,
	ADD CONSTRAINT source_chunks_image_source_book_library_fk
		FOREIGN KEY (library_id, book_id, image_id, source_id)
		REFERENCES libri.images(library_id, book_id, id, source_id)
		ON DELETE RESTRICT,
	ADD CONSTRAINT source_chunks_ocr_image_required CHECK (
		chunk_type <> 'ocr'
		OR (
			image_id IS NOT NULL
			AND source_id IS NOT NULL
			AND book_id IS NOT NULL
		)
	),
	ADD CONSTRAINT source_chunks_image_only_for_ocr CHECK (
		image_id IS NULL OR chunk_type = 'ocr'
	);

CREATE INDEX source_chunks_library_book_image_source_idx
	ON libri.source_chunks (library_id, book_id, image_id, source_id)
	WHERE image_id IS NOT NULL;

CREATE TRIGGER images_set_updated_at
	BEFORE UPDATE ON libri.images
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

ALTER TABLE libri.images ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.images FORCE ROW LEVEL SECURITY;

CREATE POLICY images_select_member
	ON libri.images
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = images.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);

REVOKE ALL ON libri.images FROM PUBLIC, anon, authenticated;
GRANT SELECT ON libri.images TO authenticated;
GRANT ALL ON libri.images TO service_role;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
