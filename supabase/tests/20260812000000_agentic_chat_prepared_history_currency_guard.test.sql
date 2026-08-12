-- Disposable PostgreSQL verification for the prepared-history currency guard.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

BEGIN;

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
	EXISTS (
		SELECT 1
		FROM pg_catalog.pg_trigger AS triggers
		WHERE triggers.tgrelid = 'public.chat_turn_input_artifacts'::regclass
			AND triggers.tgname = 'trg_chat_turn_input_artifacts_prepared_history_currency'
			AND NOT triggers.tgisinternal
	),
	'prepared-history currency trigger must exist'
);

SELECT pg_temp.assert_true(
	(
		SELECT procedures.prosecdef = false
			AND procedures.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
		FROM pg_catalog.pg_proc AS procedures
		WHERE procedures.oid =
			'public.validate_agentic_chat_prepared_history_currency()'::regprocedure
	),
	'currency guard must remain invoker-rights with a fixed search path'
);

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'authenticated',
		'public.validate_agentic_chat_prepared_history_currency()',
		'EXECUTE'
	),
	'authenticated callers must not execute the trigger function directly'
);

INSERT INTO public.users (id)
VALUES ('e1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'global',
	'active'
);

INSERT INTO public.agentic_chat_prepared_prompts (
	id,
	user_id,
	session_id,
	context_type,
	cache_key,
	nonce_sha256,
	context_cache_version,
	context_payload,
	history_for_model,
	prepared_surfaces,
	default_surface_profile,
	context_payload_sha256,
	expires_at,
	created_at,
	updated_at
) VALUES (
	'e3000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'global',
	'v2|global|none|none|none',
	repeat('a', 64),
	2,
	'{}'::jsonb,
	'[]'::jsonb,
	'{}'::jsonb,
	'global_basic',
	repeat('b', 64),
	'2099-01-01T00:00:00Z',
	'2026-08-11T10:00:00Z',
	'2026-08-11T10:00:00Z'
);

INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, created_at
) VALUES (
	'e4000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'assistant',
	'Included by the prepared snapshot.',
	'2026-08-11T09:59:59Z'
);

INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, context_type,
	request_message, status, execution_mode, execution_generation
) VALUES
	(
		'e5000000-0000-4000-8000-000000000001',
		'e2000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'currency-stream-1',
		'currency-client-1',
		'global',
		'fixture',
		'failed',
		'worker_realtime',
		0
	),
	(
		'e5000000-0000-4000-8000-000000000002',
		'e2000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'currency-stream-2',
		'currency-client-2',
		'global',
		'fixture',
		'failed',
		'worker_realtime',
		0
	),
	(
		'e5000000-0000-4000-8000-000000000003',
		'e2000000-0000-4000-8000-000000000001',
		'e1000000-0000-4000-8000-000000000001',
		'currency-stream-3',
		'currency-client-3',
		'global',
		'fixture',
		'failed',
		'worker_realtime',
		0
	);

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
	artifact_version, history_source, history, prepared, content_hash,
	history_bytes, content_bytes
) VALUES (
	'e6000000-0000-4000-8000-000000000001',
	'e5000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'e3000000-0000-4000-8000-000000000001',
	'agentic_chat_input_v2',
	'prepared_prompt',
	'[]'::jsonb,
	'{}'::jsonb,
	repeat('c', 64),
	2,
	64
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM public.chat_turn_input_artifacts
		WHERE id = 'e6000000-0000-4000-8000-000000000001'
	),
	'a current prepared snapshot must remain admissible'
);

INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, created_at
) VALUES (
	'e4000000-0000-4000-8000-000000000002',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'user',
	'Persisted while the next request was being composed.',
	'2026-08-11T10:00:01Z'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
				artifact_version, history_source, history, prepared, content_hash,
				history_bytes, content_bytes
			) VALUES (
				'e6000000-0000-4000-8000-000000000002',
				'e5000000-0000-4000-8000-000000000002',
				'e2000000-0000-4000-8000-000000000001',
				'e1000000-0000-4000-8000-000000000001',
				'e3000000-0000-4000-8000-000000000001',
				'agentic_chat_input_v2', 'prepared_prompt', '[]'::jsonb,
				'{}'::jsonb, repeat('d', 64), 2, 64
			)
		$$,
		'agentic_chat_input_prepared_history_stale'
	),
	'a prepared snapshot older than the latest persisted message must fail closed'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
				artifact_version, history_source, history, prepared, content_hash,
				history_bytes, content_bytes
			) VALUES (
				'e6000000-0000-4000-8000-000000000003',
				'e5000000-0000-4000-8000-000000000003',
				'e2000000-0000-4000-8000-000000000001',
				'e1000000-0000-4000-8000-000000000001',
				'e3000000-0000-4000-8000-000000000099',
				'agentic_chat_input_v2', 'prepared_prompt', '[]'::jsonb,
				'{}'::jsonb, repeat('e', 64), 2, 64
			)
		$$,
		'agentic_chat_input_prepared_history_scope_mismatch'
	),
	'unknown or cross-scoped prepared lineage must fail closed'
);

ROLLBACK;

SELECT 'agentic_chat_prepared_history_currency_guard_ok' AS result;
