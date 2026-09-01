-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the Libri OCR batch
-- retry guard. Never apply this fixture to a linked database.

\ir libri_explicit_ocr_batch_planner_base.sql
\ir ../../migrations/20260901014021_libri_ocr_batch_retry_guard.sql
