-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the restricted Libri
-- OCR admission dispatcher. Never apply this fixture to a linked database.

\ir libri_explicit_ocr_batch_admission_base.sql
\ir ../../migrations/20260901054000_libri_ocr_batch_dispatcher_access.sql
