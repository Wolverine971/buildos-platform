-- Agentic Chat Worker: persist a semantic context shift before its public
-- stream event can advertise the new scope. The write is generation-fenced,
-- service-only, and idempotent for a replay of the same turn generation.

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_session_handoff(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_context_type text,
	p_entity_id uuid,
	p_project_id uuid
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
	v_session public.chat_sessions%ROWTYPE;
	v_existing_handoff jsonb;
	v_handoff jsonb;
	v_shifted_at timestamptz;
	v_outcome text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF p_turn_run_id IS NULL
		OR p_user_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR p_context_type IS NULL
		OR p_context_type NOT IN (
			'global', 'project', 'calendar', 'daily_brief', 'general',
			'project_create', 'daily_brief_update', 'ontology'
		) THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_invalid_input';
	END IF;
	IF p_context_type = 'project' AND (
		p_entity_id IS NULL
		OR p_project_id IS NULL
		OR p_entity_id IS DISTINCT FROM p_project_id
	) THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_invalid_project_scope';
	END IF;

	-- Preserve the worker control-plane lock order: turn, queue job, session.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_relationship_mismatch';
	END IF;
	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'turn_run_id', v_turn.id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation
		);
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	-- Immutable job/turn relationships must still agree on an exact replay, but
	-- processing ownership is checked only when a new handoff will be written.
	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_relationship_mismatch';
	END IF;

	SELECT sessions.*
	INTO v_session
	FROM public.chat_sessions sessions
	WHERE sessions.id = v_turn.session_id
		AND sessions.user_id = v_turn.user_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_session_not_found';
	END IF;

	v_existing_handoff := COALESCE(v_session.agent_metadata, '{}'::jsonb)
		-> 'fastchat_last_context_shift';
	IF jsonb_typeof(v_existing_handoff) = 'object'
		AND v_existing_handoff->>'turn_run_id' = p_turn_run_id::text
		AND v_existing_handoff->>'execution_generation' = p_execution_generation::text THEN
		IF v_session.context_type IS DISTINCT FROM p_context_type
			OR v_session.entity_id IS DISTINCT FROM p_entity_id
			OR v_existing_handoff->>'context_type' IS DISTINCT FROM p_context_type
			OR NULLIF(v_existing_handoff->>'entity_id', '') IS DISTINCT FROM p_entity_id::text
			OR NULLIF(v_existing_handoff->>'project_id', '') IS DISTINCT FROM p_project_id::text THEN
			RAISE EXCEPTION 'agentic_chat_session_handoff_replay_mismatch';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_applied',
			'turn_run_id', v_turn.id,
			'session_id', v_session.id,
			'user_id', v_session.user_id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'context_type', v_session.context_type,
			'entity_id', v_session.entity_id,
			'project_id', p_project_id,
			'shifted_at', v_existing_handoff->>'shifted_at'
		);
	END IF;

	IF v_turn.status <> 'running' OR v_turn.cancel_requested_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_invalid_predecessor';
	END IF;

	IF v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
	THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_ownership_lost';
	END IF;

	IF p_project_id IS NOT NULL AND NOT EXISTS (
		SELECT 1
		FROM public.onto_project_members members
		JOIN public.onto_actors actors ON actors.id = members.actor_id
		WHERE members.project_id = p_project_id
			AND members.removed_at IS NULL
			AND actors.user_id = p_user_id
	) THEN
		RAISE EXCEPTION 'agentic_chat_session_handoff_project_access_denied'
			USING ERRCODE = '42501';
	END IF;

	v_shifted_at := clock_timestamp();
	v_handoff := jsonb_build_object(
		'context_type', p_context_type,
		'entity_id', p_entity_id,
		'project_id', p_project_id,
		'shifted_at', v_shifted_at,
		'turn_run_id', p_turn_run_id,
		'execution_generation', p_execution_generation
	);

	UPDATE public.chat_sessions sessions
	SET context_type = p_context_type,
		entity_id = p_entity_id,
		agent_metadata = jsonb_set(
			COALESCE(sessions.agent_metadata, '{}'::jsonb),
			'{fastchat_last_context_shift}',
			v_handoff,
			true
		),
		updated_at = v_shifted_at
	WHERE sessions.id = v_session.id;

	v_outcome := 'persisted';
	RETURN jsonb_build_object(
		'outcome', v_outcome,
		'turn_run_id', v_turn.id,
		'session_id', v_session.id,
		'user_id', v_session.user_id,
		'queue_job_id', v_turn.queue_job_id,
		'execution_generation', v_turn.execution_generation,
		'context_type', p_context_type,
		'entity_id', p_entity_id,
		'project_id', p_project_id,
		'shifted_at', v_shifted_at
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_session_handoff(
	uuid, uuid, uuid, uuid, integer, text, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_agentic_chat_session_handoff(
	uuid, uuid, uuid, uuid, integer, text, uuid, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.persist_agentic_chat_session_handoff(
	uuid, uuid, uuid, uuid, integer, text, uuid, uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.persist_agentic_chat_session_handoff(
	uuid, uuid, uuid, uuid, integer, text, uuid, uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_session_handoff(
	uuid, uuid, uuid, uuid, integer, text, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_session_handoff(
	uuid, uuid, uuid, uuid, integer, text, uuid, uuid
) IS
'Generation-fenced service-only worker handoff. Idempotently persists chat session scope and the fastchat context-shift hint before the public shift event is emitted.';

COMMIT;
