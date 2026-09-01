-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the Libri OCR batch
-- admission boundary. Never apply this fixture to a linked database.

\ir libri_ocr_batch_retry_guard_base.sql
\ir ../../migrations/20260901020431_libri_explicit_ocr_batch_admission.sql
