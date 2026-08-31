-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for atomic Libri OCR
-- authorization and result persistence. Never apply this fixture to a linked database.

\ir libri_ocr_asset_grants_base.sql

-- Supabase installs pgcrypto in the extensions schema. The minimal Libri fixture
-- creates it in public first, so move it before exercising schema-qualified hashing.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pgcrypto SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;

\ir ../../migrations/20260831220245_libri_ocr_atomic_completion.sql

-- Production intentionally withholds this shared schema from the worker. Exercise
-- the corrective function definitions under the same least-privilege boundary.
REVOKE USAGE ON SCHEMA extensions FROM PUBLIC, libri_worker;
\ir ../../migrations/20260831223000_libri_ocr_core_sha256.sql
