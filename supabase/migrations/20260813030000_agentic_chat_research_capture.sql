-- supabase/migrations/20260813030000_agentic_chat_research_capture.sql
-- Agentic Chat Worker, Phase 4 P4 S5: deterministic Research Log capture.
--
-- The evidence reader qualifies only durable chat_tool_executions rows. The
-- apply RPC owns one stable terminal effect and the Research Log mutation in a
-- single transaction, so optional capture can never strand turn finalization
-- behind a reserved/started effect.

BEGIN;

CREATE OR REPLACE FUNCTION public.agentic_chat_research_log_entries(p_content text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_line text;
	v_current text := NULL;
	v_entries text[] := ARRAY[]::text[];
BEGIN
	FOREACH v_line IN ARRAY string_to_array(COALESCE(p_content, ''), E'\n') LOOP
		IF left(v_line, 3) = '## ' THEN
			IF v_current IS NOT NULL THEN
				v_entries := array_append(v_entries, btrim(v_current));
			END IF;
			v_current := v_line;
		ELSIF v_current IS NOT NULL THEN
			v_current := v_current || E'\n' || v_line;
		END IF;
	END LOOP;
	IF v_current IS NOT NULL THEN
		v_entries := array_append(v_entries, btrim(v_current));
	END IF;
	RETURN v_entries;
END;
$function$;

REVOKE ALL ON FUNCTION public.agentic_chat_research_log_entries(text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_research_log_entries(text) TO service_role;

CREATE OR REPLACE FUNCTION public.agentic_chat_research_result_urls(
	p_value jsonb,
	p_depth integer DEFAULT 0
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_urls text[] := ARRAY[]::text[];
	v_item record;
	v_nested text[];
	v_text text;
BEGIN
	IF p_value IS NULL OR p_value = 'null'::jsonb OR p_depth > 3 THEN
		RETURN v_urls;
	END IF;
	CASE jsonb_typeof(p_value)
		WHEN 'string' THEN
			v_text := p_value #>> '{}';
			IF v_text ~* '^https?://' THEN
				RETURN ARRAY[left(v_text, 1024)];
			END IF;
		WHEN 'array' THEN
			FOR v_item IN
				SELECT items.value
				FROM jsonb_array_elements(p_value) WITH ORDINALITY items(value, ordinal)
				ORDER BY items.ordinal
			LOOP
				v_nested := public.agentic_chat_research_result_urls(v_item.value, p_depth + 1);
				v_urls := v_urls || v_nested;
				IF cardinality(v_urls) >= 20 THEN RETURN v_urls[1:20]; END IF;
			END LOOP;
		WHEN 'object' THEN
			FOR v_item IN SELECT entries.key, entries.value FROM jsonb_each(p_value) entries LOOP
				IF jsonb_typeof(v_item.value) = 'string'
					AND v_item.key !~* '(url|link|href)' THEN
					CONTINUE;
				END IF;
				v_nested := public.agentic_chat_research_result_urls(v_item.value, p_depth + 1);
				v_urls := v_urls || v_nested;
				IF cardinality(v_urls) >= 20 THEN RETURN v_urls[1:20]; END IF;
			END LOOP;
		ELSE NULL;
	END CASE;
	RETURN v_urls;
END;
$function$;

REVOKE ALL ON FUNCTION public.agentic_chat_research_result_urls(jsonb, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_research_result_urls(jsonb, integer)
	TO service_role;

CREATE OR REPLACE FUNCTION public.load_agentic_chat_research_capture_evidence(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_calls jsonb := '[]'::jsonb;
	v_call_count integer := 0;
	v_captured_at timestamptz;
	v_outcome text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_invalid_identity';
	END IF;

	SELECT turns.* INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode IS DISTINCT FROM 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_scope_mismatch';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled')
		OR v_turn.terminalized_at IS NOT NULL THEN
		v_outcome := 'already_terminal';
	ELSIF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		v_outcome := 'stale_generation';
	ELSIF v_turn.cancel_requested_at IS NOT NULL THEN
		v_outcome := 'cancel_requested';
	ELSE
		IF v_turn.status IS DISTINCT FROM 'running' OR v_turn.execution_started_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_research_capture_not_started';
		END IF;
		SELECT jobs.* INTO v_job
		FROM public.queue_jobs jobs
		WHERE jobs.id = p_queue_job_id
		FOR UPDATE;
		IF NOT FOUND OR v_job.user_id IS DISTINCT FROM v_turn.user_id
			OR v_job.job_type::text IS DISTINCT FROM 'agentic_chat_turn'
			OR v_job.status::text IS DISTINCT FROM 'processing'
			OR v_job.processing_token IS DISTINCT FROM p_processing_token
			OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
			OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
			RAISE EXCEPTION 'agentic_chat_research_capture_ownership_lost';
		END IF;

		SELECT
			COALESCE(
				jsonb_agg(
					jsonb_build_object(
						'name', executions.tool_name,
						'args', jsonb_strip_nulls(jsonb_build_object(
							'query', CASE WHEN jsonb_typeof(executions.arguments->'query') = 'string'
								THEN left(executions.arguments->>'query', 1024) ELSE NULL END,
							'q', CASE WHEN jsonb_typeof(executions.arguments->'q') = 'string'
								THEN left(executions.arguments->>'q', 1024) ELSE NULL END,
							'url', CASE WHEN jsonb_typeof(executions.arguments->'url') = 'string'
								THEN left(executions.arguments->>'url', 1024) ELSE NULL END
						)),
						'result', CASE WHEN executions.result IS NULL THEN NULL ELSE
							jsonb_strip_nulls(jsonb_build_object(
								'answer', CASE WHEN jsonb_typeof(executions.result->'answer') = 'string'
									THEN left(executions.result->>'answer', 1024) ELSE NULL END,
								'urls', to_jsonb(public.agentic_chat_research_result_urls(
									executions.result, 0
								))
							))
						END
					)
					ORDER BY executions.sequence_index NULLS LAST, executions.created_at, executions.id
				),
				'[]'::jsonb
			),
			count(*)::integer,
			max(executions.created_at)
		INTO v_calls, v_call_count, v_captured_at
		FROM public.chat_tool_executions executions
		WHERE executions.turn_run_id = v_turn.id
			AND lower(btrim(executions.tool_name)) IN (
				'web_search', 'web_visit', 'util.web.search', 'util.web.visit'
			);
		v_outcome := CASE WHEN v_call_count >= 2 THEN 'eligible' ELSE 'not_eligible' END;
	END IF;

	RETURN jsonb_build_object(
		'outcome', v_outcome,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'execution_generation', v_turn.execution_generation,
		'stream_run_id', v_turn.stream_run_id,
		'captured_at', v_captured_at,
		'calls', v_calls
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.load_agentic_chat_research_capture_evidence(
	uuid, uuid, uuid, uuid, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_agentic_chat_research_capture_evidence(
	uuid, uuid, uuid, uuid, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_agentic_chat_research_capture(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_effect_id uuid,
	p_canonical_argument_hash text,
	p_project_id uuid,
	p_stream_run_id text,
	p_rendered_entry text,
	p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_effect public.chat_turn_effects%ROWTYPE;
	v_actor_id uuid;
	v_document_id uuid;
	v_archive_id uuid;
	v_document_content text;
	v_archive_content text;
	v_entries text[];
	v_archive_entries text[];
	v_rotated_entries text[] := ARRAY[]::text[];
	v_keep integer;
	v_rotated integer := 0;
	v_live_content text;
	v_next_archive_content text;
	v_status text;
	v_failure_detail text;
	v_failure_state text;
	-- The effect trigger stamps updated_at with transaction_timestamp(). Use the
	-- same clock for the reserved -> started transition inside this one RPC.
	v_now timestamptz := transaction_timestamp();
	v_downstream_receipt jsonb;
	v_research_call_count integer;
	v_log_header constant text := E'# Research Log\n\nResearch captured automatically from chat turns, newest first. Each entry records what was\nsearched, which sources were read, and what went unresolved.';
	v_archive_header constant text := E'# Research Log (Archive)\n\nOlder entries rotated out of Research Log, newest first.';
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL OR p_execution_generation IS NULL
		OR p_execution_generation < 1 OR p_effect_id IS NULL OR p_project_id IS NULL
		OR p_canonical_argument_hash IS NULL
		OR p_canonical_argument_hash !~ '^[0-9a-f]{64}$'
		OR p_stream_run_id IS NULL OR p_stream_run_id IS DISTINCT FROM btrim(p_stream_run_id)
		OR p_stream_run_id = '' OR length(p_stream_run_id) > 256
		OR p_rendered_entry IS NULL OR p_rendered_entry IS DISTINCT FROM btrim(p_rendered_entry)
		OR left(p_rendered_entry, 3) <> '## ' OR char_length(p_rendered_entry) > 600
		OR octet_length(p_rendered_entry) > 4096
		OR position('<!-- run:' || p_stream_run_id || ' -->' IN p_rendered_entry) = 0
		OR p_description IS NULL OR p_description IS DISTINCT FROM btrim(p_description)
		OR p_description = '' OR char_length(p_description) > 180 THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_invalid_payload';
	END IF;

	-- Duplicate-first resolution permits an exact lost-response replay after
	-- terminal finalization or ownership replacement.
	SELECT effects.* INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id;
	IF FOUND THEN
		IF v_effect.turn_run_id IS DISTINCT FROM p_turn_run_id
			OR v_effect.user_id IS DISTINCT FROM p_user_id
			OR v_effect.execution_generation IS DISTINCT FROM p_execution_generation
			OR v_effect.tool_name IS DISTINCT FROM 'agentic_chat_research_capture'
			OR v_effect.operation_name IS DISTINCT FROM 'agentic_chat.research_capture'
			OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash
			OR v_effect.downstream_idempotency_supported IS DISTINCT FROM true
			OR v_effect.state NOT IN ('succeeded', 'failed')
			OR v_effect.downstream_receipt IS NULL
			OR v_effect.downstream_receipt->>'queueJobId' IS DISTINCT FROM p_queue_job_id::text
			OR v_effect.downstream_receipt->>'projectId' IS DISTINCT FROM p_project_id::text
			OR v_effect.downstream_receipt->>'streamRunId' IS DISTINCT FROM p_stream_run_id THEN
			RAISE EXCEPTION 'agentic_chat_research_capture_idempotency_conflict'
				USING ERRCODE = '23505';
		END IF;
		RETURN jsonb_build_object(
			'outcome', v_effect.downstream_receipt->>'status',
			'effect_id', v_effect.id,
			'turn_run_id', v_effect.turn_run_id,
			'queue_job_id', v_effect.downstream_receipt->>'queueJobId',
			'session_id', v_effect.session_id,
			'user_id', v_effect.user_id,
			'execution_generation', v_effect.execution_generation,
			'project_id', p_project_id,
			'stream_run_id', p_stream_run_id,
			'canonical_argument_hash', v_effect.canonical_argument_hash,
			'document_id', v_effect.downstream_receipt->>'documentId',
			'rotated', COALESCE((v_effect.downstream_receipt->>'rotated')::integer, 0),
			'failure_code', v_effect.failure_code
		);
	END IF;

	-- Preserve the established turn -> effect -> queue lock order.
	SELECT turns.* INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_turn_not_found';
	END IF;

	SELECT effects.* INTO v_effect
	FROM public.chat_turn_effects effects
	WHERE effects.id = p_effect_id
	FOR UPDATE;
	IF FOUND THEN
		IF v_effect.turn_run_id IS DISTINCT FROM p_turn_run_id
			OR v_effect.canonical_argument_hash IS DISTINCT FROM p_canonical_argument_hash THEN
			RAISE EXCEPTION 'agentic_chat_research_capture_idempotency_conflict'
				USING ERRCODE = '23505';
		END IF;
		RAISE EXCEPTION 'agentic_chat_research_capture_nonterminal_effect_conflict';
	END IF;

	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode IS DISTINCT FROM 'worker_realtime'
		OR v_turn.project_id IS DISTINCT FROM p_project_id
		OR v_turn.stream_run_id IS DISTINCT FROM p_stream_run_id THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_scope_mismatch';
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled')
		OR v_turn.terminalized_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_already_terminal';
	END IF;
	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_stale_generation';
	END IF;
	IF v_turn.status IS DISTINCT FROM 'running' OR v_turn.execution_started_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_not_started';
	END IF;
	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_cancel_requested';
	END IF;

	SELECT jobs.* INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;
	IF NOT FOUND OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text IS DISTINCT FROM 'agentic_chat_turn'
		OR v_job.status::text IS DISTINCT FROM 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_ownership_lost';
	END IF;
	SELECT count(*)::integer INTO v_research_call_count
	FROM public.chat_tool_executions executions
	WHERE executions.turn_run_id = v_turn.id
		AND lower(btrim(executions.tool_name)) IN (
			'web_search', 'web_visit', 'util.web.search', 'util.web.visit'
		);
	IF v_research_call_count < 2 THEN
		RAISE EXCEPTION 'agentic_chat_research_capture_not_eligible';
	END IF;

	INSERT INTO public.chat_turn_effects (
		id, turn_run_id, session_id, user_id, execution_generation,
		tool_name, operation_name, canonical_argument_hash, provider_tool_call_id,
		downstream_idempotency_supported, state, reserved_at, created_at, updated_at
	) VALUES (
		p_effect_id, v_turn.id, v_turn.session_id, v_turn.user_id, p_execution_generation,
		'agentic_chat_research_capture', 'agentic_chat.research_capture',
		p_canonical_argument_hash, NULL, true, 'reserved', v_now, v_now, v_now
	);
	UPDATE public.chat_turn_effects effects
	SET state = 'started', started_at = v_now
	WHERE effects.id = p_effect_id AND effects.state = 'reserved'
	RETURNING effects.* INTO v_effect;
	UPDATE public.chat_turn_runs turns
	SET
		mutation_reserved_at = COALESCE(turns.mutation_reserved_at, v_now),
		irreversible_boundary_at = COALESCE(turns.irreversible_boundary_at, v_now)
	WHERE turns.id = v_turn.id;

	BEGIN
		SELECT actors.id INTO v_actor_id
		FROM public.onto_actors actors
		WHERE actors.user_id = p_user_id;
		IF v_actor_id IS NULL
			OR NOT public.actor_has_project_member_access(v_actor_id, p_project_id, 'write') THEN
			RAISE EXCEPTION 'agentic_chat_research_capture_project_access_denied'
				USING ERRCODE = '42501';
		END IF;

		-- Serialize legacy-compatible live/archive rotation for a project.
		PERFORM pg_advisory_xact_lock(hashtextextended(
			'agentic-chat-research-log:' || p_project_id::text,
			0
		));
		SELECT documents.id, documents.content
		INTO v_document_id, v_document_content
		FROM public.onto_documents documents
		WHERE documents.project_id = p_project_id
			AND documents.type_key = 'document.knowledge.research'
			AND documents.title = 'Research Log'
			AND documents.deleted_at IS NULL
		ORDER BY documents.created_at, documents.id
		LIMIT 1
		FOR UPDATE;

		IF v_document_id IS NOT NULL
			AND position('<!-- run:' || p_stream_run_id || ' -->' IN COALESCE(v_document_content, '')) > 0 THEN
			v_status := 'duplicate';
			v_rotated := 0;
		ELSE
			v_entries := array_prepend(
				p_rendered_entry,
				public.agentic_chat_research_log_entries(v_document_content)
			);
			v_keep := LEAST(cardinality(v_entries), 20);
			WHILE v_keep > 1 AND octet_length(
				v_log_header || E'\n' || array_to_string(v_entries[1:v_keep], E'\n\n')
			) > 24000 LOOP
				v_keep := v_keep - 1;
			END LOOP;
			v_live_content := v_log_header || E'\n' || array_to_string(v_entries[1:v_keep], E'\n\n');
			IF v_keep < cardinality(v_entries) THEN
				v_rotated_entries := v_entries[(v_keep + 1):cardinality(v_entries)];
				v_rotated := cardinality(v_rotated_entries);
			END IF;

			IF v_document_id IS NULL THEN
				INSERT INTO public.onto_documents (
					project_id, title, type_key, state_key, content, description, props, created_by
				) VALUES (
					p_project_id, 'Research Log', 'document.knowledge.research', 'draft',
					v_live_content, p_description, jsonb_build_object('body_markdown', v_live_content),
					v_actor_id
				)
				RETURNING id INTO v_document_id;
			ELSE
				UPDATE public.onto_documents documents
				SET content = v_live_content,
					description = p_description,
					props = jsonb_build_object('body_markdown', v_live_content)
				WHERE documents.id = v_document_id;
			END IF;

			IF v_rotated > 0 THEN
				SELECT documents.id, documents.content
				INTO v_archive_id, v_archive_content
				FROM public.onto_documents documents
				WHERE documents.project_id = p_project_id
					AND documents.type_key = 'document.knowledge.research'
					AND documents.title = 'Research Log (Archive)'
					AND documents.deleted_at IS NULL
				ORDER BY documents.created_at, documents.id
				LIMIT 1
				FOR UPDATE;
				v_archive_entries := public.agentic_chat_research_log_entries(v_archive_content);
				v_next_archive_content := v_archive_header || E'\n' || array_to_string(
					v_rotated_entries || v_archive_entries,
					E'\n\n'
				);
				IF v_archive_id IS NULL THEN
					INSERT INTO public.onto_documents (
						project_id, title, type_key, state_key, content, description, props, created_by
					) VALUES (
						p_project_id, 'Research Log (Archive)', 'document.knowledge.research', 'draft',
						v_next_archive_content,
						'Older auto-captured research entries rotated out of the Research Log.',
						jsonb_build_object('body_markdown', v_next_archive_content), v_actor_id
					)
					RETURNING id INTO v_archive_id;
				ELSE
					UPDATE public.onto_documents documents
					SET content = v_next_archive_content,
						props = jsonb_build_object('body_markdown', v_next_archive_content)
					WHERE documents.id = v_archive_id;
				END IF;
			END IF;
			v_status := 'appended';
		END IF;

		v_downstream_receipt := jsonb_build_object(
			'status', v_status,
			'documentId', v_document_id,
			'queueJobId', p_queue_job_id,
			'projectId', p_project_id,
			'streamRunId', p_stream_run_id,
			'rotated', v_rotated
		);
		UPDATE public.chat_turn_effects effects
		SET state = 'succeeded', downstream_receipt = v_downstream_receipt,
			failure_code = NULL, finished_at = clock_timestamp()
		WHERE effects.id = p_effect_id AND effects.state = 'started';
	EXCEPTION WHEN OTHERS THEN
		GET STACKED DIAGNOSTICS v_failure_detail = MESSAGE_TEXT, v_failure_state = RETURNED_SQLSTATE;
		v_status := 'failed';
		v_rotated := 0;
		v_document_id := NULL;
		v_downstream_receipt := jsonb_build_object(
			'status', 'failed',
			'documentId', NULL,
			'queueJobId', p_queue_job_id,
			'projectId', p_project_id,
			'streamRunId', p_stream_run_id,
			'rotated', 0,
			'errorCode', v_failure_state,
			'error', left(v_failure_detail, 500)
		);
		UPDATE public.chat_turn_effects effects
		SET state = 'failed', downstream_receipt = v_downstream_receipt,
			failure_code = 'research_capture_failed', finished_at = clock_timestamp()
		WHERE effects.id = p_effect_id AND effects.state = 'started';
	END;

	RETURN jsonb_build_object(
		'outcome', v_status,
		'effect_id', p_effect_id,
		'turn_run_id', p_turn_run_id,
		'queue_job_id', p_queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'execution_generation', v_turn.execution_generation,
		'project_id', p_project_id,
		'stream_run_id', p_stream_run_id,
		'canonical_argument_hash', p_canonical_argument_hash,
		'document_id', v_document_id,
		'rotated', v_rotated,
		'failure_code', CASE WHEN v_status = 'failed' THEN 'research_capture_failed' ELSE NULL END
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_agentic_chat_research_capture(
	uuid, uuid, uuid, uuid, integer, uuid, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_agentic_chat_research_capture(
	uuid, uuid, uuid, uuid, integer, uuid, text, uuid, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.load_agentic_chat_research_capture_evidence(
	uuid, uuid, uuid, uuid, integer
) IS 'Service-only generation-fenced terminal research evidence loaded exclusively from durable tool execution rows.';
COMMENT ON FUNCTION public.apply_agentic_chat_research_capture(
	uuid, uuid, uuid, uuid, integer, uuid, text, uuid, text, text, text
) IS 'Service-only replay-safe Research Log append whose stable effect and document mutation commit atomically to a terminal state.';

COMMIT;
