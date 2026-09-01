-- supabase/migrations/20260901155435_libri_ocr_admission_finalizer_hardening.sql
-- libri-migration: true
-- libri-allow-public-read: queue_jobs
-- libri-allow-security-definer: finalize_ocr_batch_admission_dispatch
-- Libri phase 5 adversarial hardening: make the reviewed OCR manifest durable,
-- require exact queue evidence at the final admission transition, and recheck
-- the admitted image contract immediately before paid OCR authorization.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION libri.enforce_ocr_batch_admission_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	run_row record;
	manifest_count bigint;
	valid_item_count bigint;
	calculated_manifest_sha256 text;
BEGIN
	IF OLD.status IN ('confirmed', 'enqueued') AND (
		NEW.id IS DISTINCT FROM OLD.id
		OR NEW.library_id IS DISTINCT FROM OLD.library_id
		OR NEW.run_id IS DISTINCT FROM OLD.run_id
		OR NEW.confirmation_id IS DISTINCT FROM OLD.confirmation_id
		OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
		OR NEW.manifest_sha256 IS DISTINCT FROM OLD.manifest_sha256
		OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	) THEN
		RAISE EXCEPTION 'confirmed OCR admission identity is immutable'
			USING ERRCODE = '42501';
	END IF;

	IF OLD.status = NEW.status THEN
		IF NEW.enqueued_at IS DISTINCT FROM OLD.enqueued_at THEN
			RAISE EXCEPTION 'OCR admission enqueue timestamp is immutable'
				USING ERRCODE = '42501';
		END IF;
		RETURN NEW;
	END IF;

	IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
		IF NEW.enqueued_at IS NOT NULL THEN
			RAISE EXCEPTION 'cancelled OCR admission cannot retain an enqueue timestamp'
				USING ERRCODE = '42501';
		END IF;
		RETURN NEW;
	END IF;

	IF OLD.status <> 'confirmed'
		OR NEW.status <> 'enqueued'
		OR NEW.enqueued_at IS DISTINCT FROM transaction_timestamp() THEN
		RAISE EXCEPTION 'OCR admission transition is not permitted'
			USING ERRCODE = '42501';
	END IF;

	SELECT
		run.id,
		run.queue_family,
		run.kind,
		run.subject_type,
		run.subject_id,
		run.requested_by_actor,
		run.requested_by,
		run.status,
		run.cancel_requested_at,
		run.deadline_at,
		run.planned_steps,
		run.max_steps,
		run.max_attempts_per_step,
		run.max_concurrent_steps,
		run.correlation_id,
		library.created_by AS library_created_by
	INTO run_row
	FROM libri.research_runs AS run
	JOIN libri.libraries AS library ON library.id = run.library_id
	WHERE run.library_id = OLD.library_id AND run.id = OLD.run_id;

	SELECT
		count(*),
		count(*) FILTER (
			WHERE step.status = 'queued'
				AND step.queue_family = 'libri_ingest'
				AND step.kind = 'ocr_image'
				AND step.attempts = 0
				AND step.max_attempts = 1
				AND step.active_queue_job_id IS NOT NULL
				AND step.payload_version = 1
				AND step.payload IS NOT DISTINCT FROM jsonb_build_object(
					'version', 1,
					'kind', 'ocr_image',
					'imageId', item.image_id::text,
					'expectedOcrVersion', item.expected_ocr_version,
					'maxOutputChars', 50000
				)
				AND step.scheduled_for IS NOT DISTINCT FROM transaction_timestamp()
				AND image.book_id IS NOT DISTINCT FROM run_row.subject_id
				AND image.content_sha256 IS NOT DISTINCT FROM item.image_content_sha256
				AND image.ocr_status IN ('pending', 'failed')
				AND image.ocr_version + 1 = item.expected_ocr_version
				AND queue.id IS NOT NULL
				AND queue.user_id IS NOT DISTINCT FROM run_row.library_created_by
				AND queue.job_type = 'libri_ingest'
				AND queue.status = 'pending'
				AND queue.priority = step.priority
				AND queue.attempts = 0
				AND queue.max_attempts = 1
				AND queue.scheduled_for IS NOT DISTINCT FROM transaction_timestamp()
				AND queue.dedup_key IS NOT DISTINCT FROM
					'libri:research-step:' || step.id::text
				AND queue.metadata IS NOT DISTINCT FROM jsonb_build_object(
					'correlationId', run_row.correlation_id::text,
					'libraryId', OLD.library_id::text,
					'researchRunId', OLD.run_id::text,
					'researchStepId', step.id::text,
					'payloadVersion', step.payload_version,
					'libriAdmissionId', OLD.id::text,
					'libriManifestSha256', OLD.manifest_sha256,
					'libriBatchPosition', item.position
				)
		),
		encode(
			pg_catalog.sha256(
				convert_to(
					'{"version":1,"runId":"' || OLD.run_id::text
						|| '","libraryId":"' || OLD.library_id::text
						|| '","bookId":"' || run_row.subject_id::text
						|| '","items":['
						|| COALESCE(
							string_agg(
								'{"stepId":"' || item.step_id::text
									|| '","imageId":"' || item.image_id::text
									|| '","position":' || item.position::text
									|| ',"expectedOcrVersion":' || item.expected_ocr_version::text
									|| ',"imageContentSha256":"' || item.image_content_sha256 || '"}',
								',' ORDER BY item.position
							),
							''
						)
						|| ']}',
					'UTF8'
				)
			),
			'hex'
		)
	INTO manifest_count, valid_item_count, calculated_manifest_sha256
	FROM libri.ocr_batch_items AS item
	JOIN libri.research_steps AS step
		ON step.library_id = item.library_id
		AND step.run_id = item.run_id
		AND step.id = item.step_id
	JOIN libri.images AS image
		ON image.library_id = item.library_id AND image.id = item.image_id
	LEFT JOIN public.queue_jobs AS queue ON queue.id = step.active_queue_job_id
	WHERE item.library_id = OLD.library_id AND item.run_id = OLD.run_id;

	IF run_row.id IS NULL
		OR run_row.queue_family <> 'libri_ingest'
		OR run_row.kind <> 'ocr_book_batch'
		OR run_row.subject_type <> 'book'
		OR run_row.subject_id IS NULL
		OR run_row.requested_by_actor <> 'user'
		OR run_row.requested_by IS DISTINCT FROM OLD.confirmed_by
		OR run_row.status <> 'queued'
		OR run_row.cancel_requested_at IS NOT NULL
		OR run_row.deadline_at IS NULL
		OR run_row.deadline_at <= clock_timestamp()
		OR manifest_count NOT BETWEEN 1 AND 10
		OR manifest_count IS DISTINCT FROM run_row.planned_steps::bigint
		OR manifest_count IS DISTINCT FROM run_row.max_steps::bigint
		OR run_row.max_attempts_per_step <> 1
		OR run_row.max_concurrent_steps <> LEAST(manifest_count::integer, 2)
		OR valid_item_count IS DISTINCT FROM manifest_count
		OR calculated_manifest_sha256 IS DISTINCT FROM OLD.manifest_sha256 THEN
		RAISE EXCEPTION 'OCR admission queue finalization contract is invalid'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE FUNCTION libri.finalize_ocr_batch_admission_dispatch(
	p_admission_id uuid,
	p_dispatch_expires_at timestamptz
)
RETURNS TABLE (
	admission_id uuid,
	enqueued_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, libri
AS $function$
BEGIN
	IF p_admission_id IS NULL
		OR p_dispatch_expires_at IS NULL
		OR p_dispatch_expires_at <= clock_timestamp()
		OR p_dispatch_expires_at > clock_timestamp() + interval '30 minutes' THEN
		RAISE EXCEPTION 'OCR admission dispatch window expired or is invalid'
			USING ERRCODE = '57014';
	END IF;

	RETURN QUERY
	UPDATE libri.ocr_batch_admissions AS admission
	SET
		status = 'enqueued',
		enqueued_at = transaction_timestamp(),
		updated_at = transaction_timestamp()
	WHERE admission.id = p_admission_id AND admission.status = 'confirmed'
	RETURNING admission.id, admission.enqueued_at;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'confirmed OCR admission was not finalized'
			USING ERRCODE = '55000';
	END IF;

	IF p_dispatch_expires_at <= clock_timestamp() THEN
		RAISE EXCEPTION 'OCR admission dispatch window expired during finalization'
			USING ERRCODE = '57014';
	END IF;
END;
$function$;

CREATE FUNCTION libri.enforce_confirmed_ocr_batch_item_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	old_admitted boolean := false;
	new_admitted boolean := false;
BEGIN
	IF TG_OP <> 'INSERT' THEN
		SELECT EXISTS (
			SELECT 1
			FROM libri.ocr_batch_admissions AS admission
			WHERE admission.library_id = OLD.library_id
				AND admission.run_id = OLD.run_id
				AND admission.status IN ('confirmed', 'enqueued')
		) INTO old_admitted;
	END IF;
	IF TG_OP <> 'DELETE' THEN
		SELECT EXISTS (
			SELECT 1
			FROM libri.ocr_batch_admissions AS admission
			WHERE admission.library_id = NEW.library_id
				AND admission.run_id = NEW.run_id
				AND admission.status IN ('confirmed', 'enqueued')
		) INTO new_admitted;
	END IF;

	IF old_admitted OR new_admitted THEN
		RAISE EXCEPTION 'confirmed OCR batch items are immutable'
			USING ERRCODE = '42501';
	END IF;

	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE TRIGGER ocr_batch_items_confirmed_immutability_guard
	BEFORE INSERT OR UPDATE OR DELETE ON libri.ocr_batch_items
	FOR EACH ROW EXECUTE FUNCTION libri.enforce_confirmed_ocr_batch_item_immutability();

CREATE FUNCTION libri.enforce_confirmed_ocr_step_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	old_admitted boolean := false;
	new_admitted boolean := false;
	old_enqueued boolean := false;
	new_enqueued boolean := false;
BEGIN
	IF TG_OP <> 'INSERT' THEN
		SELECT EXISTS (
			SELECT 1
			FROM libri.ocr_batch_admissions AS admission
			WHERE admission.library_id = OLD.library_id
				AND admission.run_id = OLD.run_id
				AND admission.status IN ('confirmed', 'enqueued')
		) INTO old_admitted;
		SELECT EXISTS (
			SELECT 1
			FROM libri.ocr_batch_admissions AS admission
			WHERE admission.library_id = OLD.library_id
				AND admission.run_id = OLD.run_id
				AND admission.status = 'enqueued'
		) INTO old_enqueued;
	END IF;
	IF TG_OP <> 'DELETE' THEN
		SELECT EXISTS (
			SELECT 1
			FROM libri.ocr_batch_admissions AS admission
			WHERE admission.library_id = NEW.library_id
				AND admission.run_id = NEW.run_id
				AND admission.status IN ('confirmed', 'enqueued')
		) INTO new_admitted;
		SELECT EXISTS (
			SELECT 1
			FROM libri.ocr_batch_admissions AS admission
			WHERE admission.library_id = NEW.library_id
				AND admission.run_id = NEW.run_id
				AND admission.status = 'enqueued'
		) INTO new_enqueued;
	END IF;

	IF (old_admitted OR new_admitted) AND (
		TG_OP IN ('INSERT', 'DELETE')
		OR NEW.id IS DISTINCT FROM OLD.id
		OR NEW.library_id IS DISTINCT FROM OLD.library_id
		OR NEW.run_id IS DISTINCT FROM OLD.run_id
		OR NEW.parent_step_id IS DISTINCT FROM OLD.parent_step_id
		OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
		OR NEW.queue_family IS DISTINCT FROM OLD.queue_family
		OR NEW.kind IS DISTINCT FROM OLD.kind
		OR NEW.stage IS DISTINCT FROM OLD.stage
		OR NEW.position IS DISTINCT FROM OLD.position
		OR NEW.depth IS DISTINCT FROM OLD.depth
		OR NEW.priority IS DISTINCT FROM OLD.priority
		OR NEW.payload_version IS DISTINCT FROM OLD.payload_version
		OR NEW.payload IS DISTINCT FROM OLD.payload
		OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
		OR (
			(old_enqueued OR new_enqueued)
			AND NEW.active_queue_job_id IS DISTINCT FROM OLD.active_queue_job_id
		)
	) THEN
		RAISE EXCEPTION 'confirmed OCR step execution contract is immutable'
			USING ERRCODE = '42501';
	END IF;

	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE TRIGGER research_steps_confirmed_ocr_contract_guard
	BEFORE INSERT OR UPDATE OR DELETE ON libri.research_steps
	FOR EACH ROW EXECUTE FUNCTION libri.enforce_confirmed_ocr_step_contract();

CREATE FUNCTION libri.enforce_admitted_ocr_image_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	admitted boolean;
	provider_match_count bigint;
BEGIN
	SELECT EXISTS (
		SELECT 1
		FROM libri.ocr_batch_items AS item
		JOIN libri.ocr_batch_admissions AS admission
			ON admission.library_id = item.library_id
			AND admission.run_id = item.run_id
			AND admission.status IN ('confirmed', 'enqueued')
		WHERE item.library_id = OLD.library_id AND item.image_id = OLD.id
	) INTO admitted;

	IF TG_OP = 'DELETE' THEN
		IF admitted THEN
			RAISE EXCEPTION 'admitted OCR image identity is immutable'
				USING ERRCODE = '42501';
		END IF;
		RETURN OLD;
	END IF;

	IF admitted AND (
		NEW.id IS DISTINCT FROM OLD.id
		OR NEW.library_id IS DISTINCT FROM OLD.library_id
		OR NEW.book_id IS DISTINCT FROM OLD.book_id
		OR NEW.chapter_id IS DISTINCT FROM OLD.chapter_id
		OR NEW.source_id IS DISTINCT FROM OLD.source_id
		OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id
		OR NEW.object_path IS DISTINCT FROM OLD.object_path
		OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
		OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
		OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
		OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
		OR NEW.image_type IS DISTINCT FROM OLD.image_type
		OR NEW.page_label IS DISTINCT FROM OLD.page_label
		OR NEW.description IS DISTINCT FROM OLD.description
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	) THEN
		RAISE EXCEPTION 'admitted OCR image identity is immutable'
			USING ERRCODE = '42501';
	END IF;

	IF current_user = 'libri_worker' AND NEW.ocr_status = 'processing' THEN
		SELECT count(*)
		INTO provider_match_count
		FROM libri.ocr_batch_items AS item
		JOIN libri.ocr_batch_admissions AS admission
			ON admission.library_id = item.library_id
			AND admission.run_id = item.run_id
			AND admission.status = 'enqueued'
		JOIN libri.research_steps AS step
			ON step.library_id = item.library_id
			AND step.run_id = item.run_id
			AND step.id = item.step_id
		JOIN libri.research_runs AS run
			ON run.library_id = step.library_id AND run.id = step.run_id
		JOIN public.queue_jobs AS queue ON queue.id = step.active_queue_job_id
		WHERE item.library_id = OLD.library_id
			AND item.image_id = OLD.id
			AND item.step_id = (NEW.ocr_metadata->>'stepId')::uuid
			AND item.image_content_sha256 = OLD.content_sha256
			AND item.expected_ocr_version = (NEW.ocr_metadata->>'expectedOcrVersion')::integer
			AND step.status = 'leased'
			AND step.active_queue_job_id IS NOT NULL
			AND step.active_processing_token IS NOT NULL
			AND step.lease_token IS NOT NULL
			AND step.lease_expires_at > clock_timestamp()
			AND step.payload_version = 1
			AND step.payload IS NOT DISTINCT FROM jsonb_build_object(
				'version', 1,
				'kind', 'ocr_image',
				'imageId', OLD.id::text,
				'expectedOcrVersion', item.expected_ocr_version,
				'maxOutputChars', 50000
			)
			AND queue.job_type = 'libri_ingest'
			AND queue.status = 'processing'
			AND queue.processing_token IS NOT DISTINCT FROM step.active_processing_token
			AND queue.attempts = 0
			AND queue.max_attempts = 1
			AND queue.dedup_key IS NOT DISTINCT FROM
				'libri:research-step:' || step.id::text
			AND queue.metadata IS NOT DISTINCT FROM jsonb_build_object(
				'correlationId', run.correlation_id::text,
				'libraryId', item.library_id::text,
				'researchRunId', item.run_id::text,
				'researchStepId', step.id::text,
				'payloadVersion', step.payload_version,
				'libriAdmissionId', admission.id::text,
				'libriManifestSha256', admission.manifest_sha256,
				'libriBatchPosition', item.position
			)
			AND run.kind = 'ocr_book_batch'
			AND run.subject_type = 'book'
			AND run.subject_id = OLD.book_id
			AND run.status = 'running'
			AND run.cancel_requested_at IS NULL
			AND run.deadline_at > clock_timestamp();

		IF provider_match_count <> 1 THEN
			RAISE EXCEPTION 'paid OCR authorization lacks an exact enqueued admission'
				USING ERRCODE = '42501';
		END IF;
	END IF;

	RETURN NEW;
END;
$function$;

CREATE TRIGGER images_admitted_ocr_contract_guard
	BEFORE UPDATE OR DELETE ON libri.images
	FOR EACH ROW EXECUTE FUNCTION libri.enforce_admitted_ocr_image_contract();

REVOKE ALL ON FUNCTION libri.enforce_ocr_batch_admission_dispatch()
	FROM PUBLIC, anon, authenticated, libri_worker;
GRANT EXECUTE ON FUNCTION libri.enforce_ocr_batch_admission_dispatch()
	TO service_role;

REVOKE ALL ON FUNCTION libri.finalize_ocr_batch_admission_dispatch(uuid, timestamptz)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION libri.finalize_ocr_batch_admission_dispatch(uuid, timestamptz)
	TO libri_worker, service_role;

REVOKE UPDATE (status, enqueued_at, updated_at)
	ON TABLE libri.ocr_batch_admissions FROM libri_worker;

REVOKE ALL ON FUNCTION libri.enforce_confirmed_ocr_batch_item_immutability()
	FROM PUBLIC, anon, authenticated, libri_worker;
REVOKE ALL ON FUNCTION libri.enforce_confirmed_ocr_step_contract()
	FROM PUBLIC, anon, authenticated, libri_worker;
REVOKE ALL ON FUNCTION libri.enforce_admitted_ocr_image_contract()
	FROM PUBLIC, anon, authenticated, libri_worker;

RESET statement_timeout;
RESET lock_timeout;
