-- Classify logical provider passes independently from physical retries and
-- reconcile chat_turn_runs.llm_pass_count from the durable observation ledger.

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc AS procedures
	WHERE procedures.oid =
		'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;

	IF position('''pass_role''' IN v_body) > 0 THEN
		RAISE NOTICE 'agentic_chat_provider_pass_telemetry payload extension already applied';
		RETURN;
	END IF;

	v_next := replace(
		v_body,
		$old$		'round', 'logical_provider_round', 'route_id'$old$,
		$new$		'round', 'logical_provider_round', 'pass_role', 'provider_attempt', 'attempt_kind', 'route_id'$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_pass_telemetry_allowlist_unexpected_body';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	IF p_payload ? 'duration_ms' AND ($old$,
		$new$	IF p_payload ? 'pass_role' AND (
		p_event_type NOT IN ('provider_attempt_started', 'provider_attempt_ended')
		OR jsonb_typeof(p_payload->'pass_role') <> 'string'
		OR p_payload->>'pass_role' NOT IN (
			'acting', 'contract_review', 'mutation_review', 'repair', 'final_response'
		)
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_pass_role';
	END IF;
	IF p_payload ? 'provider_attempt' AND (
		p_event_type NOT IN ('provider_attempt_started', 'provider_attempt_ended')
		OR jsonb_typeof(p_payload->'provider_attempt') <> 'number'
		OR COALESCE((p_payload->>'provider_attempt') !~ '^[1-9][0-9]*$', true)
		OR (p_payload->>'provider_attempt')::numeric > 100
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_provider_attempt';
	END IF;
	IF p_payload ? 'attempt_kind' AND (
		p_event_type NOT IN ('provider_attempt_started', 'provider_attempt_ended')
		OR jsonb_typeof(p_payload->'attempt_kind') <> 'string'
		OR p_payload->>'attempt_kind' NOT IN ('primary', 'retry')
		OR (
			p_payload ? 'provider_attempt'
			AND (p_payload->>'provider_attempt')::numeric > 1
			AND p_payload->>'attempt_kind' <> 'retry'
		)
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_attempt_kind';
	END IF;
	IF p_payload ? 'duration_ms' AND ($new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_pass_telemetry_validation_missing';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.persist_agentic_chat_execution_observation(p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_observation_key text, p_phase text, p_event_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_provider_attempt_observation(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_observation_key text,
	p_phase text,
	p_event_type text,
	p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_receipt jsonb;
	v_pass_count integer;
BEGIN
	IF p_phase <> 'provider'
		OR p_event_type NOT IN ('provider_attempt_started', 'provider_attempt_ended')
		OR p_payload IS NULL
		OR jsonb_typeof(p_payload) <> 'object'
		OR NOT (p_payload ?& ARRAY[
			'logical_provider_round', 'pass_role', 'provider_attempt', 'attempt_kind'
		]) THEN
		RAISE EXCEPTION 'agentic_chat_provider_attempt_observation_invalid_classification';
	END IF;

	v_receipt := public.persist_agentic_chat_execution_observation(
		p_turn_run_id,
		p_user_id,
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		p_observation_key,
		p_phase,
		p_event_type,
		p_payload
	);

	IF v_receipt->>'outcome' = 'persisted'
		AND p_event_type = 'provider_attempt_ended'
		AND p_payload->>'status' = 'success' THEN
		SELECT count(*)::integer
		INTO v_pass_count
		FROM (
			SELECT
				observations.payload->>'logical_provider_round',
				observations.payload->>'pass_role'
			FROM public.agentic_chat_execution_observations observations
			WHERE observations.turn_run_id = p_turn_run_id
				AND observations.execution_generation = p_execution_generation
				AND observations.phase = 'provider'
				AND observations.event_type = 'provider_attempt_ended'
				AND observations.payload->>'status' = 'success'
				AND observations.payload ?& ARRAY['logical_provider_round', 'pass_role']
			GROUP BY
				observations.payload->>'logical_provider_round',
				observations.payload->>'pass_role'
		) classified_passes;

		UPDATE public.chat_turn_runs turns
		SET llm_pass_count = v_pass_count
		WHERE turns.id = p_turn_run_id
			AND turns.status = 'running'
			AND turns.execution_generation = p_execution_generation;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_provider_pass_count_compare_and_set_lost';
		END IF;
	END IF;

	RETURN v_receipt;
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_agentic_chat_provider_attempt_observation(
	uuid, uuid, uuid, uuid, integer, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_provider_attempt_observation(
	uuid, uuid, uuid, uuid, integer, text, text, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.persist_agentic_chat_provider_attempt_observation(
	uuid, uuid, uuid, uuid, integer, text, text, text, jsonb
) IS
'Persists classified provider-attempt evidence and reconciles llm_pass_count from distinct successful logical-round/pass-role pairs without counting physical retries as new logical passes.';
