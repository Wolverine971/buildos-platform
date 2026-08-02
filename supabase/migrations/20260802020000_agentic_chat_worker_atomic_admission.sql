-- supabase/migrations/20260802020000_agentic_chat_worker_atomic_admission.sql
-- Agentic Chat Worker migration, Phase 2B Slice 3A: atomic worker admission.
--
-- This package adds one service-only transaction boundary that:
--   * resolves (user_id, client_turn_id) duplicates before capacity checks;
--   * shares the legacy admission per-user advisory lock;
--   * enforces the internal max_running=2 / max_queued=20 hard caps;
--   * resolves or creates the session only after the capacity gate;
--   * freezes the selected history lineage and trusted prepared input;
--   * creates the queued turn, immutable input artifact, user message, and
--     stable-dedup queue job atomically.
--
-- It deliberately adds no queue consumer, claim, provider/model execution,
-- cancellation, finalization, or retry/recovery behavior. The worker rollout
-- flag must remain disabled.
--
-- Deploy order:
--   1. Deploy the compatible legacy session-service change that adopts a
--      canonical daily-brief winner after SQLSTATE 23505.
--   2. Apply this migration while worker routing remains disabled.
--   3. Regenerate database types; do not call this RPC from the application yet.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.chat_sessions sessions
		WHERE sessions.context_type = 'daily_brief'
			AND sessions.status = 'active'
			AND sessions.entity_id IS NOT NULL
		GROUP BY sessions.user_id, sessions.entity_id
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION
			'agentic_chat_worker_admission_preflight_failed: duplicate active daily_brief session keys';
	END IF;
END;
$$;

-- Legacy session creation does not yet participate in the admission advisory
-- lock. This database key is therefore the final cross-mode race guard for the
-- one canonical active daily-brief session per user/brief.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_sessions_active_daily_brief_context
	ON public.chat_sessions (user_id, entity_id)
	WHERE context_type = 'daily_brief'
		AND status = 'active'
		AND entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_agentic_chat_turn_with_job(
	p_user_id uuid,
	p_session_id uuid,
	p_turn_run_id uuid,
	p_user_message_id uuid,
	p_input_artifact_id uuid,
	p_stream_run_id text,
	p_client_turn_id text,
	p_request_hash text,
	p_request_hash_version text,
	p_transport_contract_version text,
	p_transport_decision_id uuid,
	p_correlation_id uuid,
	p_context_type text,
	p_entity_id uuid,
	p_project_id uuid,
	p_source text,
	p_gateway_enabled boolean,
	p_request_message text,
	p_request_payload jsonb,
	p_request_payload_version text,
	p_user_message_content text,
	p_user_message_metadata jsonb,
	p_history_limit integer,
	p_history_source text,
	p_artifact_history jsonb,
	p_artifact_prepared jsonb,
	p_artifact_content_hash text,
	p_artifact_history_bytes integer,
	p_artifact_content_bytes integer,
	p_prepared_prompt_id uuid,
	p_prepared_context_payload_sha256 text,
	p_prepared_surface_profile text,
	p_session_agent_metadata jsonb,
	p_capacity_available boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
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
		AND turns.status IN ('queued', 'running');

	IF NOT p_capacity_available
		OR v_running_count >= 2
		OR v_queued_count >= 20 THEN
		RETURN jsonb_build_object(
			'outcome', 'capacity_exceeded',
			'execution_may_start', false,
			'capacity_reason', CASE
				WHEN NOT p_capacity_available THEN 'pressure_closed'
				WHEN v_running_count >= 2 THEN 'max_running'
				ELSE 'max_queued'
			END,
			'retry_after_seconds', 2,
			'running_count', v_running_count,
			'queued_count', v_queued_count
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
			OR v_prepared_surface->>'system_prompt' IS DISTINCT FROM p_artifact_prepared->>'systemPrompt'
			OR COALESCE(v_prepared_surface->'sections', '[]'::jsonb)
				IS DISTINCT FROM p_artifact_prepared->'promptSections'
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

REVOKE ALL ON FUNCTION public.create_agentic_chat_turn_with_job(
	uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid,
	text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer,
	text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_agentic_chat_turn_with_job(
	uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid,
	text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer,
	text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean
) TO service_role;

COMMENT ON FUNCTION public.create_agentic_chat_turn_with_job(
	uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid,
	text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer,
	text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean
) IS
	'Service-only duplicate-first worker admission. Session, frozen input, user message, queued turn, and stable-dedup queue job commit or roll back together.';
