-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for atomic Libri OCR
-- authorization and result persistence. Never apply this fixture to a linked database.

\ir libri_ocr_asset_grants_base.sql

-- Supabase installs pgcrypto in the extensions schema. The minimal Libri fixture
-- creates it in public first, so move it before exercising schema-qualified hashing.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pgcrypto SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;

\ir ../../migrations/20260831220245_libri_ocr_atomic_completion.sql
