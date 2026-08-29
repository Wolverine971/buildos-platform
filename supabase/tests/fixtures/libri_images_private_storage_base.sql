-- TEST FIXTURE ONLY: bootstrap a disposable PostgreSQL database for the Libri
-- image/private-Storage contract. Never apply this fixture to a linked database.

\ir libri_source_registry_chunks_base.sql

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
	id text PRIMARY KEY,
	name text NOT NULL,
	public boolean NOT NULL DEFAULT false,
	file_size_limit bigint,
	allowed_mime_types text[]
);
CREATE TABLE storage.objects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	bucket_id text NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
	name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

\ir ../../migrations/20260829202608_libri_images_private_storage.sql
