-- supabase/tests/fixtures/libri_account_deletion_purge_base.sql
-- TEST FIXTURE ONLY: every released Libri migration on a disposable PostgreSQL
-- database, for the account-deletion purge contract. Never apply this fixture to
-- a linked database.

\ir libri_worker_access_boundary_base.sql

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'libri_frontend_reader') THEN
		CREATE ROLE libri_frontend_reader
			LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
			CONNECTION LIMIT 3;
	END IF;
END;
$$;

\ir ../../migrations/20260830224500_libri_provider_cost_ledger.sql
\ir ../../migrations/20260831145458_libri_ocr_asset_grants.sql
\ir ../../migrations/20260831220245_libri_ocr_atomic_completion.sql
\ir ../../migrations/20260831223000_libri_ocr_core_sha256.sql
\ir ../../migrations/20260901012550_libri_explicit_ocr_batch_planner.sql
\ir ../../migrations/20260901014021_libri_ocr_batch_retry_guard.sql
\ir ../../migrations/20260901020431_libri_explicit_ocr_batch_admission.sql
\ir ../../migrations/20260901054000_libri_ocr_batch_dispatcher_access.sql
\ir ../../migrations/20260901055654_libri_provider_cost_reservation_step_index.sql
\ir ../../migrations/20260901153414_libri_ocr_admission_dispatch_timestamp_guard.sql
\ir ../../migrations/20260901155435_libri_ocr_admission_finalizer_hardening.sql
\ir ../../migrations/20260901163552_libri_ocr_admission_production_drift_correction.sql
\ir ../../migrations/20260902025903_libri_frontend_catalog_read_boundary.sql
\ir ../../migrations/20260903230207_libri_frontend_author_read_boundary.sql
\ir ../../migrations/20260906184227_libri_private_image_upload_admission.sql
\ir ../../migrations/20260906201700_libri_upload_processing_leases.sql
\ir ../../migrations/20260907015150_libri_upload_download_authorization.sql
\ir ../../migrations/20260907041707_libri_upload_publication_contract.sql
\ir ../../migrations/20260907043724_libri_upload_claim_deadline_refresh.sql
\ir ../../migrations/20260907154152_libri_upload_retirement_tombstones.sql
\ir ../../migrations/20260908192820_libri_upload_cleanup_leases.sql
\ir ../../migrations/20260909165112_libri_upload_capability_issuance.sql
\ir ../../migrations/20260910170101_libri_unissued_upload_quota_settlement.sql
