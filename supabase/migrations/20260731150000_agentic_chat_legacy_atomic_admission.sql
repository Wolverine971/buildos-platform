-- supabase/migrations/20260731150000_agentic_chat_legacy_atomic_admission.sql
-- Agentic Chat Worker migration, Phase 1 Slice 1A.
--
-- Deploy order:
--   1. Add the legacy-compatible columns and duplicate indexes.
--   2. Install the service-role-only atomic legacy admission function.
--   3. Deploy the dual-compatible web adapter/route.
--
-- Rollback order:
--   1. Route new requests back to the previous application admission path.
--   2. Leave these additive columns/indexes/function in place.
--
-- This migration deliberately adds no worker execution, queued status, queue job,
-- Realtime table, lease, generation fence, input artifact, or terminal CAS.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_runs
		WHERE client_turn_id IS NOT NULL
		GROUP BY user_id, client_turn_id
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION
			'agentic_chat_admission_preflight_failed: duplicate (user_id, client_turn_id) rows';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_runs
		WHERE client_turn_id IS NOT NULL
		GROUP BY session_id, client_turn_id
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION
			'agentic_chat_admission_preflight_failed: duplicate (session_id, client_turn_id) rows';
	END IF;
END;
$$;

ALTER TABLE public.chat_turn_runs
	ADD COLUMN IF NOT EXISTS request_hash text,
	ADD COLUMN IF NOT EXISTS request_hash_version text,
	ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'legacy_sse';

COMMENT ON COLUMN public.chat_turn_runs.request_hash IS
	'Gateway-computed canonical admission hash. PostgreSQL compares/stores it and never recomputes it.';
COMMENT ON COLUMN public.chat_turn_runs.request_hash_version IS
	'Canonical admission hash version supplied by the trusted web gateway.';
COMMENT ON COLUMN public.chat_turn_runs.execution_mode IS
	'Execution transport selected for this turn. Phase 1 writes legacy_sse only; worker constraints/immutability land later.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_turn_runs_user_client_turn
	ON public.chat_turn_runs (user_id, client_turn_id)
	WHERE client_turn_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_turn_runs_session_client_turn
	ON public.chat_turn_runs (session_id, client_turn_id)
	WHERE client_turn_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admit_legacy_agentic_chat_turn(
	p_user_id uuid,
	p_session_id uuid,
	p_turn_run_id uuid,
	p_user_message_id uuid,
	p_stream_run_id text,
	p_client_turn_id text,
	p_request_hash text,
	p_request_hash_version text,
	p_context_type text,
	p_entity_id uuid,
	p_project_id uuid,
	p_source text,
	p_gateway_enabled boolean,
	p_request_message text,
	p_started_at timestamptz,
	p_user_message_content text,
	p_user_message_metadata jsonb,
	p_history_limit integer,
	p_detached_turn_max_duration_ms integer,
	p_progress_stale_reclaim_ms integer,
	p_recent_progress_grace_ms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_duplicate public.chat_turn_runs%ROWTYPE;
	v_active public.chat_turn_runs%ROWTYPE;
	v_now timestamptz := clock_timestamp();
	v_progress_reference timestamptz;
	v_turn_age_ms numeric;
	v_progress_age_ms numeric;
	v_should_reclaim boolean := false;
	v_reclaimed_turn_run_id uuid := NULL;
	v_fallback_messages jsonb := '[]'::jsonb;
	v_fallback_attachments jsonb := '[]'::jsonb;
	v_interrupted_tool_executions jsonb := '[]'::jsonb;
	v_loaded_skill_executions jsonb := '[]'::jsonb;
	v_message_ids uuid[] := ARRAY[]::uuid[];
	v_interrupted_message_ids uuid[] := ARRAY[]::uuid[];
	v_assistant_message_ids uuid[] := ARRAY[]::uuid[];
	v_message_metadata jsonb;
	v_idempotency_key text;
	v_conflict_reason text;
BEGIN
	IF p_user_id IS NULL OR p_session_id IS NULL OR p_turn_run_id IS NULL
		OR p_user_message_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_admission_invalid_identity';
	END IF;
	IF p_stream_run_id IS NULL OR btrim(p_stream_run_id) = '' OR length(p_stream_run_id) > 256 THEN
		RAISE EXCEPTION 'agentic_chat_admission_invalid_stream_run_id';
	END IF;
	IF p_client_turn_id IS NOT NULL
		AND (btrim(p_client_turn_id) = '' OR length(p_client_turn_id) > 256) THEN
		RAISE EXCEPTION 'agentic_chat_admission_invalid_client_turn_id';
	END IF;
	IF p_request_hash IS NULL
		OR p_request_hash !~ '^[0-9a-f]{64}$'
		OR p_request_hash_version IS NULL
		OR p_request_hash_version <> 'agentic_chat_request_hash_v2' THEN
		RAISE EXCEPTION 'agentic_chat_admission_invalid_request_hash';
	END IF;
	IF p_context_type IS NULL OR btrim(p_context_type) = ''
		OR p_source IS NULL OR btrim(p_source) = ''
		OR p_request_message IS NULL OR p_user_message_content IS NULL
		OR p_started_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_admission_invalid_command';
	END IF;
	IF p_history_limit < 1 OR p_history_limit > 50
		OR p_detached_turn_max_duration_ms < 1
		OR p_progress_stale_reclaim_ms < 1
		OR p_recent_progress_grace_ms < 1 THEN
		RAISE EXCEPTION 'agentic_chat_admission_invalid_timing_bounds';
	END IF;
	v_message_metadata := COALESCE(p_user_message_metadata, '{}'::jsonb);
	IF jsonb_typeof(v_message_metadata) <> 'object'
		OR pg_column_size(v_message_metadata) > 65536 THEN
		RAISE EXCEPTION 'agentic_chat_admission_invalid_message_metadata';
	END IF;

	-- Shared with future worker admission so legacy and worker modes cannot race
	-- each other during canary. This is a transaction-scoped real database lock.
	PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

	-- Duplicate resolution intentionally precedes session/active-turn checks. A
	-- lost response must resolve the original turn even while that turn is active.
	IF p_client_turn_id IS NOT NULL THEN
		SELECT *
		INTO v_duplicate
		FROM public.chat_turn_runs
		WHERE user_id = p_user_id
			AND client_turn_id = p_client_turn_id
		LIMIT 1;

		IF FOUND THEN
			v_conflict_reason := CASE
				WHEN v_duplicate.session_id <> p_session_id THEN 'session_mismatch'
				WHEN v_duplicate.request_hash IS NULL
					OR v_duplicate.request_hash_version IS NULL THEN 'existing_turn_missing_request_hash'
				WHEN v_duplicate.request_hash_version <> p_request_hash_version THEN 'request_hash_version_mismatch'
				WHEN v_duplicate.request_hash <> p_request_hash THEN 'request_hash_mismatch'
				WHEN v_duplicate.execution_mode <> 'legacy_sse' THEN 'execution_mode_mismatch'
				WHEN v_duplicate.user_message_id IS NULL THEN 'existing_turn_missing_user_message'
				ELSE NULL
			END;

			IF v_conflict_reason IS NOT NULL THEN
				RETURN jsonb_build_object(
					'outcome', 'idempotency_conflict',
					'conflict_reason', v_conflict_reason,
					'execution_may_start', false,
					'turn_run_id', v_duplicate.id,
					'session_id', v_duplicate.session_id,
					'user_message_id', v_duplicate.user_message_id,
					'stream_run_id', v_duplicate.stream_run_id,
					'client_turn_id', v_duplicate.client_turn_id,
					'execution_mode', v_duplicate.execution_mode,
					'fallback_snapshot', NULL
				);
			END IF;

			RETURN jsonb_build_object(
				'outcome', 'matching_duplicate',
				'execution_may_start', false,
				'turn_run_id', v_duplicate.id,
				'session_id', v_duplicate.session_id,
				'user_message_id', v_duplicate.user_message_id,
				'stream_run_id', v_duplicate.stream_run_id,
				'client_turn_id', v_duplicate.client_turn_id,
				'execution_mode', v_duplicate.execution_mode,
				'fallback_snapshot', NULL
			);
		END IF;
	END IF;

	-- The gateway performs access checks, but ownership is revalidated inside the
	-- privileged transaction before any write.
	PERFORM 1
	FROM public.chat_sessions
	WHERE id = p_session_id
		AND user_id = p_user_id
	FOR KEY SHARE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_session_not_owned';
	END IF;

	SELECT *
	INTO v_active
	FROM public.chat_turn_runs
	WHERE session_id = p_session_id
		AND user_id = p_user_id
		AND status = 'running'
	ORDER BY started_at DESC, created_at DESC, id DESC
	LIMIT 1
	FOR UPDATE;

	IF FOUND THEN
		v_progress_reference := COALESCE(v_active.last_progress_at, v_active.started_at);
		v_turn_age_ms := GREATEST(0, EXTRACT(epoch FROM (v_now - v_active.started_at)) * 1000);
		v_progress_age_ms := GREATEST(0, EXTRACT(epoch FROM (v_now - v_progress_reference)) * 1000);
		v_should_reclaim :=
			v_progress_age_ms >= p_progress_stale_reclaim_ms
			OR (
				v_turn_age_ms >= p_detached_turn_max_duration_ms
				AND v_progress_age_ms >= p_recent_progress_grace_ms
			);

		IF NOT v_should_reclaim THEN
			RETURN jsonb_build_object(
				'outcome', 'active_turn_conflict',
				'execution_may_start', false,
				'turn_run_id', v_active.id,
				'session_id', v_active.session_id,
				'user_message_id', v_active.user_message_id,
				'stream_run_id', v_active.stream_run_id,
				'client_turn_id', v_active.client_turn_id,
				'execution_mode', v_active.execution_mode,
				'fallback_snapshot', NULL
			);
		END IF;

		UPDATE public.chat_turn_runs
		SET status = 'cancelled',
			finished_reason = 'stale_running_turn',
			finished_at = v_now,
			updated_at = v_now
		WHERE id = v_active.id
			AND user_id = p_user_id
			AND status = 'running';
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_stale_reclaim_lost';
		END IF;
		v_reclaimed_turn_run_id := v_active.id;
	END IF;

	-- Capture the current fallback window before the new message exists. The
	-- selection keeps the legacy newest-first limit, then returns chronological
	-- allowed-role rows for the pure TypeScript projector.
	WITH newest_messages AS (
		SELECT
			message.id,
			message.role,
			message.content,
			message.metadata,
			message.created_at,
			row_number() OVER (
				ORDER BY message.created_at DESC, message.id DESC
			) AS selection_rank
		FROM public.chat_messages AS message
		WHERE message.session_id = p_session_id
		ORDER BY message.created_at DESC, message.id DESC
		LIMIT p_history_limit
	), allowed_messages AS (
		SELECT *
		FROM newest_messages
		WHERE role IN ('user', 'assistant', 'system')
	)
	SELECT
		COALESCE(
			jsonb_agg(
				jsonb_build_object(
					'id', id,
					'role', role,
					'content', content,
					'metadata', metadata,
					'created_at', created_at
				)
				ORDER BY selection_rank DESC
			),
			'[]'::jsonb
		),
		COALESCE(array_agg(id ORDER BY selection_rank DESC), ARRAY[]::uuid[]),
		COALESCE(
			array_agg(id ORDER BY selection_rank DESC)
				FILTER (
					WHERE role = 'assistant'
						AND (
							metadata @> '{"interrupted": true}'::jsonb
							OR metadata->>'finished_reason' = 'cancelled'
							OR jsonb_typeof(metadata->'interrupted_reason') = 'string'
						)
				),
			ARRAY[]::uuid[]
		),
		COALESCE(
			array_agg(id ORDER BY selection_rank DESC) FILTER (WHERE role = 'assistant'),
			ARRAY[]::uuid[]
		)
	INTO
		v_fallback_messages,
		v_message_ids,
		v_interrupted_message_ids,
		v_assistant_message_ids
	FROM allowed_messages;

	IF cardinality(v_message_ids) > 0 THEN
		SELECT COALESCE(jsonb_agg(attachment_row.payload ORDER BY attachment_row.display_order, attachment_row.id), '[]'::jsonb)
		INTO v_fallback_attachments
		FROM (
			SELECT
				attachment.id,
				attachment.display_order,
				jsonb_build_object(
					'message_id', attachment.message_id,
					'asset_id', attachment.asset_id,
					'project_id', attachment.project_id,
					'attachment_kind', attachment.attachment_kind,
					'media_type', attachment.media_type,
					'role', attachment.role,
					'display_order', attachment.display_order,
					'metadata', attachment.metadata,
					'asset', CASE
						WHEN asset.id IS NULL THEN NULL
						ELSE jsonb_build_object(
							'id', asset.id,
							'project_id', asset.project_id,
							'original_filename', asset.original_filename,
							'content_type', asset.content_type,
							'file_size_bytes', asset.file_size_bytes,
							'width', asset.width,
							'height', asset.height,
							'checksum_sha256', asset.checksum_sha256,
							'ocr_status', asset.ocr_status,
							'extraction_summary', asset.extraction_summary,
							'extracted_text', asset.extracted_text
						)
					END
				) AS payload
			FROM public.chat_message_attachments AS attachment
			LEFT JOIN public.onto_assets AS asset ON asset.id = attachment.asset_id
			WHERE attachment.message_id = ANY(v_message_ids)
				AND attachment.session_id = p_session_id
			ORDER BY attachment.display_order ASC, attachment.id ASC
			LIMIT p_history_limit * 8
		) AS attachment_row;
	END IF;

	IF cardinality(v_interrupted_message_ids) > 0 THEN
		SELECT COALESCE(jsonb_agg(to_jsonb(execution_row) ORDER BY execution_row.sequence_index, execution_row.id), '[]'::jsonb)
		INTO v_interrupted_tool_executions
		FROM (
			SELECT
				execution.id,
				execution.message_id,
				execution.tool_name,
				execution.gateway_op,
				execution.sequence_index,
				execution.success,
				execution.error_message,
				execution.arguments,
				execution.result
			FROM public.chat_tool_executions AS execution
			WHERE execution.message_id = ANY(v_interrupted_message_ids)
			ORDER BY execution.sequence_index ASC, execution.id ASC
			LIMIT LEAST(GREATEST(p_history_limit * 32, 64), 1600)
		) AS execution_row;
	END IF;

	IF cardinality(v_assistant_message_ids) > 0 THEN
		SELECT COALESCE(jsonb_agg(to_jsonb(skill_row) ORDER BY skill_row.created_at, skill_row.sequence_index, skill_row.id), '[]'::jsonb)
		INTO v_loaded_skill_executions
		FROM (
			SELECT
				execution.id,
				execution.message_id,
				execution.tool_name,
				execution.gateway_op,
				execution.sequence_index,
				execution.success,
				execution.error_message,
				execution.arguments,
				execution.result,
				execution.created_at
			FROM public.chat_tool_executions AS execution
			WHERE execution.message_id = ANY(v_assistant_message_ids)
				AND execution.tool_name = 'skill_load'
				AND execution.success = true
			ORDER BY execution.created_at ASC, execution.sequence_index ASC, execution.id ASC
			LIMIT p_history_limit * 6
		) AS skill_row;
	END IF;

	BEGIN
		INSERT INTO public.chat_turn_runs (
			id,
			session_id,
			user_id,
			stream_run_id,
			client_turn_id,
			source,
			context_type,
			entity_id,
			project_id,
			gateway_enabled,
			request_message,
			status,
			request_prewarmed_context,
			started_at,
			request_hash,
			request_hash_version,
			execution_mode
		)
		VALUES (
			p_turn_run_id,
			p_session_id,
			p_user_id,
			p_stream_run_id,
			p_client_turn_id,
			p_source,
			p_context_type,
			p_entity_id,
			p_project_id,
			p_gateway_enabled,
			p_request_message,
			'running',
			false,
			p_started_at,
			p_request_hash,
			p_request_hash_version,
			'legacy_sse'
		);
	EXCEPTION WHEN unique_violation THEN
		-- A rolling-deploy caller may still use the old non-locking admission path.
		-- Resolve only a real active-turn winner; every other unique failure stays
		-- fatal so the transaction cannot silently claim success.
		SELECT *
		INTO v_active
		FROM public.chat_turn_runs
		WHERE session_id = p_session_id
			AND user_id = p_user_id
			AND status = 'running'
		ORDER BY started_at DESC, created_at DESC, id DESC
		LIMIT 1;
		IF NOT FOUND THEN RAISE; END IF;
		RETURN jsonb_build_object(
			'outcome', 'active_turn_conflict',
			'execution_may_start', false,
			'turn_run_id', v_active.id,
			'session_id', v_active.session_id,
			'user_message_id', v_active.user_message_id,
			'stream_run_id', v_active.stream_run_id,
			'client_turn_id', v_active.client_turn_id,
			'execution_mode', v_active.execution_mode,
			'fallback_snapshot', NULL
		);
	END;

	v_idempotency_key := 'chat-turn:' || p_turn_run_id::text || ':user';
	v_message_metadata := v_message_metadata || jsonb_build_object(
		'idempotency_key', v_idempotency_key
	);

	INSERT INTO public.chat_messages (
		id,
		session_id,
		user_id,
		role,
		content,
		metadata
	)
	VALUES (
		p_user_message_id,
		p_session_id,
		p_user_id,
		'user',
		p_user_message_content,
		v_message_metadata
	);

	UPDATE public.chat_turn_runs
	SET user_message_id = p_user_message_id,
		updated_at = v_now
	WHERE id = p_turn_run_id
		AND user_id = p_user_id
		AND status = 'running';
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_admission_turn_link_failed';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'newly_admitted',
		'execution_may_start', true,
		'turn_run_id', p_turn_run_id,
		'session_id', p_session_id,
		'user_message_id', p_user_message_id,
		'stream_run_id', p_stream_run_id,
		'client_turn_id', p_client_turn_id,
		'execution_mode', 'legacy_sse',
		'reclaimed_turn_run_id', v_reclaimed_turn_run_id,
		'fallback_snapshot', jsonb_build_object(
			'messages', v_fallback_messages,
			'attachments', v_fallback_attachments,
			'interrupted_tool_executions', v_interrupted_tool_executions,
			'loaded_skill_executions', v_loaded_skill_executions
		)
	);
END;
$$;

REVOKE ALL ON FUNCTION public.admit_legacy_agentic_chat_turn(
	uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text,
	boolean, text, timestamptz, text, jsonb, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admit_legacy_agentic_chat_turn(
	uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text,
	boolean, text, timestamptz, text, jsonb, integer, integer, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.admit_legacy_agentic_chat_turn(
	uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text,
	boolean, text, timestamptz, text, jsonb, integer, integer, integer, integer
) IS
	'Service-only duplicate-first legacy admission: pre-message history, running turn, user message, and linkage commit atomically.';
