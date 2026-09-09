-- supabase/tests/fixtures/document_recency_guard_base.sql
-- Minimal prerequisites for the document recency trigger contract.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
