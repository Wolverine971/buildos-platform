-- Disposable PostgreSQL verification for validation-only failure counting.
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

SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_counted_tool_validation_failure(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text,jsonb,text)',
		'EXECUTE'
	),
	'service role can persist counted validation failures'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_counted_tool_validation_failure(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text,jsonb,text)',
		'EXECUTE'
	),
	'authenticated cannot persist counted validation failures'
);

SELECT pg_temp.seed_timing_turn(
	'ab300000-0000-4000-8000-000000000099',
	'ab400000-0000-4000-8000-000000000099',
	'ab500000-0000-4000-8000-000000000099',
	'ab600000-0000-4000-8000-000000000099',
	'ab700000-0000-4000-8000-000000000099',
	'validation-failure-count',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_counted_tool_validation_failure(
	'ab300000-0000-4000-8000-000000000099',
	'fa100000-0000-4000-8000-000000000001',
	'ab400000-0000-4000-8000-000000000099',
	'ab500000-0000-4000-8000-000000000099',
	1,
	'ab800000-0000-5000-8000-000000000099',
	1,
	'validation-call-1',
	'declare_turn_contract',
	'read',
	'{}'::jsonb,
	'Tool validation failed: Invalid turn contract'
) AS receipt \gset first_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'first_receipt'::jsonb->>'outcome' = 'persisted',
	'validation failure persisted'
);
SELECT pg_temp.assert_true(
	(SELECT validation_failure_count = 1 FROM public.chat_turn_runs
	 WHERE id = 'ab300000-0000-4000-8000-000000000099'),
	'new validation failure increments the turn aggregate'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_counted_tool_validation_failure(
	'ab300000-0000-4000-8000-000000000099',
	'fa100000-0000-4000-8000-000000000001',
	'ab400000-0000-4000-8000-000000000099',
	'ab500000-0000-4000-8000-000000000099',
	1,
	'ab800000-0000-5000-8000-000000000099',
	1,
	'validation-call-1',
	'declare_turn_contract',
	'read',
	'{}'::jsonb,
	'Tool validation failed: Invalid turn contract'
) AS receipt \gset replay_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'replay_receipt'::jsonb->>'outcome' = 'already_persisted',
	'exact replay resolves the existing failed row'
);
SELECT pg_temp.assert_true(
	(SELECT validation_failure_count = 1 FROM public.chat_turn_runs
	 WHERE id = 'ab300000-0000-4000-8000-000000000099'),
	'exact replay does not double-count the failure'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_tool_validation_failure(
	'ab300000-0000-4000-8000-000000000099',
	'fa100000-0000-4000-8000-000000000001',
	'ab400000-0000-4000-8000-000000000099',
	'ab500000-0000-4000-8000-000000000099',
	1,
	'ab800000-0000-5000-8000-000000000098',
	2,
	'supervisor-block-1',
	'update_onto_task',
	'write',
	'{}'::jsonb,
	'Supervisor blocked mutation before execution'
) AS receipt \gset operational_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'operational_receipt'::jsonb->>'outcome' = 'persisted',
	'operational failure still uses the generic durable ledger'
);
SELECT pg_temp.assert_true(
	(SELECT validation_failure_count = 1 FROM public.chat_turn_runs
	 WHERE id = 'ab300000-0000-4000-8000-000000000099'),
	'operational failure does not increment validation telemetry'
);

SELECT 'agentic_chat_validation_failure_count_ok' AS result;
