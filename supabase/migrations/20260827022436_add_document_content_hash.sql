-- supabase/migrations/20260827022436_add_document_content_hash.sql
-- Step 2 document proposal foundation.
--
-- Keep the proposal authority on the document head itself. The expression uses
-- pgcrypto's immutable text overload directly: the production database is UTF-8,
-- so this hashes the same UTF-8 bytes as the browser-side js-sha256 helper.
alter table public.onto_documents
	add column if not exists content_hash text
	generated always as (
		encode(extensions.digest(coalesce(content, ''), 'sha256'), 'hex')
	) stored;

comment on column public.onto_documents.content_hash is
	'SHA-256 of the exact raw Markdown content. Generated proposal/apply authority; never application-written.';
