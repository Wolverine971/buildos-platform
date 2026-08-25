-- Queue-first Agentic Chat admission.
--
-- Normal worker/provider/publisher pressure is an operational scaling signal,
-- not a reason to lose a user turn before it reaches the durable queue. Keep a
-- much higher per-user pending ceiling solely as an emergency database/abuse
-- guard. Frozen input artifacts remain valid for seven days, so execution and
-- safe pre-start recovery use artifact expiry instead of the former five-minute
-- queue-residence cutoff.

BEGIN;

DO $migration$
DECLARE
	v_definition text;
	v_patched text;
	v_needle text := E'IF NOT p_capacity_available\n\t\tOR v_running_count >= 2\n\t\tOR v_queued_count >= 20 THEN\n\t\tRETURN jsonb_build_object(\n\t\t\t''outcome'', ''capacity_exceeded'',\n\t\t\t''execution_may_start'', false,\n\t\t\t''capacity_reason'', CASE\n\t\t\t\tWHEN NOT p_capacity_available THEN ''pressure_closed''\n\t\t\t\tWHEN v_running_count >= 2 THEN ''max_running''\n\t\t\t\tELSE ''max_queued''\n\t\t\tEND,\n\t\t\t''retry_after_seconds'', 2,\n\t\t\t''running_count'', v_running_count,\n\t\t\t''queued_count'', v_queued_count\n\t\t);\n\tEND IF;';
	v_replacement text := E'IF v_queued_count >= 100 THEN\n\t\tRETURN jsonb_build_object(\n\t\t\t''outcome'', ''capacity_exceeded'',\n\t\t\t''execution_may_start'', false,\n\t\t\t''capacity_reason'', ''max_queued'',\n\t\t\t''retry_after_seconds'', 30,\n\t\t\t''running_count'', v_running_count,\n\t\t\t''queued_count'', v_queued_count\n\t\t);\n\tEND IF;';
BEGIN
	SELECT pg_get_functiondef(procedures.oid)
	INTO STRICT v_definition
	FROM pg_catalog.pg_proc procedures
	JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = procedures.pronamespace
	WHERE namespaces.nspname = 'public'
		AND procedures.proname = 'create_agentic_chat_turn_with_job'
		AND procedures.pronargs = 34;

	IF position(v_needle IN v_definition) = 0
		OR position(v_replacement IN v_definition) > 0 THEN
		RAISE EXCEPTION 'agentic_chat_queue_first_admission_preflight_failed';
	END IF;
	v_patched := replace(v_definition, v_needle, v_replacement);
	IF v_patched = v_definition OR position(v_replacement IN v_patched) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_queue_first_admission_patch_failed';
	END IF;
	EXECUTE v_patched;
END;
$migration$;

DO $migration$
DECLARE
	v_definition text;
	v_patched text;
	v_needle text := E'IF v_job.created_at < v_now - interval ''300 seconds''\n\t\tOR v_artifact.retain_until < v_now THEN';
	v_replacement text := E'IF v_artifact.retain_until < v_now THEN';
BEGIN
	SELECT pg_get_functiondef(procedures.oid)
	INTO STRICT v_definition
	FROM pg_catalog.pg_proc procedures
	JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = procedures.pronamespace
	WHERE namespaces.nspname = 'public'
		AND procedures.proname = 'begin_agentic_chat_turn_execution'
		AND procedures.pronargs = 4;

	IF position(v_needle IN v_definition) = 0
		OR position(v_replacement IN v_definition) > 0 THEN
		RAISE EXCEPTION 'agentic_chat_queue_wait_execution_preflight_failed';
	END IF;
	v_patched := replace(v_definition, v_needle, v_replacement);
	IF v_patched = v_definition OR position(v_replacement IN v_patched) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_queue_wait_execution_patch_failed';
	END IF;
	EXECUTE v_patched;
END;
$migration$;

DO $migration$
DECLARE
	v_definition text;
	v_patched text;
	v_needle text := E'v_queue_residence_expired := v_job.created_at < v_now - interval ''300 seconds'';';
	v_replacement text := E'v_queue_residence_expired := EXISTS (\n\t\tSELECT 1\n\t\tFROM public.chat_turn_input_artifacts artifacts\n\t\tWHERE artifacts.id = v_turn.input_artifact_id\n\t\t\tAND artifacts.turn_run_id = v_turn.id\n\t\t\tAND artifacts.session_id = v_turn.session_id\n\t\t\tAND artifacts.user_id = v_turn.user_id\n\t\t\tAND artifacts.retain_until < v_now\n\t);';
BEGIN
	SELECT pg_get_functiondef(procedures.oid)
	INTO STRICT v_definition
	FROM pg_catalog.pg_proc procedures
	JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = procedures.pronamespace
	WHERE namespaces.nspname = 'public'
		AND procedures.proname = 'recover_agentic_chat_turn'
		AND procedures.pronargs = 6;

	IF position(v_needle IN v_definition) = 0
		OR position(v_replacement IN v_definition) > 0 THEN
		RAISE EXCEPTION 'agentic_chat_queue_wait_recovery_preflight_failed';
	END IF;
	v_patched := replace(v_definition, v_needle, v_replacement);
	IF v_patched = v_definition OR position(v_replacement IN v_patched) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_queue_wait_recovery_patch_failed';
	END IF;
	EXECUTE v_patched;
END;
$migration$;

COMMENT ON FUNCTION public.create_agentic_chat_turn_with_job(
	uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid,
	text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer,
	text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean
) IS
	'Service-only duplicate-first queue admission. Runtime pressure and running work never reject a compatible turn; max_queued=100 per user is an emergency safety ceiling.';

COMMENT ON FUNCTION public.begin_agentic_chat_turn_execution(uuid, uuid, uuid, integer) IS
	'Service-only immediate-before-provider CAS. A queued turn may wait until its frozen input artifact expires; only started grants invoke_provider=true.';

COMMENT ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text) IS
	'Service-only recovery classifier. Safe pre-start retries are bounded by attempts and frozen artifact retention, not queue residence time.';

COMMIT;
