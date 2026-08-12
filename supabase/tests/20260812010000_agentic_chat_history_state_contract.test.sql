-- Disposable PostgreSQL verification for immutable history strategy/count evidence.
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

INSERT INTO public.users (id)
VALUES ('f1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'f2000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	'global',
	'active'
);

INSERT INTO public.agentic_chat_prepared_prompts (
	id, user_id, session_id, context_type, cache_key, nonce_sha256,
	context_cache_version, context_payload, history_for_model, history_strategy,
	history_compressed, raw_history_count, history_for_model_count,
	prepared_surfaces, default_surface_profile, context_payload_sha256,
	expires_at, created_at, updated_at
) VALUES
	(
		'f3000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000001',
		'global', 'history-state-valid', repeat('a', 64), 2, '{}'::jsonb,
		'[
			{"role":"assistant","content":"Calling lookup","tool_calls":[{"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{}"}}]},
			{"role":"tool","content":"{\"ok\":true}","tool_call_id":"call-1"}
		]'::jsonb,
		'raw_history', false, 2, 2, '{}'::jsonb, 'global_basic', repeat('b', 64),
		'2099-01-01T00:00:00Z', '2026-08-12T00:00:00Z', '2026-08-12T00:00:00Z'
	),
	(
		'f3000000-0000-4000-8000-000000000002',
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000001',
		'global', 'history-state-attachment', repeat('c', 64), 2, '{}'::jsonb,
		'[{"role":"user","content":"Review this","attachments":[{"asset_id":"asset-1"}]}]'::jsonb,
		'raw_history', false, 1, 1, '{}'::jsonb, 'global_basic', repeat('d', 64),
		'2099-01-01T00:00:00Z', '2026-08-12T00:00:00Z', '2026-08-12T00:00:00Z'
	);

INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, context_type,
	request_message, status, execution_mode, execution_generation
) VALUES
	('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'history-state-stream-1', 'history-state-client-1', 'global', 'fixture', 'failed', 'worker_realtime', 0),
	('f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'history-state-stream-2', 'history-state-client-2', 'global', 'fixture', 'failed', 'worker_realtime', 0),
	('f4000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'history-state-stream-3', 'history-state-client-3', 'global', 'fixture', 'failed', 'worker_realtime', 0),
	('f4000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'history-state-stream-4', 'history-state-client-4', 'global', 'fixture', 'failed', 'worker_realtime', 0),
	('f4000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'history-state-stream-5', 'history-state-client-5', 'global', 'fixture', 'failed', 'worker_realtime', 0);

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
	artifact_version, history_source, history, prepared, content_hash,
	history_bytes, content_bytes
) VALUES (
	'f5000000-0000-4000-8000-000000000001',
	'f4000000-0000-4000-8000-000000000001',
	'f2000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	'f3000000-0000-4000-8000-000000000001',
	'agentic_chat_input_v2', 'prepared_prompt',
	'[
		{"sourceMessageId":null,"role":"assistant","content":"Calling lookup","attachments":[],"toolCalls":[{"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{}"}}],"toolCallId":null},
		{"sourceMessageId":null,"role":"tool","content":"{\"ok\":true}","attachments":[],"toolCalls":[],"toolCallId":"call-1"}
	]'::jsonb,
	'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":2,"historyForModelCount":2}}'::jsonb,
	repeat('e', 64), 256, 512
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM public.chat_turn_runs
		WHERE id = 'f4000000-0000-4000-8000-000000000001'
			AND history_strategy = 'raw_history'
			AND history_compressed = false
			AND raw_history_count = 2
			AND history_for_model_count = 2
	),
	'valid prepared history evidence must be copied onto the parent turn'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
				artifact_version, history_source, history, prepared, content_hash,
				history_bytes, content_bytes
			) VALUES (
				'f5000000-0000-4000-8000-000000000002',
				'f4000000-0000-4000-8000-000000000002',
				'f2000000-0000-4000-8000-000000000001',
				'f1000000-0000-4000-8000-000000000001',
				'f3000000-0000-4000-8000-000000000001',
				'agentic_chat_input_v2', 'prepared_prompt',
				'[
					{"sourceMessageId":null,"role":"assistant","content":"Changed after inspection","attachments":[],"toolCalls":[],"toolCallId":null},
					{"sourceMessageId":null,"role":"tool","content":"{\"ok\":true}","attachments":[],"toolCalls":[],"toolCallId":"call-1"}
				]'::jsonb,
				'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":2,"historyForModelCount":2}}'::jsonb,
				repeat('f', 64), 256, 512
			)
		$$,
		'agentic_chat_input_prepared_history_copy_mismatch'
	),
	'a divergent prepared-history copy must fail closed'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
				artifact_version, history_source, history, prepared, content_hash,
				history_bytes, content_bytes
			) VALUES (
				'f5000000-0000-4000-8000-000000000003',
				'f4000000-0000-4000-8000-000000000003',
				'f2000000-0000-4000-8000-000000000001',
				'f1000000-0000-4000-8000-000000000001',
				'f3000000-0000-4000-8000-000000000001',
				'agentic_chat_input_v2', 'prepared_prompt',
				'[
					{"sourceMessageId":null,"role":"assistant","content":"Calling lookup","attachments":[],"toolCalls":[{"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{}"}}],"toolCallId":null},
					{"sourceMessageId":null,"role":"tool","content":"{\"ok\":true}","attachments":[],"toolCalls":[],"toolCallId":"call-1"}
				]'::jsonb,
				'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":3,"historyForModelCount":2}}'::jsonb,
				repeat('1', 64), 256, 512
			)
		$$,
		'agentic_chat_input_prepared_history_state_mismatch'
	),
	'prepared row metadata and artifact historyState must match exactly'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
				artifact_version, history_source, history, prepared, content_hash,
				history_bytes, content_bytes
			) VALUES (
				'f5000000-0000-4000-8000-000000000004',
				'f4000000-0000-4000-8000-000000000004',
				'f2000000-0000-4000-8000-000000000001',
				'f1000000-0000-4000-8000-000000000001',
				'f3000000-0000-4000-8000-000000000002',
				'agentic_chat_input_v2', 'prepared_prompt',
				'[{"sourceMessageId":null,"role":"user","content":"Review this","attachments":[],"toolCalls":[],"toolCallId":null}]'::jsonb,
				'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":1,"historyForModelCount":1}}'::jsonb,
				repeat('2', 64), 128, 256
			)
		$$,
		'agentic_chat_input_prepared_history_invalid'
	),
	'prepared history attachments remain deferred rather than silently discarded'
);

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, source_prepared_prompt_id,
	artifact_version, history_source, history, prepared, content_hash,
	history_bytes, content_bytes
) VALUES (
	'f5000000-0000-4000-8000-000000000005',
	'f4000000-0000-4000-8000-000000000005',
	'f2000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	NULL, 'agentic_chat_input_v2', 'admission_window', '[]'::jsonb,
	'{"historyState":{"strategy":"raw_history","compressed":false,"rawHistoryCount":0,"historyForModelCount":0}}'::jsonb,
	repeat('3', 64), 2, 128
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM public.chat_turn_runs
		WHERE id = 'f4000000-0000-4000-8000-000000000005'
			AND history_strategy = 'raw_history'
			AND history_compressed = false
			AND raw_history_count = 0
			AND history_for_model_count = 0
	),
	'admission-window history evidence must be copied onto the parent turn'
);

ROLLBACK;

SELECT 'agentic_chat_history_state_contract_ok' AS result;
