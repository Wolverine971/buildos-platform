-- supabase/migrations/20260812030000_agentic_chat_attachment_reference_contract.sql
-- Agentic Chat Worker Phase 4 P3 S3: immutable attachment-reference contract.
--
-- New admissions freeze server-resolved current-turn/history attachment
-- references inside the hashed artifact. These helpers and triggers validate
-- that evidence, preserve exact prepared-history copies, and link the worker
-- user message to the same references in the admission transaction. Missing
-- currentTurn remains valid only for already-deployed rolling v2/v3 writers.

BEGIN;

CREATE OR REPLACE FUNCTION public.agentic_chat_normalize_frozen_attachment_v1(
	p_attachment jsonb,
	p_display_order bigint,
	p_include_resolution boolean
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
	SELECT jsonb_build_object(
		'attachment_kind', p_attachment->>'attachment_kind',
		'media_type', p_attachment->>'media_type',
		'asset_id', COALESCE(p_attachment->'asset_id', 'null'::jsonb),
		'temporary_attachment_id', COALESCE(p_attachment->'temporary_attachment_id', 'null'::jsonb),
		'project_id', COALESCE(p_attachment->'project_id', 'null'::jsonb),
		'role', COALESCE(p_attachment->'role', '"attachment"'::jsonb),
		'display_order', p_display_order,
		'file_name', COALESCE(p_attachment->'file_name', 'null'::jsonb),
		'content_type', COALESCE(p_attachment->'content_type', 'null'::jsonb),
		'file_size_bytes', COALESCE(p_attachment->'file_size_bytes', 'null'::jsonb),
		'width', COALESCE(p_attachment->'width', 'null'::jsonb),
		'height', COALESCE(p_attachment->'height', 'null'::jsonb),
		'checksum_sha256', COALESCE(p_attachment->'checksum_sha256', 'null'::jsonb),
		'ocr_status', COALESCE(p_attachment->'ocr_status', 'null'::jsonb),
		'extraction_summary', COALESCE(p_attachment->'extraction_summary', 'null'::jsonb),
		'extracted_text_preview', COALESCE(p_attachment->'extracted_text_preview', 'null'::jsonb)
	) || CASE
		WHEN p_include_resolution THEN jsonb_build_object(
			'storage_bucket', COALESCE(p_attachment->'storage_bucket', 'null'::jsonb),
			'storage_path', COALESCE(p_attachment->'storage_path', 'null'::jsonb),
			'expires_at', COALESCE(p_attachment->'expires_at', 'null'::jsonb)
		)
		ELSE '{}'::jsonb
	END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_prepared_history_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_prepared public.agentic_chat_prepared_prompts%ROWTYPE;
	v_history_state jsonb := NEW.prepared->'historyState';
	v_strategy text;
	v_compressed boolean;
	v_raw_history_count integer;
	v_history_for_model_count integer;
	v_expected_prepared_history jsonb;
BEGIN
	IF NEW.history_source = 'prepared_prompt' THEN
		IF NEW.source_prepared_prompt_id IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_lineage_missing';
		END IF;

		SELECT prepared.*
		INTO v_prepared
		FROM public.agentic_chat_prepared_prompts AS prepared
		WHERE prepared.id = NEW.source_prepared_prompt_id
			AND prepared.session_id = NEW.session_id
			AND prepared.user_id = NEW.user_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_scope_mismatch';
		END IF;
		IF EXISTS (
			SELECT 1
			FROM public.chat_messages AS message
			WHERE message.session_id = NEW.session_id
				AND message.user_id = NEW.user_id
				AND message.created_at > v_prepared.created_at
		) THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_stale';
		END IF;
	ELSIF NEW.history_source <> 'admission_window' THEN
		RAISE EXCEPTION 'agentic_chat_input_history_source_invalid';
	END IF;

	IF v_history_state IS NULL THEN
		RETURN NEW;
	END IF;
	IF jsonb_typeof(v_history_state) <> 'object'
		OR jsonb_typeof(COALESCE(v_history_state->'strategy', 'null'::jsonb)) <> 'string'
		OR v_history_state->>'strategy' NOT IN ('raw_history', 'continuity_only', 'compressed_history')
		OR jsonb_typeof(COALESCE(v_history_state->'compressed', 'null'::jsonb)) <> 'boolean'
		OR COALESCE((v_history_state->>'rawHistoryCount') !~ '^[0-9]+$', true)
		OR COALESCE((v_history_state->>'historyForModelCount') !~ '^[0-9]+$', true) THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_invalid';
	END IF;

	v_strategy := v_history_state->>'strategy';
	v_compressed := (v_history_state->>'compressed')::boolean;
	v_raw_history_count := (v_history_state->>'rawHistoryCount')::integer;
	v_history_for_model_count := (v_history_state->>'historyForModelCount')::integer;
	IF v_compressed IS DISTINCT FROM (v_strategy = 'compressed_history')
		OR v_raw_history_count < 0 OR v_raw_history_count > 50
		OR v_history_for_model_count < 0 OR v_history_for_model_count > 50
		OR v_history_for_model_count <> jsonb_array_length(NEW.history)
		OR (v_strategy = 'continuity_only' AND (v_raw_history_count <> 0 OR v_history_for_model_count <> 1)) THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_invalid';
	END IF;

	IF NEW.history_source = 'prepared_prompt' THEN
		IF jsonb_typeof(v_prepared.history_for_model) <> 'array'
			OR jsonb_array_length(v_prepared.history_for_model) > 50
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(v_prepared.history_for_model) AS history_item(value)
				WHERE jsonb_typeof(history_item.value) <> 'object'
					OR jsonb_typeof(COALESCE(history_item.value->'role', 'null'::jsonb)) <> 'string'
					OR history_item.value->>'role' NOT IN ('user', 'assistant', 'system', 'tool')
					OR jsonb_typeof(COALESCE(history_item.value->'content', 'null'::jsonb)) <> 'string'
					OR NOT public.agentic_chat_frozen_attachments_v1_are_valid(
						COALESCE(history_item.value->'attachments', '[]'::jsonb),
						true
					)
					OR (history_item.value ? 'tool_calls' AND jsonb_typeof(history_item.value->'tool_calls') <> 'array')
					OR EXISTS (
						SELECT 1
						FROM jsonb_array_elements(
							CASE
								WHEN jsonb_typeof(history_item.value->'tool_calls') = 'array'
									THEN history_item.value->'tool_calls'
								ELSE '[]'::jsonb
							END
						) AS tool_call(value)
						WHERE jsonb_typeof(tool_call.value) <> 'object'
					)
					OR (
						history_item.value ? 'tool_call_id'
						AND jsonb_typeof(history_item.value->'tool_call_id') NOT IN ('string', 'null')
					)
			) THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_invalid';
		END IF;
		IF v_prepared.history_strategy IS DISTINCT FROM v_strategy
			OR v_prepared.history_compressed IS DISTINCT FROM v_compressed
			OR v_prepared.raw_history_count IS DISTINCT FROM v_raw_history_count
			OR v_prepared.history_for_model_count IS DISTINCT FROM v_history_for_model_count THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_state_mismatch';
		END IF;

		SELECT COALESCE(
			jsonb_agg(
				jsonb_build_object(
					'sourceMessageId', NULL,
					'role', history_item.value->>'role',
					'content', history_item.value->>'content',
					'attachments', COALESCE(
						(
							SELECT jsonb_agg(
								public.agentic_chat_normalize_frozen_attachment_v1(
									attachment.value,
									attachment.ordinality - 1,
									true
								)
								ORDER BY attachment.ordinality
							)
							FROM jsonb_array_elements(
								CASE
									WHEN jsonb_typeof(history_item.value->'attachments') = 'array'
										THEN history_item.value->'attachments'
									ELSE '[]'::jsonb
								END
							) WITH ORDINALITY AS attachment(value, ordinality)
						),
						'[]'::jsonb
					),
					'toolCalls', COALESCE(history_item.value->'tool_calls', '[]'::jsonb),
					'toolCallId', COALESCE(history_item.value->'tool_call_id', 'null'::jsonb)
				)
				ORDER BY history_item.ordinality
			),
			'[]'::jsonb
		)
		INTO v_expected_prepared_history
		FROM jsonb_array_elements(v_prepared.history_for_model)
			WITH ORDINALITY AS history_item(value, ordinality);
		IF NEW.history IS DISTINCT FROM v_expected_prepared_history THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_copy_mismatch';
		END IF;
	ELSIF NEW.source_prepared_prompt_id IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_input_admission_history_lineage_invalid';
	END IF;

	UPDATE public.chat_turn_runs AS turn_run
	SET history_strategy = v_strategy,
		history_compressed = v_compressed,
		raw_history_count = v_raw_history_count,
		history_for_model_count = v_history_for_model_count
	WHERE turn_run.id = NEW.turn_run_id
		AND turn_run.session_id = NEW.session_id
		AND turn_run.user_id = NEW.user_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_turn_scope_mismatch';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_frozen_attachment_v1_is_valid(
	p_attachment jsonb,
	p_require_resolution boolean
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_kind text;
	v_file_size numeric;
	v_width numeric;
	v_height numeric;
BEGIN
	IF jsonb_typeof(COALESCE(p_attachment, 'null'::jsonb)) <> 'object'
		OR jsonb_typeof(COALESCE(p_attachment->'attachment_kind', 'null'::jsonb)) <> 'string'
		OR jsonb_typeof(COALESCE(p_attachment->'media_type', 'null'::jsonb)) <> 'string'
		OR p_attachment->>'media_type' <> 'image'
		OR COALESCE(p_attachment->>'role', 'attachment') NOT IN ('attachment', 'analysis_target')
		OR COALESCE((p_attachment->>'display_order') !~ '^[0-9]+$', true)
		OR (p_attachment->>'display_order')::numeric > 100 THEN
		RETURN false;
	END IF;

	v_kind := p_attachment->>'attachment_kind';
	IF v_kind = 'onto_asset' THEN
		IF jsonb_typeof(COALESCE(p_attachment->'asset_id', 'null'::jsonb)) <> 'string'
			OR btrim(p_attachment->>'asset_id') = ''
			OR COALESCE(jsonb_typeof(p_attachment->'temporary_attachment_id'), 'null') <> 'null'
			OR jsonb_typeof(COALESCE(p_attachment->'project_id', 'null'::jsonb)) <> 'string'
			OR btrim(p_attachment->>'project_id') = ''
			OR COALESCE(jsonb_typeof(p_attachment->'expires_at'), 'null') <> 'null' THEN
			RETURN false;
		END IF;
	ELSIF v_kind = 'temporary_file' THEN
		IF COALESCE(jsonb_typeof(p_attachment->'asset_id'), 'null') <> 'null'
			OR jsonb_typeof(COALESCE(p_attachment->'temporary_attachment_id', 'null'::jsonb)) <> 'string'
			OR btrim(p_attachment->>'temporary_attachment_id') = ''
			OR COALESCE(jsonb_typeof(p_attachment->'project_id'), 'null') <> 'null'
			OR p_attachment->>'ocr_status' IS DISTINCT FROM 'skipped'
			OR COALESCE(jsonb_typeof(p_attachment->'extraction_summary'), 'null') <> 'null'
			OR COALESCE(jsonb_typeof(p_attachment->'extracted_text_preview'), 'null') <> 'null'
			OR (
				p_attachment ? 'expires_at'
				AND jsonb_typeof(p_attachment->'expires_at') <> 'string'
			) THEN
			RETURN false;
		END IF;
	ELSE
		RETURN false;
	END IF;

	IF p_require_resolution AND (
		jsonb_typeof(COALESCE(p_attachment->'storage_bucket', 'null'::jsonb)) <> 'string'
		OR btrim(p_attachment->>'storage_bucket') = ''
		OR length(p_attachment->>'storage_bucket') > 128
		OR jsonb_typeof(COALESCE(p_attachment->'storage_path', 'null'::jsonb)) <> 'string'
		OR btrim(p_attachment->>'storage_path') = ''
		OR length(p_attachment->>'storage_path') > 2048
		OR (v_kind = 'temporary_file' AND (
			jsonb_typeof(COALESCE(p_attachment->'expires_at', 'null'::jsonb)) <> 'string'
			OR (p_attachment->>'expires_at')::timestamptz IS NULL
		))
	) THEN
		RETURN false;
	END IF;

	IF (p_attachment ? 'file_name' AND jsonb_typeof(p_attachment->'file_name') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'file_name', '')) > 1024
		OR (p_attachment ? 'content_type' AND jsonb_typeof(p_attachment->'content_type') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'content_type', '')) > 256
		OR (p_attachment ? 'ocr_status' AND jsonb_typeof(p_attachment->'ocr_status') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'ocr_status', '')) > 128
		OR (p_attachment ? 'extraction_summary' AND jsonb_typeof(p_attachment->'extraction_summary') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'extraction_summary', '')) > 700
		OR (p_attachment ? 'extracted_text_preview' AND jsonb_typeof(p_attachment->'extracted_text_preview') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'extracted_text_preview', '')) > 20000
		OR (
			COALESCE(jsonb_typeof(p_attachment->'checksum_sha256'), 'null') <> 'null'
			AND (
				jsonb_typeof(p_attachment->'checksum_sha256') <> 'string'
				OR (p_attachment->>'checksum_sha256') !~ '^[0-9a-f]{64}$'
			)
		) THEN
		RETURN false;
	END IF;

	IF COALESCE(jsonb_typeof(p_attachment->'file_size_bytes'), 'null') <> 'null' THEN
		IF (p_attachment->>'file_size_bytes') !~ '^[0-9]+$' THEN RETURN false; END IF;
		v_file_size := (p_attachment->>'file_size_bytes')::numeric;
		IF v_file_size > 104857600 THEN RETURN false; END IF;
	END IF;
	IF COALESCE(jsonb_typeof(p_attachment->'width'), 'null') <> 'null' THEN
		IF (p_attachment->>'width') !~ '^[0-9]+$' THEN RETURN false; END IF;
		v_width := (p_attachment->>'width')::numeric;
		IF v_width > 100000 THEN RETURN false; END IF;
	END IF;
	IF COALESCE(jsonb_typeof(p_attachment->'height'), 'null') <> 'null' THEN
		IF (p_attachment->>'height') !~ '^[0-9]+$' THEN RETURN false; END IF;
		v_height := (p_attachment->>'height')::numeric;
		IF v_height > 100000 THEN RETURN false; END IF;
	END IF;

	RETURN true;
EXCEPTION
	WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
		RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_frozen_attachments_v1_are_valid(
	p_attachments jsonb,
	p_require_resolution boolean
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
	IF jsonb_typeof(COALESCE(p_attachments, 'null'::jsonb)) <> 'array'
		OR jsonb_array_length(p_attachments) > 16 THEN
		RETURN false;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_attachments) WITH ORDINALITY AS attachment(value, ordinality)
		WHERE NOT public.agentic_chat_frozen_attachment_v1_is_valid(
			attachment.value,
			p_require_resolution
		)
			OR (attachment.value->>'display_order')::bigint <> attachment.ordinality - 1
	) OR EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_attachments) AS attachment(value)
		GROUP BY CONCAT(
			attachment.value->>'attachment_kind', ':',
			COALESCE(attachment.value->>'asset_id', attachment.value->>'temporary_attachment_id')
		)
		HAVING count(*) > 1
	) THEN
		RETURN false;
	END IF;

	RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_attachment_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_current_turn jsonb := NEW.prepared->'currentTurn';
	v_current_attachments jsonb;
	v_request_payload jsonb;
	v_expected_request_attachments jsonb;
	v_expected_request_message text;
BEGIN
	-- Rolling compatibility for artifacts created by the immediately preceding
	-- web version. Every new writer includes currentTurn, including text-only.
	IF v_current_turn IS NULL THEN
		RETURN NEW;
	END IF;

	IF jsonb_typeof(v_current_turn) <> 'object'
		OR jsonb_typeof(COALESCE(v_current_turn->'message', 'null'::jsonb)) <> 'string'
		OR jsonb_typeof(
			COALESCE(v_current_turn->'attachmentContextMaxChars', 'null'::jsonb)
		) <> 'number'
		OR COALESCE((v_current_turn->>'attachmentContextMaxChars') !~ '^[1-9][0-9]*$', true)
		OR jsonb_typeof(COALESCE(v_current_turn->'attachments', 'null'::jsonb)) <> 'array' THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_attachment_invalid';
	END IF;

	IF (v_current_turn->>'attachmentContextMaxChars')::numeric > 100000
		OR NOT public.agentic_chat_frozen_attachments_v1_are_valid(
			v_current_turn->'attachments',
			true
		)
		OR (
			v_current_turn->>'message' = ''
			AND jsonb_array_length(v_current_turn->'attachments') = 0
		) THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_attachment_invalid';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(NEW.history) AS history_item(value)
		WHERE jsonb_typeof(history_item.value) <> 'object'
			OR NOT public.agentic_chat_frozen_attachments_v1_are_valid(
				history_item.value->'attachments',
				true
			)
	) THEN
		RAISE EXCEPTION 'agentic_chat_input_history_attachment_invalid';
	END IF;

	SELECT turn_run.request_payload
	INTO v_request_payload
	FROM public.chat_turn_runs AS turn_run
	WHERE turn_run.id = NEW.turn_run_id
		AND turn_run.session_id = NEW.session_id
		AND turn_run.user_id = NEW.user_id
		AND turn_run.execution_mode = 'worker_realtime';
	IF NOT FOUND OR jsonb_typeof(v_request_payload) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_input_attachment_turn_scope_mismatch';
	END IF;

	SELECT COALESCE(
		jsonb_agg(
			public.agentic_chat_normalize_frozen_attachment_v1(
				attachment.value,
				attachment.ordinality - 1,
				false
			)
			ORDER BY attachment.ordinality
		),
		'[]'::jsonb
	)
	INTO v_expected_request_attachments
	FROM jsonb_array_elements(v_current_turn->'attachments') WITH ORDINALITY AS attachment(value, ordinality);

	v_current_attachments := v_current_turn->'attachments';
	v_expected_request_message := CASE
		WHEN v_current_turn->>'message' <> '' THEN v_current_turn->>'message'
		WHEN jsonb_array_length(v_current_attachments) = 1 THEN 'Attached 1 image'
		ELSE 'Attached ' || jsonb_array_length(v_current_attachments)::text || ' images'
	END;
	IF v_request_payload->>'message' IS DISTINCT FROM v_expected_request_message
		OR v_request_payload->'attachments' IS DISTINCT FROM v_expected_request_attachments THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_request_mismatch';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(v_current_attachments) AS attachment(value)
		LEFT JOIN public.onto_assets AS asset
			ON asset.id::text = attachment.value->>'asset_id'
		WHERE attachment.value->>'attachment_kind' = 'onto_asset'
			AND (
				asset.id IS NULL
				OR asset.kind <> 'image'
				OR asset.deleted_at IS NOT NULL
				OR asset.project_id::text IS DISTINCT FROM attachment.value->>'project_id'
				OR asset.storage_bucket IS DISTINCT FROM attachment.value->>'storage_bucket'
				OR asset.storage_path IS DISTINCT FROM attachment.value->>'storage_path'
				OR COALESCE(to_jsonb(asset.original_filename), 'null'::jsonb) IS DISTINCT FROM attachment.value->'file_name'
				OR COALESCE(to_jsonb(asset.content_type), 'null'::jsonb) IS DISTINCT FROM attachment.value->'content_type'
				OR COALESCE(to_jsonb(asset.file_size_bytes), 'null'::jsonb) IS DISTINCT FROM attachment.value->'file_size_bytes'
				OR COALESCE(to_jsonb(asset.width), 'null'::jsonb) IS DISTINCT FROM attachment.value->'width'
				OR COALESCE(to_jsonb(asset.height), 'null'::jsonb) IS DISTINCT FROM attachment.value->'height'
				OR COALESCE(to_jsonb(asset.checksum_sha256), 'null'::jsonb) IS DISTINCT FROM attachment.value->'checksum_sha256'
				OR COALESCE(to_jsonb(asset.ocr_status), 'null'::jsonb) IS DISTINCT FROM attachment.value->'ocr_status'
			)
	) THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_asset_mismatch';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(v_current_attachments) AS attachment(value)
		WHERE attachment.value->>'attachment_kind' = 'temporary_file'
			AND (
				attachment.value->>'storage_bucket' <> 'onto-assets'
				OR attachment.value->>'storage_path' NOT LIKE
					'users/' || NEW.user_id::text || '/chat-temp/' ||
					(attachment.value->>'temporary_attachment_id') || '/%'
				OR (attachment.value->>'expires_at')::timestamptz <= statement_timestamp()
				OR (attachment.value->>'expires_at')::timestamptz > statement_timestamp() + interval '7 days 5 minutes'
			)
	) THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_temporary_mismatch';
	END IF;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.agentic_chat_normalize_frozen_attachment_v1(jsonb, bigint, boolean)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agentic_chat_frozen_attachment_v1_is_valid(jsonb, boolean)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agentic_chat_frozen_attachments_v1_are_valid(jsonb, boolean)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_attachment_contract()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_attachment_contract
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_attachment_contract
BEFORE INSERT ON public.chat_turn_input_artifacts
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_attachment_contract();

CREATE OR REPLACE FUNCTION public.link_agentic_chat_worker_message_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
BEGIN
	IF NEW.role <> 'user'
		OR jsonb_typeof(COALESCE(NEW.metadata, '{}'::jsonb)) <> 'object'
		OR COALESCE(NEW.metadata->>'idempotency_key', '') !~
			'^chat-turn:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:user$' THEN
		RETURN NEW;
	END IF;

	SELECT turn_run.*
	INTO v_turn
	FROM public.chat_turn_runs AS turn_run
	WHERE 'chat-turn:' || turn_run.id::text || ':user' = NEW.metadata->>'idempotency_key'
		AND turn_run.session_id = NEW.session_id
		AND turn_run.user_id = NEW.user_id
		AND turn_run.execution_mode = 'worker_realtime'
		AND turn_run.status = 'queued';
	IF NOT FOUND THEN
		RETURN NEW;
	END IF;

	SELECT artifact.*
	INTO v_artifact
	FROM public.chat_turn_input_artifacts AS artifact
	WHERE artifact.turn_run_id = v_turn.id
		AND artifact.session_id = NEW.session_id
		AND artifact.user_id = NEW.user_id;
	IF NOT FOUND OR v_artifact.prepared->'currentTurn' IS NULL THEN
		RETURN NEW;
	END IF;

	INSERT INTO public.chat_message_attachments (
		message_id,
		session_id,
		user_id,
		project_id,
		asset_id,
		attachment_kind,
		media_type,
		role,
		display_order,
		metadata
	)
	SELECT
		NEW.id,
		NEW.session_id,
		NEW.user_id,
		NULLIF(attachment.value->>'project_id', '')::uuid,
		NULLIF(attachment.value->>'asset_id', '')::uuid,
		attachment.value->>'attachment_kind',
		'image',
		attachment.value->>'role',
		(attachment.value->>'display_order')::integer,
		jsonb_build_object(
			'temporary_attachment_id', COALESCE(attachment.value->'temporary_attachment_id', 'null'::jsonb),
			'storage_bucket', COALESCE(attachment.value->'storage_bucket', 'null'::jsonb),
			'storage_path', COALESCE(attachment.value->'storage_path', 'null'::jsonb),
			'file_name', COALESCE(attachment.value->'file_name', 'null'::jsonb),
			'content_type', COALESCE(attachment.value->'content_type', 'null'::jsonb),
			'file_size_bytes', COALESCE(attachment.value->'file_size_bytes', 'null'::jsonb),
			'width', COALESCE(attachment.value->'width', 'null'::jsonb),
			'height', COALESCE(attachment.value->'height', 'null'::jsonb),
			'checksum_sha256', COALESCE(attachment.value->'checksum_sha256', 'null'::jsonb),
			'ocr_status', COALESCE(attachment.value->'ocr_status', 'null'::jsonb),
			'extraction_summary', COALESCE(attachment.value->'extraction_summary', 'null'::jsonb),
			'extracted_text_preview', COALESCE(attachment.value->'extracted_text_preview', 'null'::jsonb),
			'expires_at', COALESCE(attachment.value->'expires_at', 'null'::jsonb)
		)
	FROM jsonb_array_elements(v_artifact.prepared->'currentTurn'->'attachments') AS attachment(value);

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_agentic_chat_worker_message_attachments()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_messages_link_worker_attachments
	ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_link_worker_attachments
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.link_agentic_chat_worker_message_attachments();

COMMENT ON FUNCTION public.validate_agentic_chat_attachment_contract() IS
	'Validates rolling-compatible immutable current-turn/history attachment evidence against the parent worker request and current asset ownership before artifact insertion.';
COMMENT ON FUNCTION public.link_agentic_chat_worker_message_attachments() IS
	'Links frozen worker current-turn attachments to the admitted user message inside the atomic admission transaction.';

COMMIT;
