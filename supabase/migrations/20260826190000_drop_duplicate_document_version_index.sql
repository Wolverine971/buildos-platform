-- supabase/migrations/20260826190000_drop_duplicate_document_version_index.sql
-- The base ontology schema already creates a validated UNIQUE constraint on
-- (document_id, number). Migration 20260826150000 added a standalone index with
-- the same key because its idempotency check was name-based. Keep the constraint
-- (and its backing index) as the canonical uniqueness guarantee, and remove only
-- the redundant standalone index to avoid duplicate write maintenance.

drop index if exists public.onto_document_versions_document_number_key;
