-- libri-migration: true
-- libri-allow-destructive: reviewed
-- Libri phase 4A follow-up: preserve active OCR generation exclusion while
-- allowing a terminally failed/cancelled manifest to be explicitly replanned.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE INDEX ocr_batch_items_image_version_idx
	ON libri.ocr_batch_items (library_id, image_id, expected_ocr_version);

CREATE FUNCTION libri.enforce_ocr_batch_item_generation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
BEGIN
	-- Serialize every manifest writer for the same image, including direct
	-- service-role inserts that do not pass through the planner.
	PERFORM 1
	FROM libri.images AS image
	WHERE image.library_id = NEW.library_id AND image.id = NEW.image_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'OCR batch manifest image was not found'
			USING ERRCODE = '23503';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM libri.ocr_batch_items AS item
		JOIN libri.research_steps AS prior_step
			ON prior_step.library_id = item.library_id
			AND prior_step.run_id = item.run_id
			AND prior_step.id = item.step_id
		JOIN libri.research_runs AS prior_run
			ON prior_run.library_id = prior_step.library_id
			AND prior_run.id = prior_step.run_id
		WHERE item.library_id = NEW.library_id
			AND item.image_id = NEW.image_id
			AND item.expected_ocr_version = NEW.expected_ocr_version
			AND NOT (
				prior_step.status IN ('failed', 'cancelled', 'skipped', 'dead_letter')
				AND prior_run.status IN ('partial', 'failed', 'cancelled', 'budget_exhausted')
			)
	) THEN
		RAISE EXCEPTION 'an active OCR batch already owns an expected image version'
			USING ERRCODE = '23505';
	END IF;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION libri.enforce_ocr_batch_item_generation_guard
	FROM PUBLIC, anon, authenticated, libri_worker;
GRANT EXECUTE ON FUNCTION libri.enforce_ocr_batch_item_generation_guard
	TO service_role;

CREATE TRIGGER ocr_batch_items_generation_guard
	BEFORE INSERT ON libri.ocr_batch_items
	FOR EACH ROW EXECUTE FUNCTION libri.enforce_ocr_batch_item_generation_guard();

ALTER TABLE libri.ocr_batch_items
	DROP CONSTRAINT ocr_batch_items_image_version_unique;

RESET statement_timeout;
RESET lock_timeout;
