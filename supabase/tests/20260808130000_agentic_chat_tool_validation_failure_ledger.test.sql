-- supabase/tests/20260808130000_agentic_chat_tool_validation_failure_ledger.test.sql
-- Disposable PostgreSQL verification for the Slice 18 S4 validation ledger.
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
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_tool_validation_failure(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text,jsonb,text)',
		'EXECUTE'
	),
	'service role can persist worker validation failures'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.persist_agentic_chat_tool_validation_failure(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text,jsonb,text)',
		'EXECUTE'
	),
	'anon cannot persist worker validation failures'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_tool_validation_failure(uuid,uuid,uuid,uuid,integer,uuid,integer,text,text,text,jsonb,text)',
		'EXECUTE'
	),
	'authenticated cannot persist worker validation failures'
);

SELECT pg_temp.seed_timing_turn(
	'fc300000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	'fc600000-0000-4000-8000-000000000001',
	'fc700000-0000-4000-8000-000000000001',
	'validation-ledger',
	1,
	false,
	false
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_tool_validation_failure(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1,
	'fc800000-0000-5000-8000-000000000001',
	1,
	'read-tool-call-invalid-1',
	'get_project_overview',
	'read',
	'{}'::jsonb,
	'Tool validation failed: Missing required parameter: project_id'
) AS receipt \gset validation_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'validation_receipt'::jsonb->>'outcome' = 'persisted',
	'validation failure row persisted'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1 AND bool_and(
			message_id IS NULL
			AND provider_tool_call_id = 'read-tool-call-invalid-1'
			AND tool_name = 'get_project_overview'
			AND tool_category = 'read'
			AND sequence_index = 1
			AND arguments = '{}'::jsonb
			AND result IS NULL
			AND result_count IS NULL
			AND zero_result IS NULL
			AND execution_time_ms IS NULL
			AND tokens_consumed IS NULL
			AND success = false
			AND error_message = 'Tool validation failed: Missing required parameter: project_id'
			AND requires_user_action IS NULL
			AND affected_entities = '[]'::jsonb
		)
		FROM public.chat_tool_executions
		WHERE id = 'fc800000-0000-5000-8000-000000000001'
	),
	'exact unattached validation-failure row is durable'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_tool_validation_failure(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1,
	'fc800000-0000-5000-8000-000000000001',
	1,
	'read-tool-call-invalid-1',
	'get_project_overview',
	'read',
	'{}'::jsonb,
	'Tool validation failed: Missing required parameter: project_id'
) AS receipt \gset validation_replay_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'validation_replay_receipt'::jsonb->>'outcome' = 'already_persisted',
	'exact validation-failure replay resolves the existing row'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.persist_agentic_chat_tool_validation_failure(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001', 1,
				'fc800000-0000-5000-8000-000000000002', 1,
				'read-tool-call-invalid-1', 'get_project_overview', 'read', '{}'::jsonb,
				'Tool validation failed: conflicting replay'
			)
		$statement$,
		'agentic_chat_tool_validation_failure_replay_conflict'
	),
	'provider-call replay cannot alias a different validation failure'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$statement$
			SELECT public.persist_agentic_chat_tool_validation_failure(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001', 1,
				'fc800000-0000-5000-8000-000000000003', 2,
				'read-tool-call-invalid-2', 'get_project_overview', 'read', '{}'::jsonb,
				' invalid error '
			)
		$statement$,
		'agentic_chat_tool_validation_failure_invalid_payload'
	),
	'non-canonical validation errors cannot create ledger rows'
);
RESET ROLE;

SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM public.chat_tool_executions
		WHERE id IN (
			'fc800000-0000-5000-8000-000000000002',
			'fc800000-0000-5000-8000-000000000003'
		)
	),
	'conflicting and invalid validation rows rolled back'
);

SELECT 'phase4_slice18_validation_failure_ledger_ok' AS result;
