-- supabase/tests/20260817020000_agentic_chat_provider_attempt_timing_receipts.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN false;
EXCEPTION WHEN OTHERS THEN
	RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			SELECT public.persist_agentic_chat_execution_observation(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001',
				1, repeat('e', 64), 'provider', 'provider_attempt_ended',
				'{
					"round":"initial",
					"logical_provider_round":1,
					"route_id":"openrouter",
					"model_requested":"provider/primary",
					"model_used":"provider/primary",
					"provider":"fixture-provider",
					"status":"success",
					"duration_ms":90005,
					"provider_timing":{
						"network_started_at_ms":1000000,
						"deadline_at_ms":1090000,
						"response_opened_at_ms":1000123,
						"timeout_fired_at_ms":null,
						"timeout_overshoot_ms":null,
						"post_timeout_cleanup_ms":null,
						"network_boundary_ms":90005
					},
					"finish_reason":"stop",
					"error_class":null,
					"usage":{
						"prompt_tokens":100,
						"completion_tokens":20,
						"total_tokens":120,
						"reasoning_tokens":3,
						"cached_prompt_tokens":10,
						"cache_write_tokens":0
					}
				}'::jsonb
			)
		$$,
		'turn_not_found'
	),
	'valid provider timing or extended usage counters failed payload validation'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			SELECT public.persist_agentic_chat_execution_observation(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001',
				1, repeat('f', 64), 'provider', 'provider_attempt_ended',
				'{
					"round":"initial",
					"logical_provider_round":2,
					"route_id":"openrouter",
					"model_requested":"provider/primary",
					"status":"failure",
					"duration_ms":90050,
					"provider_timing":{
						"network_started_at_ms":2000000,
						"deadline_at_ms":2090000,
						"response_opened_at_ms":2000100,
						"timeout_fired_at_ms":2090010,
						"timeout_overshoot_ms":9,
						"post_timeout_cleanup_ms":40,
						"network_boundary_ms":90050
					},
					"finish_reason":null,
					"error_class":"provider_timeout",
					"usage":null
				}'::jsonb
			)
		$$,
		'invalid_provider_timing'
	),
	'provider observation accepted an inconsistent timeout overshoot'
);
RESET ROLE;

SELECT 'agentic_chat_provider_attempt_timing_receipts_ok' AS result;
