-- Disposable PostgreSQL verification for classified provider passes.
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

SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_provider_attempt_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_provider_attempt_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)',
		'EXECUTE'
	),
	'classified provider observation is not service-only'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_provider_attempt_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('9', 63) || '1', 'provider', 'provider_attempt_started',
	'{"round":"synthesis","logical_provider_round":3,"pass_role":"acting","provider_attempt":1,"attempt_kind":"primary","route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
);
SELECT public.persist_agentic_chat_provider_attempt_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('9', 63) || '2', 'provider', 'provider_attempt_ended',
	'{"round":"synthesis","logical_provider_round":3,"pass_role":"acting","provider_attempt":1,"attempt_kind":"primary","route_id":"openrouter","model_requested":"provider/primary","model_used":"provider/primary","provider":"fixture","status":"success","duration_ms":10,"finish_reason":"tool_calls","error_class":null,"usage":null}'::jsonb
) AS receipt \gset acting_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'acting_receipt'::jsonb->>'outcome' = 'persisted'
	AND (SELECT llm_pass_count = 1 FROM public.chat_turn_runs
		WHERE id = 'fc300000-0000-4000-8000-000000000001'),
	'first successful classified pass did not set the aggregate to one'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_provider_attempt_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('9', 63) || '2', 'provider', 'provider_attempt_ended',
	'{"round":"synthesis","logical_provider_round":3,"pass_role":"acting","provider_attempt":1,"attempt_kind":"primary","route_id":"openrouter","model_requested":"provider/primary","model_used":"provider/primary","provider":"fixture","status":"success","duration_ms":10,"finish_reason":"tool_calls","error_class":null,"usage":null}'::jsonb
) AS receipt \gset replay_
SELECT public.persist_agentic_chat_provider_attempt_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('9', 63) || '3', 'provider', 'provider_attempt_ended',
	'{"round":"synthesis","logical_provider_round":4,"pass_role":"acting","provider_attempt":2,"attempt_kind":"retry","route_id":"openrouter","model_requested":"provider/primary","status":"failure","duration_ms":11,"finish_reason":null,"error_class":"provider_retryable_error","usage":null}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	:'replay_receipt'::jsonb->>'outcome' = 'already_persisted'
	AND (SELECT llm_pass_count = 1 FROM public.chat_turn_runs
		WHERE id = 'fc300000-0000-4000-8000-000000000001'),
	'replay or physical retry inflated the logical-pass aggregate'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_provider_attempt_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('9', 63) || '4', 'provider', 'provider_attempt_ended',
	'{"round":"synthesis","logical_provider_round":3,"pass_role":"mutation_review","provider_attempt":1,"attempt_kind":"primary","route_id":"openrouter_semantic_reviewer","model_requested":"provider/reviewer","model_used":"provider/reviewer","provider":"fixture","status":"success","duration_ms":12,"finish_reason":"tool_calls","error_class":null,"usage":null}'::jsonb
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			SELECT public.persist_agentic_chat_provider_attempt_observation(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001',
				1, repeat('9', 63) || '5', 'provider', 'provider_attempt_started',
				'{"round":"synthesis","logical_provider_round":5,"pass_role":"unknown","provider_attempt":1,"attempt_kind":"primary","route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
			)
		$$,
		'invalid_pass_role'
	),
	'invalid pass role reached the durable ledger'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT llm_pass_count = 2 FROM public.chat_turn_runs
	 WHERE id = 'fc300000-0000-4000-8000-000000000001'),
	'acting and mutation-review passes sharing one logical round were not counted separately'
);

SELECT 'agentic_chat_provider_pass_telemetry_ok' AS result;
