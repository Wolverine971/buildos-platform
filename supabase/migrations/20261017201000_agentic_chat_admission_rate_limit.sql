-- supabase/migrations/20261017201000_agentic_chat_admission_rate_limit.sql
--
-- Agentic Chat pipeline audit 2026-10-17, row B14
-- (docs/technical/reviews/AGENTIC_CHAT_PIPELINE_AUDIT_2026-10-17.md).
--
-- The web route's turn rate limiter is an in-memory map per Vercel function
-- instance, so it protects nothing across instances, and session-less sends skip
-- the one-active-turn guard (up to 100 queued turns per user). The durable limit
-- now lives in the admission RPC, under the per-user advisory lock it already
-- takes:
--
--   * At most 20 admitted turns per user in any rolling 60 s. Over it, the RPC
--     returns {outcome: 'rate_limited', execution_may_start: false,
--     retry_after_seconds (1-60), limit, window_seconds, recent_count} and writes
--     nothing. The web route maps it to 429 AGENTIC_CHAT_RATE_LIMITED with
--     Retry-After; the browser already treats that code as not admitted and
--     restores the draft.
--   * Duplicates first: the matching_duplicate / idempotency_conflict lookup runs
--     before the count, so a lost-response resend is never refused.
--   * 20/60 s from production (read-only, 2026-10-17): the busiest real person
--     ever admitted 4-5 turns in a 60 s window (chat_turn_runs, all time); the
--     prod battery harness peaks at 7 (llm_usage_logs by stream_run_id, today's
--     sequential 13 x 3 run). ~3x headroom over anything observed.
--   * New index (user_id, created_at DESC) keeps the count an index range scan
--     (chat_turn_runs: ~1.5k rows / 4.5 MB on 2026-10-17, so the build is
--     milliseconds; lock_timeout bounds the brief write lock).
--
-- Everything else is production's live definition (pg_get_functiondef,
-- 2026-10-17), unchanged: signature, SECURITY INVOKER, search_path, the
-- service_role guard, validation, locking order, outcomes and grants. No other
-- function SET clause. CREATE OR REPLACE keeps the owner and grants; they are
-- restated (identical to prod: postgres + service_role only) so this file is
-- self-describing.
--
-- Deploy order: web first (it understands 'rate_limited' and still accepts every
-- old outcome), then this migration. Applied before the web deploy, an old web
-- instance would read 'rate_limited' as a protocol error and answer 503
-- WORKER_ADMISSION_UNAVAILABLE, but only for a user already over the limit.
-- The workflow-review admission RPCs (create_agentic_chat_workflow_turn_with_job_v1,
-- create_agentic_chat_document_review_turn_v2/v3/v4,
-- create_agentic_chat_published_review_turn_v1) are not changed: they admit only
-- for the env-gated internal cohort (AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS).
-- Their turns still count toward the user's window here.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_chat_turn_runs_user_created
	ON public.chat_turn_runs USING btree (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_agentic_chat_turn_with_job(p_user_id uuid, p_session_id uuid, p_turn_run_id uuid, p_user_message_id uuid, p_input_artifact_id uuid, p_stream_run_id text, p_client_turn_id text, p_request_hash text, p_request_hash_version text, p_transport_contract_version text, p_transport_decision_id uuid, p_correlation_id uuid, p_context_type text, p_entity_id uuid, p_project_id uuid, p_source text, p_gateway_enabled boolean, p_request_message text, p_request_payload jsonb, p_request_payload_version text, p_user_message_content text, p_user_message_metadata jsonb, p_history_limit integer, p_history_source text, p_artifact_history jsonb, p_artifact_prepared jsonb, p_artifact_content_hash text, p_artifact_history_bytes integer, p_artifact_content_bytes integer, p_prepared_prompt_id uuid, p_prepared_context_payload_sha256 text, p_prepared_surface_profile text, p_session_agent_metadata jsonb, p_capacity_available boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_duplicate public.chat_turn_runs%ROWTYPE;
	v_active public.chat_turn_runs%ROWTYPE;
	v_session public.chat_sessions%ROWTYPE;
	v_prepared public.agentic_chat_prepared_prompts%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_now timestamptz := clock_timestamp();
	v_session_created boolean := false;
	v_running_count integer := 0;
	v_queued_count integer := 0;
	v_history_message_ids uuid[] := ARRAY[]::uuid[];
	v_source_history_ids uuid[] := ARRAY[]::uuid[];
	v_message_metadata jsonb;
	v_session_metadata jsonb;
	v_prepared_surface jsonb;
	v_queue_job_id uuid;
	v_conflict_reason text;
	-- B14 per-user admission rate limit (see the file header).
	c_rate_limit_max CONSTANT integer := 20;
	c_rate_limit_window CONSTANT interval := interval '60 seconds';
	v_recent_count integer := 0;
	v_limit_turn_created_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_admission_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF p_user_id IS NULL
		OR p_turn_run_id IS NULL
		OR p_user_message_id IS NULL
		OR p_input_artifact_id IS NULL
		OR p_transport_decision_id IS NULL
		OR p_correlation_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_identity';
	END IF;
	IF p_stream_run_id IS NULL OR btrim(p_stream_run_id) = ''
		OR length(p_stream_run_id) > 256
		OR p_client_turn_id IS NULL OR btrim(p_client_turn_id) = ''
		OR length(p_client_turn_id) > 256 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_client_identity';
	END IF;
	IF p_request_hash IS NULL
		OR p_request_hash !~ '^[0-9a-f]{64}$'
		OR p_request_hash_version <> 'agentic_chat_request_hash_v2' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_request_hash';
	END IF;
	IF p_transport_contract_version <> 'agentic_chat_worker_v1'
		OR p_request_payload_version <> 'agentic_chat_request_v1' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_unsupported_contract';
	END IF;
	IF p_context_type IS NULL OR btrim(p_context_type) = ''
		OR length(p_context_type) > 128
		OR p_source IS NULL OR btrim(p_source) = '' OR length(p_source) > 128
		OR p_gateway_enabled IS NULL
		OR p_request_message IS NULL
		OR p_user_message_content IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_command';
	END IF;
	IF p_history_limit IS NULL OR p_history_limit < 1 OR p_history_limit > 50 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_history_limit';
	END IF;
	IF p_capacity_available IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_capacity_decision';
	END IF;

	v_message_metadata := COALESCE(p_user_message_metadata, '{}'::jsonb);
	v_session_metadata := COALESCE(p_session_agent_metadata, '{}'::jsonb);
	IF jsonb_typeof(COALESCE(p_request_payload, 'null'::jsonb)) <> 'object'
		OR pg_column_size(p_request_payload) > 262144
		OR jsonb_typeof(v_message_metadata) <> 'object'
		OR pg_column_size(v_message_metadata) > 65536
		OR jsonb_typeof(v_session_metadata) <> 'object'
		OR pg_column_size(v_session_metadata) > 65536 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_json_payload';
	END IF;

	IF p_history_source NOT IN ('admission_window', 'prepared_prompt')
		OR jsonb_typeof(COALESCE(p_artifact_history, 'null'::jsonb)) <> 'array'
		OR jsonb_typeof(COALESCE(p_artifact_prepared, 'null'::jsonb)) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_input_artifact';
	END IF;
	IF jsonb_array_length(p_artifact_history) > 50
		OR p_artifact_content_hash IS NULL
		OR p_artifact_content_hash !~ '^[0-9a-f]{64}$'
		OR p_artifact_history_bytes IS NULL
		OR p_artifact_history_bytes < 0
		OR p_artifact_history_bytes > 262144
		OR p_artifact_content_bytes IS NULL
		OR p_artifact_content_bytes <= 0
		OR p_artifact_content_bytes > 2097152
		OR p_artifact_history_bytes > p_artifact_content_bytes
		OR pg_column_size(p_artifact_history) + pg_column_size(p_artifact_prepared) > 4194304 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_input_artifact';
	END IF;

	IF p_artifact_prepared->>'surfaceProfile' IS NULL
		OR btrim(p_artifact_prepared->>'surfaceProfile') = ''
		OR p_artifact_prepared->>'systemPrompt' IS NULL
		OR jsonb_typeof(COALESCE(p_artifact_prepared->'contextPayload', 'null'::jsonb)) <> 'object'
		OR jsonb_typeof(COALESCE(p_artifact_prepared->'promptSections', 'null'::jsonb)) <> 'array'
		OR jsonb_typeof(COALESCE(p_artifact_prepared->'toolSurface', 'null'::jsonb)) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_prepared_artifact';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_artifact_history) AS history_item(value)
		WHERE jsonb_typeof(history_item.value) <> 'object'
			OR history_item.value->>'role' IS NULL
			OR history_item.value->>'role' NOT IN ('user', 'assistant', 'system', 'tool')
			OR history_item.value->>'content' IS NULL
			OR jsonb_typeof(COALESCE(history_item.value->'attachments', 'null'::jsonb)) <> 'array'
			OR jsonb_typeof(COALESCE(history_item.value->'toolCalls', 'null'::jsonb)) <> 'array'
	) THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_frozen_history';
	END IF;

	BEGIN
		SELECT COALESCE(
			array_agg((history_item.value->>'sourceMessageId')::uuid ORDER BY history_item.ordinality),
			ARRAY[]::uuid[]
		)
		INTO v_source_history_ids
		FROM jsonb_array_elements(p_artifact_history) WITH ORDINALITY AS history_item(value, ordinality)
		WHERE history_item.value->>'sourceMessageId' IS NOT NULL;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_history_lineage';
	END;

	-- This lock domain is identical to admit_legacy_agentic_chat_turn. Worker
	-- and legacy admissions therefore cannot pass duplicate/active/capacity
	-- checks concurrently during the canary window.
	PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

	-- A lost response must resolve before pressure, capacity, prompt consumption,
	-- or session creation. Null session means "no assertion" on a retry.
	SELECT turns.*
	INTO v_duplicate
	FROM public.chat_turn_runs turns
	WHERE turns.user_id = p_user_id
		AND turns.client_turn_id = p_client_turn_id
	LIMIT 1;

	IF FOUND THEN
		v_conflict_reason := CASE
			WHEN p_session_id IS NOT NULL
				AND v_duplicate.session_id IS DISTINCT FROM p_session_id THEN 'session_mismatch'
			WHEN v_duplicate.request_hash IS NULL
				OR v_duplicate.request_hash_version IS NULL THEN 'existing_turn_missing_request_hash'
			WHEN v_duplicate.request_hash_version <> p_request_hash_version THEN 'request_hash_version_mismatch'
			WHEN v_duplicate.request_hash <> p_request_hash THEN 'request_hash_mismatch'
			ELSE NULL
		END;

		RETURN jsonb_build_object(
			'outcome', CASE WHEN v_conflict_reason IS NULL
				THEN 'matching_duplicate' ELSE 'idempotency_conflict' END,
			'conflict_reason', v_conflict_reason,
			'execution_may_start', false,
			'turn_run_id', v_duplicate.id,
			'session_id', v_duplicate.session_id,
			'user_message_id', v_duplicate.user_message_id,
			'input_artifact_id', v_duplicate.input_artifact_id,
			'queue_job_id', v_duplicate.queue_job_id,
			'correlation_id', v_duplicate.correlation_id,
			'stream_run_id', v_duplicate.stream_run_id,
			'client_turn_id', v_duplicate.client_turn_id,
			'execution_mode', v_duplicate.execution_mode,
			'status', v_duplicate.status
		);
	END IF;

	SELECT
		count(*) FILTER (WHERE turns.status = 'running'),
		count(*) FILTER (WHERE turns.status = 'queued')
	INTO v_running_count, v_queued_count
	FROM public.chat_turn_runs turns
	WHERE turns.user_id = p_user_id
		AND turns.execution_mode = 'worker_realtime'
		AND turns.status IN ('queued', 'running');

	IF v_queued_count >= 100 THEN
		RETURN jsonb_build_object(
			'outcome', 'capacity_exceeded',
			'execution_may_start', false,
			'capacity_reason', 'max_queued',
			'retry_after_seconds', 30,
			'running_count', v_running_count,
			'queued_count', v_queued_count
		);
	END IF;

	-- B14: at most c_rate_limit_max admitted turns per user in any rolling
	-- c_rate_limit_window, counted under the per-user advisory lock taken above, so
	-- the limit holds across every web function instance. Only admitted turns have
	-- rows (a refusal or a rolled-back attempt writes nothing), so the window
	-- slides on its own. A lost-response resend already returned above as
	-- matching_duplicate and is never counted against the user or refused here.
	SELECT count(*)
	INTO v_recent_count
	FROM public.chat_turn_runs turns
	WHERE turns.user_id = p_user_id
		AND turns.created_at > v_now - c_rate_limit_window;

	IF v_recent_count >= c_rate_limit_max THEN
		-- The user is back under the limit once the turn that took them to it ages
		-- out of the window.
		SELECT turns.created_at
		INTO v_limit_turn_created_at
		FROM public.chat_turn_runs turns
		WHERE turns.user_id = p_user_id
			AND turns.created_at > v_now - c_rate_limit_window
		ORDER BY turns.created_at ASC, turns.id ASC
		OFFSET v_recent_count - c_rate_limit_max
		LIMIT 1;

		RETURN jsonb_build_object(
			'outcome', 'rate_limited',
			'execution_may_start', false,
			'retry_after_seconds', LEAST(
				GREATEST(
					ceil(extract(epoch FROM (
						v_limit_turn_created_at + c_rate_limit_window - v_now
					)))::integer,
					1
				),
				extract(epoch FROM c_rate_limit_window)::integer
			),
			'limit', c_rate_limit_max,
			'window_seconds', extract(epoch FROM c_rate_limit_window)::integer,
			'recent_count', v_recent_count
		);
	END IF;

	IF p_session_id IS NOT NULL THEN
		SELECT sessions.*
		INTO v_session
		FROM public.chat_sessions sessions
		WHERE sessions.id = p_session_id
			AND sessions.user_id = p_user_id
		FOR KEY SHARE;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_session_not_owned';
		END IF;
		IF v_session.context_type IS DISTINCT FROM p_context_type
			OR v_session.entity_id IS DISTINCT FROM p_entity_id THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_session_scope_mismatch';
		END IF;
	ELSIF p_context_type = 'daily_brief' AND p_entity_id IS NOT NULL THEN
		-- The per-user admission lock makes this canonical lookup/create race-safe.
		SELECT sessions.*
		INTO v_session
		FROM public.chat_sessions sessions
		WHERE sessions.user_id = p_user_id
			AND sessions.context_type = 'daily_brief'
			AND sessions.entity_id = p_entity_id
			AND sessions.status = 'active'
		ORDER BY sessions.updated_at DESC, sessions.created_at DESC, sessions.id DESC
		LIMIT 1
		FOR UPDATE;
	END IF;

	IF v_session.id IS NULL THEN
		BEGIN
			INSERT INTO public.chat_sessions (
				user_id,
				context_type,
				entity_id,
				status,
				agent_metadata
			) VALUES (
				p_user_id,
				p_context_type,
				p_entity_id,
				'active',
				v_session_metadata
			)
			RETURNING * INTO v_session;
			v_session_created := true;
		EXCEPTION WHEN unique_violation THEN
			IF p_context_type <> 'daily_brief' OR p_entity_id IS NULL THEN
				RAISE;
			END IF;

			SELECT sessions.*
			INTO v_session
			FROM public.chat_sessions sessions
			WHERE sessions.user_id = p_user_id
				AND sessions.context_type = 'daily_brief'
				AND sessions.entity_id = p_entity_id
				AND sessions.status = 'active'
			LIMIT 1
			FOR UPDATE;
			IF NOT FOUND THEN
				RAISE;
			END IF;
			v_session_created := false;
		END;
	END IF;

	SELECT turns.*
	INTO v_active
	FROM public.chat_turn_runs turns
	WHERE turns.session_id = v_session.id
		AND turns.user_id = p_user_id
		AND turns.status IN ('queued', 'running')
	ORDER BY turns.created_at DESC, turns.id DESC
	LIMIT 1
	FOR UPDATE;

	IF FOUND THEN
		RETURN jsonb_build_object(
			'outcome', 'active_turn_conflict',
			'execution_may_start', false,
			'turn_run_id', v_active.id,
			'session_id', v_active.session_id,
			'user_message_id', v_active.user_message_id,
			'input_artifact_id', v_active.input_artifact_id,
			'queue_job_id', v_active.queue_job_id,
			'correlation_id', v_active.correlation_id,
			'stream_run_id', v_active.stream_run_id,
			'client_turn_id', v_active.client_turn_id,
			'execution_mode', v_active.execution_mode,
			'status', v_active.status
		);
	END IF;

	-- A brand-new inline session has no mutable history or prepared-prompt row.
	-- It may still carry freshly built trusted prepared inputs with null lineage.
	IF v_session_created AND (
		p_history_source <> 'admission_window'
		OR jsonb_array_length(p_artifact_history) <> 0
		OR cardinality(v_source_history_ids) <> 0
		OR p_prepared_prompt_id IS NOT NULL
	) THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_inline_session_input_mismatch';
	END IF;

	IF p_history_source = 'admission_window' THEN
		WITH newest_messages AS (
			SELECT messages.id, messages.role, messages.created_at
			FROM public.chat_messages messages
			WHERE messages.session_id = v_session.id
				AND messages.user_id = p_user_id
			ORDER BY messages.created_at DESC, messages.id DESC
			LIMIT p_history_limit
		), allowed_messages AS (
			SELECT *
			FROM newest_messages
			WHERE role IN ('user', 'assistant', 'system', 'tool')
		)
		SELECT COALESCE(
			array_agg(id ORDER BY created_at ASC, id ASC),
			ARRAY[]::uuid[]
		)
		INTO v_history_message_ids
		FROM allowed_messages;

		IF cardinality(v_history_message_ids) > 0 THEN
			PERFORM 1
			FROM public.chat_messages messages
			WHERE messages.id = ANY(v_history_message_ids)
				AND messages.session_id = v_session.id
				AND messages.user_id = p_user_id
			FOR SHARE;
		END IF;

		IF EXISTS (
			SELECT 1
			FROM unnest(v_source_history_ids) AS source_id(id)
			WHERE NOT (source_id.id = ANY(v_history_message_ids))
		) THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_history_lineage_mismatch';
		END IF;
	ELSIF cardinality(v_source_history_ids) <> 0 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_history_claims_message_lineage';
	END IF;

	IF p_prepared_prompt_id IS NULL THEN
		IF p_prepared_context_payload_sha256 IS NOT NULL
			OR p_prepared_surface_profile IS NOT NULL
			OR p_artifact_prepared->>'sourcePreparedPromptId' IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_unexpected_prepared_lineage';
		END IF;
	ELSIF p_history_source <> 'prepared_prompt' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_history_source_required';
	ELSE
		SELECT prepared.*
		INTO v_prepared
		FROM public.agentic_chat_prepared_prompts prepared
		WHERE prepared.id = p_prepared_prompt_id
		FOR UPDATE;

		IF NOT FOUND
			OR v_prepared.user_id IS DISTINCT FROM p_user_id
			OR (v_prepared.session_id IS NOT NULL
				AND v_prepared.session_id IS DISTINCT FROM v_session.id)
			OR v_prepared.context_type IS DISTINCT FROM p_context_type
			OR v_prepared.entity_id IS DISTINCT FROM p_entity_id
			OR v_prepared.project_id IS DISTINCT FROM p_project_id THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_scope_mismatch';
		END IF;
		IF v_prepared.consumed_at IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_already_consumed';
		END IF;
		IF v_prepared.expires_at <= v_now THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_expired';
		END IF;
		IF p_prepared_context_payload_sha256 IS NULL
			OR p_prepared_context_payload_sha256 !~ '^[0-9a-f]{64}$'
			OR v_prepared.context_payload_sha256 IS DISTINCT FROM p_prepared_context_payload_sha256
			OR p_prepared_surface_profile IS NULL
			OR btrim(p_prepared_surface_profile) = '' THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_integrity_mismatch';
		END IF;

		v_prepared_surface := v_prepared.prepared_surfaces->p_prepared_surface_profile;
		IF jsonb_typeof(COALESCE(v_prepared_surface, 'null'::jsonb)) <> 'object'
			OR v_prepared_surface->>'surface_profile' IS DISTINCT FROM p_prepared_surface_profile
			OR COALESCE(v_prepared_surface->>'system_prompt', '') = ''
			OR COALESCE(v_prepared_surface->>'system_prompt_sha256', '') !~ '^[0-9a-f]{64}$'
			OR v_prepared_surface->>'system_prompt_sha256' IS DISTINCT FROM encode(
				extensions.digest(convert_to(v_prepared_surface->>'system_prompt', 'UTF8'), 'sha256'),
				'hex'
			)
			OR jsonb_typeof(
				COALESCE(p_artifact_prepared->'sourcePreparedSurface', 'null'::jsonb)
			) <> 'object'
			OR p_artifact_prepared#>>'{sourcePreparedSurface,systemPromptSha256}'
				IS DISTINCT FROM v_prepared_surface->>'system_prompt_sha256'
			OR jsonb_typeof(
				COALESCE(
					p_artifact_prepared#>'{sourcePreparedSurface,promptSections}',
					'null'::jsonb
				)
			) <> 'array'
			OR COALESCE(v_prepared_surface->'sections', '[]'::jsonb)
				IS DISTINCT FROM p_artifact_prepared#>'{sourcePreparedSurface,promptSections}'
			OR jsonb_typeof(COALESCE(p_artifact_prepared->'systemPrompt', 'null'::jsonb))
				<> 'string'
			OR jsonb_typeof(COALESCE(p_artifact_prepared->'promptSections', 'null'::jsonb))
				<> 'array'
			OR (
				p_artifact_prepared->>'systemPrompt'
					IS DISTINCT FROM v_prepared_surface->>'system_prompt'
				AND strpos(
					p_artifact_prepared->>'systemPrompt',
					(v_prepared_surface->>'system_prompt') || E'\n\n'
				) <> 1
			)
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(
					COALESCE(v_prepared_surface->'sections', '[]'::jsonb)
				) WITH ORDINALITY AS source_section(value, position)
				WHERE p_artifact_prepared->'promptSections'->((source_section.position - 1)::integer)
					IS DISTINCT FROM source_section.value
			)
			OR p_artifact_prepared->>'sourcePreparedPromptId'
				IS DISTINCT FROM p_prepared_prompt_id::text
			OR p_artifact_prepared->>'surfaceProfile'
				IS DISTINCT FROM p_prepared_surface_profile
			OR p_artifact_prepared->'contextPayload'
				IS DISTINCT FROM v_prepared.context_payload
			OR COALESCE(p_artifact_prepared->'conversationSummary', 'null'::jsonb)
				IS DISTINCT FROM COALESCE(to_jsonb(v_prepared.conversation_summary), 'null'::jsonb) THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_copy_mismatch';
		END IF;

		UPDATE public.agentic_chat_prepared_prompts prepared
		SET consumed_at = v_now,
			updated_at = v_now
		WHERE prepared.id = v_prepared.id
			AND prepared.consumed_at IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_claim_lost';
		END IF;
	END IF;

	-- Insert the turn with nullable links first to break the intentional
	-- turn<->artifact relationship cycle; both links are filled below in the
	-- same transaction and the deferred scope trigger validates the result.
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
		execution_mode,
		request_payload,
		request_payload_version,
		transport_contract_version,
		transport_decision_id,
		correlation_id,
		execution_generation,
		history_cutoff_at,
		history_message_ids,
		stale_context_policy,
		prepared_prompt_id,
		prepared_prompt_hit,
		prepared_surface_profile
	) VALUES (
		p_turn_run_id,
		v_session.id,
		p_user_id,
		p_stream_run_id,
		p_client_turn_id,
		p_source,
		p_context_type,
		p_entity_id,
		p_project_id,
		p_gateway_enabled,
		p_request_message,
		'queued',
		p_prepared_prompt_id IS NOT NULL,
		v_now,
		p_request_hash,
		p_request_hash_version,
		'worker_realtime',
		p_request_payload,
		p_request_payload_version,
		p_transport_contract_version,
		p_transport_decision_id,
		p_correlation_id,
		0,
		v_now,
		v_history_message_ids,
		'fail_after_max_queue_residence',
		p_prepared_prompt_id,
		p_prepared_prompt_id IS NOT NULL,
		p_prepared_surface_profile
	);

	INSERT INTO public.chat_turn_input_artifacts (
		id,
		turn_run_id,
		session_id,
		user_id,
		source_prepared_prompt_id,
		artifact_version,
		history_source,
		history,
		prepared,
		content_hash,
		history_bytes,
		content_bytes,
		created_at,
		retain_until
	) VALUES (
		p_input_artifact_id,
		p_turn_run_id,
		v_session.id,
		p_user_id,
		p_prepared_prompt_id,
		'agentic_chat_input_v2',
		p_history_source,
		p_artifact_history,
		p_artifact_prepared,
		p_artifact_content_hash,
		p_artifact_history_bytes,
		p_artifact_content_bytes,
		v_now,
		v_now + interval '7 days'
	);

	v_message_metadata := v_message_metadata || jsonb_build_object(
		'idempotency_key', 'chat-turn:' || p_turn_run_id::text || ':user'
	);
	INSERT INTO public.chat_messages (
		id,
		session_id,
		user_id,
		role,
		content,
		metadata
	) VALUES (
		p_user_message_id,
		v_session.id,
		p_user_id,
		'user',
		p_user_message_content,
		v_message_metadata
	);

	v_queue_job_id := public.add_queue_job(
		p_user_id,
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', p_turn_run_id,
			'correlationId', p_correlation_id
		),
		1,
		v_now,
		'agentic-chat-turn:' || p_turn_run_id::text
	);

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = v_queue_job_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM p_user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text NOT IN ('pending', 'processing')
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || p_turn_run_id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM p_turn_run_id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM p_correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_queue_relationship_mismatch';
	END IF;

	UPDATE public.chat_turn_runs turns
	SET user_message_id = p_user_message_id,
		input_artifact_id = p_input_artifact_id,
		queue_job_id = v_queue_job_id,
		updated_at = v_now
	WHERE turns.id = p_turn_run_id
		AND turns.user_id = p_user_id
		AND turns.status = 'queued'
		AND turns.execution_generation = 0;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_turn_link_failed';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'newly_admitted',
		'execution_may_start', false,
		'turn_run_id', p_turn_run_id,
		'session_id', v_session.id,
		'session_created', v_session_created,
		'user_message_id', p_user_message_id,
		'input_artifact_id', p_input_artifact_id,
		'queue_job_id', v_queue_job_id,
		'correlation_id', p_correlation_id,
		'stream_run_id', p_stream_run_id,
		'client_turn_id', p_client_turn_id,
		'execution_mode', 'worker_realtime',
		'status', 'queued'
	);
END;
$function$;

-- Unchanged from prod (proacl {postgres=X/postgres, service_role=X/postgres}).
REVOKE ALL ON FUNCTION public.create_agentic_chat_turn_with_job(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer, text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_agentic_chat_turn_with_job(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer, text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.create_agentic_chat_turn_with_job(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer, text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_agentic_chat_turn_with_job(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer, text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean) TO service_role;

COMMIT;
