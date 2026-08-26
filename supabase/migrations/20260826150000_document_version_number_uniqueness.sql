-- supabase/migrations/20260826150000_document_version_number_uniqueness.sql
--
-- P0 document trust fix (Switching Bar 0.2).
--
-- `createOrMergeDocumentVersion` derives the next version number by reading the
-- current maximum and adding one. Two concurrent writes to the same document can
-- read the same maximum and insert the same number, producing a history where two
-- distinct snapshots claim to be the same revision. Restore and diff both address
-- versions by number, so a collision makes recovery ambiguous.
--
-- Audit correction: the base ontology migration already defined a table-level
-- UNIQUE (document_id, number) constraint. This migration therefore created a
-- redundant standalone index because the check was name-based. It is retained as
-- forward-only migration history; 20260826190000 removes only this duplicate.
--
-- Pre-flight against production on 2026-08-26: 423 version rows, 0 duplicate
-- (document_id, number) pairs. The constraint applies cleanly with no backfill.
--
-- The application retry is still required: the pre-existing constraint prevents
-- duplicates, while the retry lets a losing writer recompute instead of failing.

create unique index if not exists onto_document_versions_document_number_key
	on onto_document_versions (document_id, number);

comment on index onto_document_versions_document_number_key is
	'Version numbers are the addressing scheme for diff and restore; they must be unique per document. Enforced 2026-08-26.';
