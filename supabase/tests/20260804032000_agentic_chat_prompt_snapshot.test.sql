-- supabase/tests/20260804032000_agentic_chat_prompt_snapshot.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 7.
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

INSERT INTO public.users (id)
VALUES ('f1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'f2000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	'global',
	'active'
);

CREATE OR REPLACE FUNCTION pg_temp.seed_snapshot_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_user_message_id uuid,
	p_input_artifact_id uuid,
	p_correlation_id uuid,
	p_suffix text,
	p_execution_generation integer,
	p_cancel_requested boolean,
	p_terminal boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_now timestamptz := clock_timestamp();
BEGIN
	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (
		p_user_message_id,
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'user',
		'Current request',
		jsonb_build_object('idempotency_key', 'prompt-snapshot-user-' || p_suffix)
	);

	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status,
		queue_job_id, processing_token, started_at, attempts, max_attempts
	) VALUES (
		p_queue_job_id,
		'f1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object('turnRunId', p_turn_run_id, 'correlationId', p_correlation_id),
		v_now - interval '2 seconds',
		'agentic-chat-turn:' || p_turn_run_id::text,
		'processing',
		'agentic_chat_prompt_snapshot_' || p_suffix,
		p_processing_token,
		v_now - interval '1 second',
		0,
		3
	);

	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, request_payload, request_payload_version, status,
		execution_mode, queue_job_id, correlation_id, execution_generation,
		worker_started_at, execution_started_at, history_cutoff_at, last_progress_at,
		last_event_sequence, user_message_id,
		cancel_requested_at, cancel_reason, terminalized_at, terminal_event_id
	) VALUES (
		p_turn_run_id,
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'prompt-snapshot-stream-' || p_suffix,
		'prompt-snapshot-client-' || p_suffix,
		'global',
		'Current request',
		jsonb_build_object(
			'message', 'Current request',
			'attachments', '[]'::jsonb,
			'promptVariant', 'fastchat_lite_v1',
			'context', jsonb_build_object('type', 'global'),
			'clientTurnId', 'prompt-snapshot-client-' || p_suffix,
			'streamRunId', 'prompt-snapshot-stream-' || p_suffix
		),
		'agentic_chat_request_v1',
		CASE WHEN p_terminal THEN 'completed' ELSE 'running' END,
		'worker_realtime',
		p_queue_job_id,
		p_correlation_id,
		p_execution_generation,
		v_now - interval '1 second',
		v_now - interval '500 milliseconds',
		v_now - interval '2 seconds',
		v_now - interval '250 milliseconds',
		4,
		p_user_message_id,
		CASE WHEN p_cancel_requested THEN v_now - interval '100 milliseconds' ELSE NULL END,
		CASE WHEN p_cancel_requested THEN 'user_cancelled' ELSE NULL END,
		CASE WHEN p_terminal THEN v_now ELSE NULL END,
		CASE WHEN p_terminal THEN p_turn_run_id::text || ':' || p_execution_generation || ':4' ELSE NULL END
	);

	INSERT INTO public.chat_turn_input_artifacts (
		id, turn_run_id, session_id, user_id, artifact_version, history_source,
		history, prepared, content_hash, history_bytes, content_bytes,
		created_at, retain_until
	) VALUES (
		p_input_artifact_id,
		p_turn_run_id,
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'agentic_chat_input_v3',
		'admission_window',
		jsonb_build_array(jsonb_build_object(
			'sourceMessageId', NULL,
			'role', 'assistant',
			'content', 'Prior answer',
			'attachments', '[]'::jsonb,
			'toolCalls', '[]'::jsonb,
			'toolCallId', NULL
		)),
		jsonb_build_object(
			'sourcePreparedPromptId', NULL,
			'contextPayload', jsonb_build_object('workspace', 'fixture'),
			'conversationSummary', NULL,
			'surfaceProfile', 'fixture',
			'systemPrompt', 'Fixture only',
			'promptSections', jsonb_build_array(jsonb_build_object('id', 'identity')),
			'toolSurface', '{}'::jsonb,
			'sessionSnapshot', jsonb_build_object('summary', NULL),
			'contextUsageSnapshot', jsonb_build_object(
				'estimatedTokens', 10,
				'tokenBudget', 1000,
				'usagePercent', 1,
				'tokensRemaining', 990,
				'status', 'ok'
			)
		),
		repeat('c', 64),
		100,
		500,
		v_now - interval '2 seconds',
		v_now + interval '8 days'
	);

	UPDATE public.chat_turn_runs
	SET input_artifact_id = p_input_artifact_id
	WHERE id = p_turn_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.persist_snapshot(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_prompt_snapshot_id uuid,
	p_model_messages jsonb,
	p_system_hash text DEFAULT repeat('a', 64),
	p_messages_hash text DEFAULT repeat('b', 64)
)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT public.persist_agentic_chat_prompt_snapshot(
		p_turn_run_id,
		'f1000000-0000-4000-8000-000000000001',
		p_queue_job_id,
		p_processing_token,
		p_execution_generation,
		p_prompt_snapshot_id,
		p_model_messages,
		p_system_hash,
		p_messages_hash,
		12,
		39,
		10
	);
$$;

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.persist_agentic_chat_prompt_snapshot(uuid,uuid,uuid,uuid,integer,uuid,jsonb,text,text,integer,integer,integer)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_prompt_snapshot(uuid,uuid,uuid,uuid,integer,uuid,jsonb,text,text,integer,integer,integer)',
		'EXECUTE'
	)
	AND has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_prompt_snapshot(uuid,uuid,uuid,uuid,integer,uuid,jsonb,text,text,integer,integer,integer)',
		'EXECUTE'
	),
	'prompt snapshot grants are not service-only'
);

SELECT pg_temp.seed_snapshot_turn(
	'f4000000-0000-4000-8000-000000000001',
	'f3000000-0000-4000-8000-000000000001',
	'f9000000-0000-4000-8000-000000000001',
	'f5000000-0000-4000-8000-000000000001',
	'f6000000-0000-4000-8000-000000000001',
	'f8000000-0000-4000-8000-000000000001',
	'success', 1, false, false
);

CREATE TEMP TABLE snapshot_receipts (kind text, receipt jsonb);
GRANT ALL ON snapshot_receipts TO service_role;
SET ROLE service_role;
INSERT INTO snapshot_receipts VALUES (
	'persisted',
	pg_temp.persist_snapshot(
		'f4000000-0000-4000-8000-000000000001',
		'f3000000-0000-4000-8000-000000000001',
		'f9000000-0000-4000-8000-000000000001',
		1,
		'f7000000-0000-5000-8000-000000000001',
		'[
			{"role":"system","content":"Fixture only"},
			{"role":"assistant","content":"Prior answer"},
			{"role":"user","content":"Current request"}
		]'::jsonb
	)
), (
	'replay',
	pg_temp.persist_snapshot(
		'f4000000-0000-4000-8000-000000000001',
		'f3000000-0000-4000-8000-000000000001',
		'f9000000-0000-4000-8000-000000000001',
		1,
		'f7000000-0000-5000-8000-000000000001',
		'[
			{"role":"system","content":"Fixture only"},
			{"role":"assistant","content":"Prior answer"},
			{"role":"user","content":"Current request"}
		]'::jsonb
	)
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT receipt->>'outcome' = 'persisted' FROM snapshot_receipts WHERE kind = 'persisted')
	AND (SELECT receipt->>'outcome' = 'already_persisted' FROM snapshot_receipts WHERE kind = 'replay')
	AND (
		SELECT prompt_snapshot_id = 'f7000000-0000-5000-8000-000000000001'
			AND last_event_sequence = 4
		FROM public.chat_turn_runs
		WHERE id = 'f4000000-0000-4000-8000-000000000001'
	)
	AND (
		SELECT snapshot_version = 'agentic_chat_worker_prompt_v1'
			AND prompt_variant = 'fastchat_lite_v1'
			AND system_prompt = 'Fixture only'
			AND jsonb_array_length(model_messages) = 3
			AND tool_definitions IS NULL
			AND rendered_dump_text IS NULL
			AND system_prompt_chars = 12
			AND message_chars = 39
			AND approx_prompt_tokens = 10
			AND prompt_sections->>'content_hash' = repeat('c', 64)
		FROM public.chat_prompt_snapshots
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000001'
	)
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_turn_events
		WHERE turn_run_id = 'f4000000-0000-4000-8000-000000000001'
	),
	'prompt snapshot was not atomically persisted, linked, replayed, or kept out of the public event log'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$SELECT pg_temp.persist_snapshot(
			'f4000000-0000-4000-8000-000000000001',
			'f3000000-0000-4000-8000-000000000001',
			'f9000000-0000-4000-8000-000000000001',
			1,
			'f7000000-0000-5000-8000-000000000001',
			'[{"role":"system","content":"changed"},{"role":"user","content":"Current request"}]'::jsonb
		)$$,
		'agentic_chat_prompt_snapshot_replay_conflict'
	),
	'conflicting lost-response replay was not rejected'
);
RESET ROLE;

UPDATE public.chat_turn_runs
SET status = 'completed',
	terminalized_at = clock_timestamp(),
	terminal_event_id = id::text || ':' || execution_generation || ':' || last_event_sequence
WHERE id = 'f4000000-0000-4000-8000-000000000001';

SELECT pg_temp.seed_snapshot_turn(
	'f4000000-0000-4000-8000-000000000002',
	'f3000000-0000-4000-8000-000000000002',
	'f9000000-0000-4000-8000-000000000002',
	'f5000000-0000-4000-8000-000000000002',
	'f6000000-0000-4000-8000-000000000002',
	'f8000000-0000-4000-8000-000000000002',
	'cancel', 1, true, false
);
SELECT pg_temp.seed_snapshot_turn(
	'f4000000-0000-4000-8000-000000000003',
	'f3000000-0000-4000-8000-000000000003',
	'f9000000-0000-4000-8000-000000000003',
	'f5000000-0000-4000-8000-000000000003',
	'f6000000-0000-4000-8000-000000000003',
	'f8000000-0000-4000-8000-000000000003',
	'stale', 2, false, true
);

SET ROLE service_role;
INSERT INTO snapshot_receipts VALUES (
	'cancel',
	pg_temp.persist_snapshot(
		'f4000000-0000-4000-8000-000000000002',
		'f3000000-0000-4000-8000-000000000002',
		'f9000000-0000-4000-8000-000000000002',
		1,
		'f7000000-0000-5000-8000-000000000002',
		'[{"role":"system","content":"Fixture only"},{"role":"assistant","content":"Prior answer"},{"role":"user","content":"Current request"}]'::jsonb
	)
), (
	'stale',
	pg_temp.persist_snapshot(
		'f4000000-0000-4000-8000-000000000003',
		'f3000000-0000-4000-8000-000000000003',
		'f9000000-0000-4000-8000-000000000003',
		1,
		'f7000000-0000-5000-8000-000000000003',
		'null'::jsonb
	)
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT receipt->>'outcome' = 'cancel_requested' FROM snapshot_receipts WHERE kind = 'cancel')
	AND (SELECT receipt->>'outcome' = 'stale_generation' FROM snapshot_receipts WHERE kind = 'stale')
	AND NOT EXISTS (
		SELECT 1 FROM public.chat_prompt_snapshots
		WHERE turn_run_id IN (
			'f4000000-0000-4000-8000-000000000002',
			'f4000000-0000-4000-8000-000000000003'
		)
	),
	'cancellation or stale generation persisted a prompt snapshot'
);

SELECT 'phase4_slice7_prompt_snapshot_ok' AS result;
