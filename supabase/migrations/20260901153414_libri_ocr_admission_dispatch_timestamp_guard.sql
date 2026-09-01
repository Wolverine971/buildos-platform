-- supabase/migrations/20260901153414_libri_ocr_admission_dispatch_timestamp_guard.sql
-- libri-migration: true
-- Libri phase 5 adversarial hardening: the restricted dispatcher may record
-- only the current transaction time, never an arbitrary past or future
-- enqueue timestamp.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION libri.enforce_ocr_batch_admission_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
BEGIN
	IF current_user = 'libri_worker' AND (
		OLD.status <> 'confirmed'
		OR NEW.status <> 'enqueued'
		OR NEW.enqueued_at IS DISTINCT FROM transaction_timestamp()
		OR NEW.id IS DISTINCT FROM OLD.id
		OR NEW.library_id IS DISTINCT FROM OLD.library_id
		OR NEW.run_id IS DISTINCT FROM OLD.run_id
		OR NEW.confirmation_id IS DISTINCT FROM OLD.confirmation_id
		OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
		OR NEW.manifest_sha256 IS DISTINCT FROM OLD.manifest_sha256
		OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	) THEN
		RAISE EXCEPTION 'libri_worker may only mark a confirmed OCR admission enqueued now'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION libri.enforce_ocr_batch_admission_dispatch()
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION libri.enforce_ocr_batch_admission_dispatch()
	TO libri_worker, service_role;

RESET statement_timeout;
RESET lock_timeout;
