-- supabase/tests/20260804000000_agentic_chat_input_v3_lifecycle_snapshots.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 4.
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
	pg_get_constraintdef(
		(
			SELECT constraints.oid
			FROM pg_constraint constraints
			WHERE constraints.conrelid = 'public.chat_turn_input_artifacts'::regclass
				AND constraints.conname = 'chk_chat_turn_input_artifacts_version'
		)
	) LIKE '%agentic_chat_input_v2%agentic_chat_input_v3%',
	'input artifact constraint must permit rolling v2 and current v3 rows'
);

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM pg_trigger triggers
		WHERE triggers.tgrelid = 'public.chat_turn_input_artifacts'::regclass
			AND triggers.tgname = 'trg_chat_turn_input_artifacts_version'
			AND NOT triggers.tgisinternal
	),
	'input artifact version trigger is missing'
);

INSERT INTO public.users (id)
VALUES
	('e1000000-0000-4000-8000-000000000001'),
	('e1000000-0000-4000-8000-000000000002'),
	('e1000000-0000-4000-8000-000000000003'),
	('e1000000-0000-4000-8000-000000000004');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'global', 'active'),
	('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000003', 'global', 'active'),
	('e2000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000004', 'global', 'active');

INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, context_type,
	request_message, status, execution_mode, execution_generation,
	last_event_sequence
)
SELECT
	('e3000000-0000-4000-8000-' || lpad(suffix::text, 12, '0'))::uuid,
	('e2000000-0000-4000-8000-' || lpad(suffix::text, 12, '0'))::uuid,
	('e1000000-0000-4000-8000-' || lpad(suffix::text, 12, '0'))::uuid,
	'v3-stream-' || suffix::text,
	'v3-client-' || suffix::text,
	'global',
	'fixture',
	'failed',
	'worker_realtime',
	0,
	0
FROM generate_series(1, 4) AS suffix;

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, artifact_version, history_source,
	history, prepared, content_hash, history_bytes, content_bytes
) VALUES (
	'e4000000-0000-4000-8000-000000000001',
	'e3000000-0000-4000-8000-000000000001',
	'e2000000-0000-4000-8000-000000000001',
	'e1000000-0000-4000-8000-000000000001',
	'agentic_chat_input_v2',
	'admission_window',
	'[]'::jsonb,
	'{
		"sourcePreparedPromptId": null,
		"contextPayload": {},
		"conversationSummary": null,
		"surfaceProfile": "global_basic",
		"systemPrompt": "system",
		"promptSections": [],
		"toolSurface": {},
		"sessionSnapshot": {"summary": null, "agent_metadata": {}},
		"contextUsageSnapshot": {
			"estimatedTokens": 12,
			"tokenBudget": 15000,
			"usagePercent": 0,
			"tokensRemaining": 14988,
			"status": "ok"
		}
	}'::jsonb,
	repeat('a', 64),
	2,
	512
);

SELECT pg_temp.assert_true(
	(
		SELECT artifact_version = 'agentic_chat_input_v3'
		FROM public.chat_turn_input_artifacts
		WHERE id = 'e4000000-0000-4000-8000-000000000001'
	),
	'snapshot-bearing atomic-admission rows must upgrade from v2 to v3'
);

INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, artifact_version, history_source,
	history, prepared, content_hash, history_bytes, content_bytes
) VALUES (
	'e4000000-0000-4000-8000-000000000002',
	'e3000000-0000-4000-8000-000000000002',
	'e2000000-0000-4000-8000-000000000002',
	'e1000000-0000-4000-8000-000000000002',
	'agentic_chat_input_v2',
	'admission_window',
	'[]'::jsonb,
	'{"sourcePreparedPromptId":null,"contextPayload":{},"conversationSummary":null,"surfaceProfile":"global_basic","systemPrompt":"system","promptSections":[],"toolSurface":{}}'::jsonb,
	repeat('b', 64),
	2,
	256
);

SELECT pg_temp.assert_true(
	(
		SELECT artifact_version = 'agentic_chat_input_v2'
		FROM public.chat_turn_input_artifacts
		WHERE id = 'e4000000-0000-4000-8000-000000000002'
	),
	'rolling v2 artifacts without snapshots must remain v2'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, artifact_version, history_source,
				history, prepared, content_hash, history_bytes, content_bytes
			) VALUES (
				'e4000000-0000-4000-8000-000000000003',
				'e3000000-0000-4000-8000-000000000003',
				'e2000000-0000-4000-8000-000000000003',
				'e1000000-0000-4000-8000-000000000003',
				'agentic_chat_input_v2', 'admission_window', '[]'::jsonb,
				'{"sessionSnapshot":{"summary":null}}'::jsonb,
				repeat('c', 64), 2, 128
			)
		$$,
		'agentic_chat_input_v3_invalid_lifecycle_snapshot'
	),
	'a partial v3 lifecycle snapshot must fail closed'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, artifact_version, history_source,
				history, prepared, content_hash, history_bytes, content_bytes
			) VALUES (
				'e4000000-0000-4000-8000-000000000003',
				'e3000000-0000-4000-8000-000000000003',
				'e2000000-0000-4000-8000-000000000003',
				'e1000000-0000-4000-8000-000000000003',
				'agentic_chat_input_v3', 'admission_window', '[]'::jsonb,
				'{"sourcePreparedPromptId":null,"contextPayload":{},"conversationSummary":null,"surfaceProfile":"global_basic","systemPrompt":"system","promptSections":[],"toolSurface":{}}'::jsonb,
				repeat('c', 64), 2, 256
			)
		$$,
		'agentic_chat_input_v3_missing_lifecycle_snapshot'
	),
	'an explicit v3 row without lifecycle snapshots must fail closed'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, artifact_version, history_source,
				history, prepared, content_hash, history_bytes, content_bytes
			) VALUES (
				'e4000000-0000-4000-8000-000000000004',
				'e3000000-0000-4000-8000-000000000004',
				'e2000000-0000-4000-8000-000000000004',
				'e1000000-0000-4000-8000-000000000004',
				'agentic_chat_input_v3', 'admission_window', '[]'::jsonb,
				'{
					"sessionSnapshot":{"id":"ffffffff-ffff-4fff-8fff-ffffffffffff"},
					"contextUsageSnapshot":{"estimatedTokens":1,"tokenBudget":10,"usagePercent":10,"tokensRemaining":9,"status":"ok"}
				}'::jsonb,
				repeat('d', 64), 2, 256
			)
		$$,
		'agentic_chat_input_v3_invalid_lifecycle_snapshot'
	),
	'a session snapshot cannot override the database-fenced session id'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			INSERT INTO public.chat_turn_input_artifacts (
				id, turn_run_id, session_id, user_id, artifact_version, history_source,
				history, prepared, content_hash, history_bytes, content_bytes
			) VALUES (
				'e4000000-0000-4000-8000-000000000004',
				'e3000000-0000-4000-8000-000000000004',
				'e2000000-0000-4000-8000-000000000004',
				'e1000000-0000-4000-8000-000000000004',
				'agentic_chat_input_v2', 'admission_window', '[]'::jsonb,
				'{
					"sessionSnapshot":{"summary":null},
					"contextUsageSnapshot":{"estimatedTokens":9007199254740992,"tokenBudget":15000,"usagePercent":1,"tokensRemaining":0,"status":"over_budget"}
				}'::jsonb,
				repeat('d', 64), 2, 256
			)
		$$,
		'agentic_chat_input_v3_invalid_lifecycle_snapshot'
	),
	'v3 numeric snapshots must stay inside the JavaScript safe-integer range'
);

SELECT 'phase4_slice4_input_v3_lifecycle_snapshots_ok';

ROLLBACK;
