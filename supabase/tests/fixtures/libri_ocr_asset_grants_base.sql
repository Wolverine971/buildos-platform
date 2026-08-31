-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the Libri OCR asset
-- capability broker. Never apply this fixture to a linked database.

\ir libri_provider_cost_ledger_base.sql
\ir ../../migrations/20260831145458_libri_ocr_asset_grants.sql
