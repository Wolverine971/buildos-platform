-- supabase/tests/20260815173000_agentic_chat_provider_observation_logical_round.test.sql
-- Disposable PostgreSQL verification for provider-attempt logical rounds.
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
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('b', 64), 'provider', 'provider_attempt_started',
	'{"round":"initial","logical_provider_round":1,"route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
) AS receipt \gset logical_round_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'logical_round_receipt'::jsonb->>'outcome' = 'persisted'
	AND (
		SELECT payload->>'logical_provider_round' = '1'
		FROM public.agentic_chat_execution_observations
		WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000001'
			AND observation_key = repeat('b', 64)
	),
	'provider logical round was not durably persisted'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			SELECT public.persist_agentic_chat_execution_observation(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001',
				1, repeat('c', 64), 'provider', 'provider_attempt_started',
				'{"round":"initial","logical_provider_round":0,"route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
			)
		$$,
		'invalid_logical_round'
	),
	'provider observation accepted logical round zero'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			SELECT public.persist_agentic_chat_execution_observation(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001',
				1, repeat('d', 64), 'provider', 'provider_attempt_started',
				'{"round":"initial","logical_provider_round":1.5,"route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
			)
		$$,
		'invalid_logical_round'
	),
	'provider observation accepted a fractional logical round'
);
RESET ROLE;

SELECT 'agentic_chat_provider_observation_logical_round_ok' AS result;
