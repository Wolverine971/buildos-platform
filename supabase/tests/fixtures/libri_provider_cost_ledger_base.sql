-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the Libri provider-cost
-- ledger. Never apply this fixture to a linked database.

\ir libri_worker_access_boundary_base.sql
\ir ../../migrations/20260830224500_libri_provider_cost_ledger.sql
