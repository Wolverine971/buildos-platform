-- supabase/migrations/20260817020000_agentic_chat_provider_attempt_timing_receipts.sql
-- Keep the private provider-attempt ledger aligned with the worker's redacted
-- usage counters and deadline timeline. No prompt, response, or tool content is
-- admitted by this extension.

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
		$old$		'status', 'duration_ms', 'finish_reason', 'error_class', 'usage'$old$,
		$new$		'status', 'duration_ms', 'provider_timing', 'finish_reason', 'error_class', 'usage'$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_attempt_timing_allowlist_unexpected_body';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$			'prompt_tokens', 'completion_tokens', 'total_tokens'$old$,
		$new$			'prompt_tokens', 'completion_tokens', 'total_tokens',
				'reasoning_tokens', 'cached_prompt_tokens', 'cache_write_tokens'$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_attempt_usage_allowlist_unexpected_body';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	IF p_payload ? 'duration_ms' AND ($old$,
		$new$	IF p_payload ? 'provider_timing' AND (
		p_event_type <> 'provider_attempt_ended'
		OR jsonb_typeof(p_payload->'provider_timing') <> 'object'
		OR NOT (p_payload->'provider_timing' ?& ARRAY[
			'network_started_at_ms', 'deadline_at_ms', 'response_opened_at_ms',
			'timeout_fired_at_ms', 'timeout_overshoot_ms',
			'post_timeout_cleanup_ms', 'network_boundary_ms'
		])
		OR (p_payload->'provider_timing') - ARRAY[
			'network_started_at_ms', 'deadline_at_ms', 'response_opened_at_ms',
			'timeout_fired_at_ms', 'timeout_overshoot_ms',
			'post_timeout_cleanup_ms', 'network_boundary_ms'
		] <> '{}'::jsonb
		OR jsonb_typeof(p_payload#>'{provider_timing,network_started_at_ms}') <> 'number'
		OR COALESCE((p_payload#>>'{provider_timing,network_started_at_ms}') !~ '^[0-9]+$', true)
		OR jsonb_typeof(p_payload#>'{provider_timing,deadline_at_ms}') <> 'number'
		OR COALESCE((p_payload#>>'{provider_timing,deadline_at_ms}') !~ '^[0-9]+$', true)
		OR jsonb_typeof(p_payload#>'{provider_timing,network_boundary_ms}') <> 'number'
		OR COALESCE((p_payload#>>'{provider_timing,network_boundary_ms}') !~ '^[0-9]+$', true)
		OR (
			p_payload#>'{provider_timing,response_opened_at_ms}' IS DISTINCT FROM 'null'::jsonb
			AND (
				jsonb_typeof(p_payload#>'{provider_timing,response_opened_at_ms}') <> 'number'
				OR COALESCE((p_payload#>>'{provider_timing,response_opened_at_ms}') !~ '^[0-9]+$', true)
			)
		)
		OR (
			p_payload#>'{provider_timing,timeout_fired_at_ms}' IS DISTINCT FROM 'null'::jsonb
			AND (
				jsonb_typeof(p_payload#>'{provider_timing,timeout_fired_at_ms}') <> 'number'
				OR COALESCE((p_payload#>>'{provider_timing,timeout_fired_at_ms}') !~ '^[0-9]+$', true)
			)
		)
		OR (
			p_payload#>'{provider_timing,timeout_overshoot_ms}' IS DISTINCT FROM 'null'::jsonb
			AND (
				jsonb_typeof(p_payload#>'{provider_timing,timeout_overshoot_ms}') <> 'number'
				OR COALESCE((p_payload#>>'{provider_timing,timeout_overshoot_ms}') !~ '^[0-9]+$', true)
			)
		)
		OR (
			p_payload#>'{provider_timing,post_timeout_cleanup_ms}' IS DISTINCT FROM 'null'::jsonb
			AND (
				jsonb_typeof(p_payload#>'{provider_timing,post_timeout_cleanup_ms}') <> 'number'
				OR COALESCE((p_payload#>>'{provider_timing,post_timeout_cleanup_ms}') !~ '^[0-9]+$', true)
			)
		)
		OR (p_payload#>>'{provider_timing,deadline_at_ms}')::numeric
			< (p_payload#>>'{provider_timing,network_started_at_ms}')::numeric
		OR (
			p_payload#>'{provider_timing,response_opened_at_ms}' IS DISTINCT FROM 'null'::jsonb
			AND (p_payload#>>'{provider_timing,response_opened_at_ms}')::numeric
				< (p_payload#>>'{provider_timing,network_started_at_ms}')::numeric
		)
		OR (
			(p_payload#>'{provider_timing,timeout_fired_at_ms}' = 'null'::jsonb)
			IS DISTINCT FROM (
				p_payload#>'{provider_timing,timeout_overshoot_ms}' = 'null'::jsonb
				AND p_payload#>'{provider_timing,post_timeout_cleanup_ms}' = 'null'::jsonb
			)
		)
		OR (
			p_payload#>'{provider_timing,timeout_fired_at_ms}' IS DISTINCT FROM 'null'::jsonb
			AND (
				(p_payload#>>'{provider_timing,timeout_fired_at_ms}')::numeric
					< (p_payload#>>'{provider_timing,deadline_at_ms}')::numeric
				OR (p_payload#>>'{provider_timing,timeout_overshoot_ms}')::numeric
					<> (p_payload#>>'{provider_timing,timeout_fired_at_ms}')::numeric
						- (p_payload#>>'{provider_timing,deadline_at_ms}')::numeric
				OR (p_payload#>>'{provider_timing,post_timeout_cleanup_ms}')::numeric
					<> (p_payload#>>'{provider_timing,network_boundary_ms}')::numeric
						- (
							(p_payload#>>'{provider_timing,timeout_fired_at_ms}')::numeric
							- (p_payload#>>'{provider_timing,network_started_at_ms}')::numeric
						)
			)
		)
	) THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_provider_timing';
	END IF;
	IF p_payload ? 'duration_ms' AND ($new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_provider_attempt_timing_validation_missing';
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

COMMENT ON FUNCTION public.persist_agentic_chat_execution_observation(
	uuid, uuid, uuid, uuid, integer, text, text, text, jsonb
) IS
	'Persists generation-fenced redacted worker lifecycle evidence, including bounded provider usage counters and provider-attempt deadline timing.';
