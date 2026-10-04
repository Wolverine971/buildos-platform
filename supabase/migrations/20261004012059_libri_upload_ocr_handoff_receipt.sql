-- libri-migration: true
-- Record an uploaded image's first explicitly confirmed OCR handoff in the same
-- transaction that enqueues it. This never plans, confirms, or starts paid work.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE libri.image_upload_publications
	ADD COLUMN followup_admission_id uuid REFERENCES libri.ocr_batch_admissions(id) ON DELETE RESTRICT,
	ADD COLUMN followup_step_id uuid,
	ADD COLUMN followup_dispatched_at timestamptz,
	ADD CONSTRAINT image_upload_publications_followup_step_fk
		FOREIGN KEY (followup_step_id)
		REFERENCES libri.research_steps(id) ON DELETE RESTRICT,
	ADD CONSTRAINT image_upload_publications_followup_receipt CHECK (
		(followup_status = 'dispatched' AND followup_admission_id IS NOT NULL
			AND followup_step_id IS NOT NULL AND followup_dispatched_at IS NOT NULL)
		OR (followup_status IS DISTINCT FROM 'dispatched' AND followup_admission_id IS NULL
			AND followup_step_id IS NULL AND followup_dispatched_at IS NULL)
	);
CREATE INDEX image_upload_publications_followup_admission_idx
	ON libri.image_upload_publications(followup_admission_id) WHERE followup_admission_id IS NOT NULL;
CREATE INDEX image_upload_publications_followup_step_idx
	ON libri.image_upload_publications(followup_step_id) WHERE followup_step_id IS NOT NULL;

CREATE FUNCTION libri.record_upload_ocr_handoff()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	expected_count integer;
	written_count integer;
	member_role text;
BEGIN
	-- The existing BEFORE trigger checks the immutable confirmed manifest and exact
	-- queue/step/image evidence. The restricted worker calls its reviewed definer
	-- finalizer; this invoker trigger runs inside that transaction without new grants.
	SELECT count(*) INTO expected_count
	FROM libri.image_upload_publications publication
	JOIN libri.ocr_batch_items item ON item.library_id=publication.library_id
		AND item.image_id=publication.image_id AND item.run_id=NEW.run_id
	WHERE publication.library_id=NEW.library_id AND publication.status='published'
		AND publication.followup_status='pending';
	IF expected_count=0 THEN RETURN NEW; END IF;
	IF expected_count>10 THEN
		RAISE EXCEPTION 'Upload OCR handoff exceeds batch limit' USING ERRCODE='22023';
	END IF;
	SELECT role INTO member_role FROM libri.library_members
	WHERE library_id=NEW.library_id AND user_id=NEW.confirmed_by FOR SHARE;
	IF member_role IS NULL OR member_role NOT IN ('owner','editor') THEN
		RAISE EXCEPTION 'Upload OCR confirmer no longer has library access' USING ERRCODE='42501';
	END IF;

	UPDATE libri.image_upload_publications publication
	SET followup_status='dispatched',followup_admission_id=NEW.id,
		followup_step_id=item.step_id,followup_dispatched_at=NEW.enqueued_at
	FROM libri.ocr_batch_items item
	JOIN libri.research_runs run ON run.library_id=item.library_id AND run.id=item.run_id
	WHERE publication.library_id=NEW.library_id AND publication.status='published'
		AND publication.followup_status='pending' AND item.library_id=publication.library_id
		AND item.image_id=publication.image_id AND item.run_id=NEW.run_id
		AND publication.book_id=run.subject_id AND run.subject_type='book'
		AND publication.verified_metadata->>'sha256'=item.image_content_sha256;
	GET DIAGNOSTICS written_count=ROW_COUNT;
	IF written_count<>expected_count THEN
		RAISE EXCEPTION 'Published upload does not match confirmed OCR handoff' USING ERRCODE='42501';
	END IF;
	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION libri.record_upload_ocr_handoff()
	FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.record_upload_ocr_handoff() TO service_role;
CREATE TRIGGER ocr_batch_admissions_upload_handoff
	AFTER UPDATE ON libri.ocr_batch_admissions
	FOR EACH ROW WHEN (OLD.status='confirmed' AND NEW.status='enqueued')
	EXECUTE FUNCTION libri.record_upload_ocr_handoff();

-- Existing account purging deletes publications before admissions and steps,
-- preserving the receipt while its published asset exists without changing purge order.
NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
