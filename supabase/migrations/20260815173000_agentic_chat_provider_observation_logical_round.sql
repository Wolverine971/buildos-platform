-- supabase/migrations/20260815173000_agentic_chat_provider_observation_logical_round.sql
-- Keep the durable provider-attempt ledger aligned with the worker payload.
-- logical_provider_round is a bounded integer identity/diagnostic field; it
-- contains no prompt, response, tool arguments, or other user content.

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

	v_next := replace(
		v_body,
		$old$		'round', 'route_id', 'model_requested', 'model_used', 'provider',$old$,
		$new$		'round', 'logical_provider_round', 'route_id', 'model_requested', 'model_used', 'provider',$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_observation_logical_round_unexpected_body';
	END IF;
	v_body := v_next;

	-- Keep the new diagnostic bounded and structurally typed at the database
	-- boundary, matching the worker's monotonically increasing provider round.
	v_next := replace(
		v_body,
		$old$	IF p_payload ? 'duration_ms' AND ($old$,
		$new$	IF p_payload ? 'logical_provider_round' AND (
		jsonb_typeof(p_payload->'logical_provider_round') <> 'number'
		OR COALESCE((p_payload->>'logical_provider_round') !~ '^[1-9][0-9]*$', true)
		OR (p_payload->>'logical_provider_round')::numeric < 1
		OR (p_payload->>'logical_provider_round')::numeric > 1000
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_logical_round';
	END IF;
	IF p_payload ? 'duration_ms' AND ($new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_observation_logical_round_missing_validation';
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
