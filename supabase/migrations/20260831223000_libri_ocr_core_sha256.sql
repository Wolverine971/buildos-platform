-- libri-migration: true
-- Libri phase 3G correction: keep OCR hashing inside pg_catalog so the restricted
-- worker does not need USAGE on Supabase's shared extensions schema.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION libri.enforce_ocr_source_chunk_worker_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	image_row record;
	step_row record;
	reservation_row record;
	expected_metadata jsonb;
	expected_ocr_version integer;
BEGIN
	IF current_user <> 'libri_worker' THEN
		RETURN NEW;
	END IF;

	BEGIN
		expected_ocr_version := (NEW.metadata->>'ocrVersion')::integer;
	EXCEPTION
		WHEN invalid_text_representation OR numeric_value_out_of_range THEN
			RAISE EXCEPTION 'invalid OCR source chunk metadata';
	END;

	SELECT
		image.library_id,
		image.id,
		image.source_id,
		image.book_id,
		image.chapter_id,
		image.content_sha256,
		image.ocr_status,
		image.ocr_version
	INTO image_row
	FROM libri.images AS image
	WHERE image.library_id = NEW.library_id AND image.id = NEW.image_id;
	SELECT step.* INTO step_row
	FROM libri.research_steps AS step
	WHERE step.id = (NEW.metadata->>'stepId')::uuid;
	SELECT reservation.* INTO reservation_row
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.id = (NEW.metadata->>'costReservationId')::uuid;

	expected_metadata := jsonb_build_object(
		'version', 1,
		'ocrVersion', expected_ocr_version,
		'imageContentSha256', image_row.content_sha256,
		'summary', NEW.metadata->'summary',
		'confidence', NEW.metadata->'confidence',
		'runId', step_row.run_id::text,
		'stepId', step_row.id::text,
		'executionGeneration', step_row.execution_generation,
		'costReservationId', reservation_row.id::text,
		'provider', reservation_row.provider,
		'model', reservation_row.model,
		'providerRequestId', NEW.metadata->'providerRequestId',
		'actualCostMicrousd', NEW.metadata->'actualCostMicrousd',
		'promptTokens', NEW.metadata->'promptTokens',
		'completionTokens', NEW.metadata->'completionTokens'
	);

	IF NEW.chunk_type <> 'ocr'
		OR NEW.library_id IS DISTINCT FROM image_row.library_id
		OR NEW.source_id IS DISTINCT FROM image_row.source_id
		OR NEW.book_id IS DISTINCT FROM image_row.book_id
		OR NEW.chapter_id IS DISTINCT FROM image_row.chapter_id
		OR image_row.ocr_status <> 'processing'
		OR image_row.ocr_version + 1 <> expected_ocr_version
		OR step_row.library_id IS DISTINCT FROM NEW.library_id
		OR step_row.status <> 'leased'
		OR step_row.execution_generation IS DISTINCT FROM reservation_row.execution_generation
		OR step_row.lease_token IS DISTINCT FROM reservation_row.lease_token
		OR step_row.lease_expires_at <= clock_timestamp()
		OR reservation_row.library_id IS DISTINCT FROM NEW.library_id
		OR reservation_row.run_id IS DISTINCT FROM step_row.run_id
		OR reservation_row.step_id IS DISTINCT FROM step_row.id
		OR reservation_row.status <> 'started'
		OR reservation_row.reservation_key IS DISTINCT FROM
			'ocr:image:' || image_row.id::text || ':version:' || expected_ocr_version::text
		OR NEW.idempotency_key IS DISTINCT FROM
			'ocr:image:' || image_row.id::text || ':version:' || expected_ocr_version::text
		OR NEW.content_sha256 IS DISTINCT FROM encode(
			pg_catalog.sha256(convert_to(NEW.content, 'UTF8')),
			'hex'
		)
		OR NEW.metadata IS DISTINCT FROM expected_metadata THEN
		RAISE EXCEPTION 'invalid or stale OCR source chunk write';
	END IF;
	RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION libri.persist_and_settle_ocr_result(
	p_queue_row_id uuid,
	p_processing_token uuid,
	p_step_id uuid,
	p_execution_generation integer,
	p_lease_token uuid,
	p_reservation_id uuid,
	p_image_id uuid,
	p_extracted_text text,
	p_summary text,
	p_confidence numeric,
	p_language text,
	p_actual_cost_microusd bigint,
	p_prompt_tokens bigint,
	p_completion_tokens bigint,
	p_provider_request_id text
)
RETURNS TABLE (
	accepted boolean,
	outcome text,
	source_chunk_id uuid,
	ocr_version integer,
	provider text,
	model text,
	content_sha256 text,
	over_budget boolean,
	total_spent_microusd bigint,
	remaining_microusd bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, libri
AS $function$
DECLARE
	step_row record;
	run_row record;
	reservation_row libri.provider_cost_reservations%ROWTYPE;
	image_row record;
	existing_chunk record;
	payload_version integer;
	expected_ocr_version integer;
	payload_max_output_chars integer;
	normalized_text text;
	normalized_summary text;
	normalized_language text;
	content_hash text;
	chunk_key text;
	chunk_metadata jsonb;
	new_chunk_id uuid;
	held_microusd bigint;
	spent_microusd bigint;
	has_overrun boolean;
BEGIN
	IF p_queue_row_id IS NULL OR p_processing_token IS NULL OR p_step_id IS NULL
		OR p_execution_generation IS NULL OR p_execution_generation <= 0
		OR p_lease_token IS NULL OR p_reservation_id IS NULL OR p_image_id IS NULL
		OR p_actual_cost_microusd IS NULL OR p_actual_cost_microusd < 0
		OR p_prompt_tokens IS NULL OR p_prompt_tokens < 0
		OR p_completion_tokens IS NULL OR p_completion_tokens < 0
		OR length(btrim(p_provider_request_id)) NOT BETWEEN 1 AND 256 THEN
		RAISE EXCEPTION 'invalid OCR result input';
	END IF;
	normalized_text := btrim(p_extracted_text);
	normalized_summary := btrim(p_summary);
	normalized_language := NULLIF(btrim(p_language), '');
	IF length(normalized_text) < 1
		OR length(normalized_summary) NOT BETWEEN 1 AND 1000
		OR (normalized_language IS NOT NULL AND length(normalized_language) > 64)
		OR (p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 1)) THEN
		RAISE EXCEPTION 'invalid OCR result content';
	END IF;

	SELECT
		step.library_id,
		step.run_id,
		step.status,
		step.active_queue_job_id,
		step.active_processing_token,
		step.execution_generation,
		step.lease_token,
		step.lease_expires_at,
		step.payload_version,
		step.payload
	INTO step_row
	FROM libri.research_steps AS step
	WHERE step.id = p_step_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RETURN QUERY SELECT false, 'stale'::text, NULL::uuid, NULL::integer,
			NULL::text, NULL::text, NULL::text, false, 0::bigint, 0::bigint;
		RETURN;
	END IF;

	SELECT run.status, run.cancel_requested_at, run.deadline_at, run.cost_budget_microusd
	INTO run_row
	FROM libri.research_runs AS run
	WHERE run.id = step_row.run_id AND run.library_id = step_row.library_id
	FOR UPDATE;
	IF step_row.status <> 'leased'
		OR step_row.active_queue_job_id IS DISTINCT FROM p_queue_row_id
		OR step_row.active_processing_token IS DISTINCT FROM p_processing_token
		OR step_row.execution_generation IS DISTINCT FROM p_execution_generation
		OR step_row.lease_token IS DISTINCT FROM p_lease_token
		OR step_row.lease_expires_at <= clock_timestamp()
		OR run_row.status <> 'running'
		OR run_row.cancel_requested_at IS NOT NULL
		OR (run_row.deadline_at IS NOT NULL AND run_row.deadline_at <= clock_timestamp())
		OR run_row.cost_budget_microusd IS NULL THEN
		RETURN QUERY SELECT false, 'stale'::text, NULL::uuid, NULL::integer,
			NULL::text, NULL::text, NULL::text, false, 0::bigint, 0::bigint;
		RETURN;
	END IF;

	BEGIN
		payload_version := (step_row.payload->>'version')::integer;
		expected_ocr_version := (step_row.payload->>'expectedOcrVersion')::integer;
		payload_max_output_chars := (step_row.payload->>'maxOutputChars')::integer;
	EXCEPTION
		WHEN invalid_text_representation OR numeric_value_out_of_range THEN
			RETURN QUERY SELECT false, 'invalid_payload'::text, NULL::uuid, NULL::integer,
				NULL::text, NULL::text, NULL::text, false, 0::bigint, 0::bigint;
			RETURN;
	END;
	IF step_row.payload_version <> 1
		OR payload_version <> 1
		OR expected_ocr_version <= 0
		OR payload_max_output_chars NOT BETWEEN 1 AND 100000
		OR length(normalized_text) > payload_max_output_chars
		OR step_row.payload IS DISTINCT FROM jsonb_build_object(
			'version', payload_version,
			'kind', 'ocr_image',
			'imageId', p_image_id::text,
			'expectedOcrVersion', expected_ocr_version,
			'maxOutputChars', payload_max_output_chars
		) THEN
		RETURN QUERY SELECT false, 'invalid_payload'::text, NULL::uuid, NULL::integer,
			NULL::text, NULL::text, NULL::text, false, 0::bigint, 0::bigint;
		RETURN;
	END IF;

	SELECT reservation.* INTO reservation_row
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.id = p_reservation_id
	FOR UPDATE;
	IF NOT FOUND
		OR reservation_row.library_id IS DISTINCT FROM step_row.library_id
		OR reservation_row.run_id IS DISTINCT FROM step_row.run_id
		OR reservation_row.step_id IS DISTINCT FROM p_step_id
		OR reservation_row.execution_generation IS DISTINCT FROM p_execution_generation
		OR reservation_row.lease_token IS DISTINCT FROM p_lease_token
		OR reservation_row.reservation_key IS DISTINCT FROM
			'ocr:image:' || p_image_id::text || ':version:' || expected_ocr_version::text
		OR reservation_row.status <> 'started' THEN
		RETURN QUERY SELECT false, COALESCE(reservation_row.status, 'stale'),
			NULL::uuid, NULL::integer, NULL::text, NULL::text, NULL::text,
			false, 0::bigint, 0::bigint;
		RETURN;
	END IF;

	SELECT
		image.library_id,
		image.id,
		image.source_id,
		image.book_id,
		image.chapter_id,
		image.bucket_id,
		image.mime_type,
		image.byte_size,
		image.content_sha256,
		image.page_label,
		image.ocr_status,
		image.ocr_version,
		image.ocr_metadata
	INTO image_row
	FROM libri.images AS image
	WHERE image.library_id = step_row.library_id AND image.id = p_image_id
	FOR UPDATE;
	IF NOT FOUND
		OR image_row.ocr_status <> 'processing'
		OR image_row.ocr_version + 1 <> expected_ocr_version
		OR image_row.ocr_metadata->>'stepId' IS DISTINCT FROM p_step_id::text
		OR image_row.ocr_metadata->>'executionGeneration' IS DISTINCT FROM
			p_execution_generation::text
		OR image_row.ocr_metadata->>'costReservationId' IS DISTINCT FROM p_reservation_id::text THEN
		RETURN QUERY SELECT false, 'image_unavailable'::text, NULL::uuid, NULL::integer,
			NULL::text, NULL::text, NULL::text, false, 0::bigint, 0::bigint;
		RETURN;
	END IF;

	content_hash := encode(
		pg_catalog.sha256(convert_to(normalized_text, 'UTF8')),
		'hex'
	);
	chunk_key := 'ocr:image:' || p_image_id::text || ':version:' || expected_ocr_version::text;
	chunk_metadata := jsonb_build_object(
		'version', 1,
		'ocrVersion', expected_ocr_version,
		'imageContentSha256', image_row.content_sha256,
		'summary', to_jsonb(normalized_summary),
		'confidence', to_jsonb(p_confidence),
		'runId', step_row.run_id::text,
		'stepId', p_step_id::text,
		'executionGeneration', p_execution_generation,
		'costReservationId', p_reservation_id::text,
		'provider', reservation_row.provider,
		'model', reservation_row.model,
		'providerRequestId', to_jsonb(btrim(p_provider_request_id)),
		'actualCostMicrousd', to_jsonb(p_actual_cost_microusd),
		'promptTokens', to_jsonb(p_prompt_tokens),
		'completionTokens', to_jsonb(p_completion_tokens)
	);

	INSERT INTO libri.source_chunks (
		library_id,
		source_id,
		book_id,
		chapter_id,
		image_id,
		chunk_type,
		page_label,
		language,
		content,
		content_sha256,
		idempotency_key,
		metadata
	) VALUES (
		image_row.library_id,
		image_row.source_id,
		image_row.book_id,
		image_row.chapter_id,
		image_row.id,
		'ocr',
		image_row.page_label,
		normalized_language,
		normalized_text,
		content_hash,
		chunk_key,
		chunk_metadata
	)
	ON CONFLICT (library_id, idempotency_key) DO NOTHING
	RETURNING id INTO new_chunk_id;

	IF new_chunk_id IS NULL THEN
		SELECT
			chunk.id,
			chunk.source_id,
			chunk.book_id,
			chunk.chapter_id,
			chunk.image_id,
			chunk.chunk_type,
			chunk.language,
			chunk.content,
			chunk.content_sha256,
			chunk.metadata
		INTO existing_chunk
		FROM libri.source_chunks AS chunk
		WHERE chunk.library_id = image_row.library_id
			AND chunk.idempotency_key = chunk_key
		FOR UPDATE;
		IF existing_chunk.source_id IS DISTINCT FROM image_row.source_id
			OR existing_chunk.book_id IS DISTINCT FROM image_row.book_id
			OR existing_chunk.chapter_id IS DISTINCT FROM image_row.chapter_id
			OR existing_chunk.image_id IS DISTINCT FROM image_row.id
			OR existing_chunk.chunk_type <> 'ocr'
			OR existing_chunk.language IS DISTINCT FROM normalized_language
			OR existing_chunk.content IS DISTINCT FROM normalized_text
			OR existing_chunk.content_sha256 IS DISTINCT FROM content_hash
			OR existing_chunk.metadata IS DISTINCT FROM chunk_metadata THEN
			RAISE EXCEPTION 'OCR source chunk idempotency conflict';
		END IF;
		new_chunk_id := existing_chunk.id;
	END IF;

	UPDATE libri.provider_cost_reservations AS reservation
	SET
		status = 'settled',
		actual_cost_microusd = p_actual_cost_microusd,
		prompt_tokens = p_prompt_tokens,
		completion_tokens = p_completion_tokens,
		provider_request_id = btrim(p_provider_request_id),
		settled_at = clock_timestamp()
	WHERE reservation.id = reservation_row.id;

	SELECT
		COALESCE(sum(reservation.reserved_microusd) FILTER (
			WHERE reservation.status IN ('reserved', 'started')
		), 0),
		COALESCE(sum(reservation.actual_cost_microusd) FILTER (
			WHERE reservation.status = 'settled'
		), 0),
		COALESCE(bool_or(
			reservation.status = 'settled'
			AND reservation.actual_cost_microusd > reservation.reserved_microusd
		), false)
	INTO held_microusd, spent_microusd, has_overrun
	FROM libri.provider_cost_reservations AS reservation
	WHERE reservation.run_id = step_row.run_id;

	UPDATE libri.images AS image
	SET
		ocr_status = 'complete',
		ocr_version = expected_ocr_version,
		ocr_metadata = chunk_metadata || jsonb_build_object(
			'state', 'complete',
			'sourceChunkId', new_chunk_id::text,
			'contentSha256', content_hash,
			'completedAt', to_jsonb(clock_timestamp())
		)
	WHERE image.id = image_row.id;

	RETURN QUERY SELECT
		true,
		'settled'::text,
		new_chunk_id,
		expected_ocr_version,
		reservation_row.provider,
		reservation_row.model,
		content_hash,
		has_overrun OR spent_microusd > run_row.cost_budget_microusd,
		spent_microusd,
		greatest(run_row.cost_budget_microusd - held_microusd - spent_microusd, 0);
END;
$function$;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;

