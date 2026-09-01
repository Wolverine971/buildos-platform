-- libri-migration: true
-- Libri phase 4D: give the restricted Railway role only the authority needed
-- to translate one confirmed OCR admission into the shared queue atomically.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE INDEX ocr_batch_admissions_confirmed_by_idx
	ON libri.ocr_batch_admissions (confirmed_by)
	WHERE confirmed_by IS NOT NULL;

CREATE POLICY ocr_batch_items_libri_worker_select_admitted
	ON libri.ocr_batch_items
	FOR SELECT
	TO libri_worker
	USING (
		EXISTS (
			SELECT 1
			FROM libri.ocr_batch_admissions AS admission
			WHERE admission.library_id = ocr_batch_items.library_id
				AND admission.run_id = ocr_batch_items.run_id
				AND admission.status IN ('confirmed', 'enqueued')
		)
	);

CREATE POLICY ocr_batch_admissions_libri_worker_select_dispatchable
	ON libri.ocr_batch_admissions
	FOR SELECT
	TO libri_worker
	USING (status IN ('confirmed', 'enqueued'));

CREATE POLICY ocr_batch_admissions_libri_worker_mark_enqueued
	ON libri.ocr_batch_admissions
	FOR UPDATE
	TO libri_worker
	USING (status = 'confirmed')
	WITH CHECK (status = 'enqueued');

CREATE FUNCTION libri.enforce_ocr_batch_admission_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
BEGIN
	IF current_user = 'libri_worker' AND (
		OLD.status <> 'confirmed'
		OR NEW.status <> 'enqueued'
		OR NEW.enqueued_at IS NULL
		OR NEW.enqueued_at < OLD.confirmed_at
		OR NEW.id IS DISTINCT FROM OLD.id
		OR NEW.library_id IS DISTINCT FROM OLD.library_id
		OR NEW.run_id IS DISTINCT FROM OLD.run_id
		OR NEW.confirmation_id IS DISTINCT FROM OLD.confirmation_id
		OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
		OR NEW.manifest_sha256 IS DISTINCT FROM OLD.manifest_sha256
		OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	) THEN
		RAISE EXCEPTION 'libri_worker may only mark a confirmed OCR admission enqueued'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE TRIGGER ocr_batch_admissions_dispatch_guard
	BEFORE UPDATE ON libri.ocr_batch_admissions
	FOR EACH ROW EXECUTE FUNCTION libri.enforce_ocr_batch_admission_dispatch();

REVOKE ALL ON TABLE libri.ocr_batch_items, libri.ocr_batch_admissions
	FROM libri_worker;
GRANT SELECT ON TABLE libri.ocr_batch_items TO libri_worker;
GRANT SELECT ON TABLE libri.ocr_batch_admissions TO libri_worker;
GRANT UPDATE (status, enqueued_at, updated_at)
	ON TABLE libri.ocr_batch_admissions TO libri_worker;

REVOKE ALL ON FUNCTION libri.enforce_ocr_batch_admission_dispatch()
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION libri.enforce_ocr_batch_admission_dispatch()
	TO libri_worker, service_role;

RESET statement_timeout;
RESET lock_timeout;
