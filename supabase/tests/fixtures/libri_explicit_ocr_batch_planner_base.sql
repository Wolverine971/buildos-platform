-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the explicit Libri
-- OCR batch planner. Never apply this fixture to a linked database.

\ir libri_ocr_atomic_completion_base.sql
\ir ../../migrations/20260901012550_libri_explicit_ocr_batch_planner.sql
