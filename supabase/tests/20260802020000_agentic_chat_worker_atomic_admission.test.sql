-- supabase/tests/20260802020000_agentic_chat_worker_atomic_admission.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2B Slice 3A.
-- Prerequisite: apply 20260802020000_agentic_chat_worker_atomic_admission.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS dblink;

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

DO $$
DECLARE
	v_admit regprocedure := to_regprocedure(
		'public.create_agentic_chat_turn_with_job(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,uuid,uuid,text,boolean,text,jsonb,text,text,jsonb,integer,text,jsonb,jsonb,text,integer,integer,uuid,text,text,jsonb,boolean)'
	);
BEGIN
	PERFORM pg_temp.assert_true(v_admit IS NOT NULL, 'worker admission RPC is missing');
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_admit, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_admit, 'EXECUTE')
			AND has_function_privilege('service_role', v_admit, 'EXECUTE'),
		'worker admission grants are not service-only'
	);
	PERFORM pg_temp.assert_true(
		to_regclass('public.uq_chat_sessions_active_daily_brief_context') IS NOT NULL,
		'canonical daily-brief session key is missing'
	);
END;
$$;

-- A JSON test adapter keeps the proof readable while the production RPC keeps
-- typed PostgREST arguments. It is dropped before the test finishes.
CREATE OR REPLACE FUNCTION public.test_create_agentic_chat_turn_with_job(p jsonb)
RETURNS jsonb
LANGUAGE sql
SET search_path = pg_catalog, public
AS $$
	SELECT public.create_agentic_chat_turn_with_job(
		(p->>'userId')::uuid,
		NULLIF(p->>'sessionId', '')::uuid,
		(p->>'turnRunId')::uuid,
		(p->>'userMessageId')::uuid,
		(p->>'inputArtifactId')::uuid,
		COALESCE(p->>'streamRunId', p->>'turnRunId'),
		COALESCE(p->>'clientTurnId', p->>'turnRunId'),
		COALESCE(p->>'requestHash', repeat('a', 64)),
		'agentic_chat_request_hash_v2',
		'agentic_chat_worker_v1',
		(p->>'transportDecisionId')::uuid,
		(p->>'correlationId')::uuid,
		COALESCE(p->>'contextType', 'global'),
		NULLIF(p->>'entityId', '')::uuid,
		NULLIF(p->>'projectId', '')::uuid,
		'live_ui',
		true,
		COALESCE(p->>'message', 'Ship it'),
		COALESCE(p->'requestPayload', '{}'::jsonb),
		'agentic_chat_request_v1',
		COALESCE(p->>'message', 'Ship it'),
		COALESCE(p->'messageMetadata', '{}'::jsonb),
		COALESCE((p->>'historyLimit')::integer, 10),
		COALESCE(p->>'historySource', 'admission_window'),
		COALESCE(p->'artifactHistory', '[]'::jsonb),
		COALESCE(
			p->'artifactPrepared',
			'{"sourcePreparedPromptId":null,"contextPayload":{},"conversationSummary":null,"surfaceProfile":"global_basic","systemPrompt":"system","promptSections":[],"toolSurface":{}}'::jsonb
		),
		COALESCE(p->>'artifactContentHash', repeat('c', 64)),
		COALESCE((p->>'artifactHistoryBytes')::integer, 2),
		COALESCE((p->>'artifactContentBytes')::integer, 256),
		NULLIF(p->>'preparedPromptId', '')::uuid,
		NULLIF(p->>'preparedContextPayloadSha256', ''),
		NULLIF(p->>'preparedSurfaceProfile', ''),
		COALESCE(p->'sessionAgentMetadata', '{}'::jsonb),
		COALESCE((p->>'capacityAvailable')::boolean, true)
	)
$$;

REVOKE ALL ON FUNCTION public.test_create_agentic_chat_turn_with_job(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_create_agentic_chat_turn_with_job(jsonb)
	TO service_role;

INSERT INTO public.users (id)
VALUES
	('d1000000-0000-4000-8000-000000000001'),
	('d1000000-0000-4000-8000-000000000002'),
	('d1000000-0000-4000-8000-000000000003'),
	('d1000000-0000-4000-8000-000000000004');

INSERT INTO public.chat_sessions (id, user_id, context_type, status, entity_id)
VALUES
	('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'global', 'active', NULL),
	('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'global', 'active', NULL),
	('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'global', 'active', NULL);

INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
VALUES (
	'd2100000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000003',
	'd1000000-0000-4000-8000-000000000001',
	'user',
	'Frozen before admission',
	'{}'::jsonb
);

INSERT INTO public.agentic_chat_prepared_prompts (
	id, user_id, session_id, context_type, entity_id, project_id,
	context_payload, history_for_model, prepared_surfaces,
	default_surface_profile, context_payload_sha256, expires_at,
	conversation_summary
)
VALUES (
	'd3000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'global', NULL, NULL,
	'{"workspace":"trusted"}'::jsonb,
	'[{"role":"system","content":"prepared history"}]'::jsonb,
	'{"global_basic":{"surface_profile":"global_basic","system_prompt":"trusted system","sections":[{"id":"context","content_sha256":"abc","content_chars":12}]}}'::jsonb,
	'global_basic', repeat('b', 64), now() + interval '10 minutes', 'trusted summary'
);

INSERT INTO public.voice_note_groups (id, user_id, status)
VALUES
	(
		'd9000000-0000-4000-8000-000000000001',
		'd1000000-0000-4000-8000-000000000001',
		'draft'
	),
	(
		'd9000000-0000-4000-8000-000000000002',
		'd1000000-0000-4000-8000-000000000002',
		'draft'
	);

SET ROLE service_role;

-- A prepared-prompt admission commits all five durable identities together.
CREATE TEMP TABLE admission_results (name text PRIMARY KEY, result jsonb);
INSERT INTO admission_results VALUES (
	'prepared_new',
	public.test_create_agentic_chat_turn_with_job(
		'{
			"userId":"d1000000-0000-4000-8000-000000000001",
			"sessionId":"d2000000-0000-4000-8000-000000000001",
			"turnRunId":"d4000000-0000-4000-8000-000000000001",
			"userMessageId":"d5000000-0000-4000-8000-000000000001",
			"inputArtifactId":"d6000000-0000-4000-8000-000000000001",
			"transportDecisionId":"d7000000-0000-4000-8000-000000000001",
			"correlationId":"d8000000-0000-4000-8000-000000000001",
			"clientTurnId":"prepared-client-1",
			"streamRunId":"prepared-stream-1",
			"requestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"message":"Use prepared context",
			"messageMetadata":{"voice_note_group_id":"d9000000-0000-4000-8000-000000000001"},
			"historySource":"prepared_prompt",
			"artifactHistory":[{"sourceMessageId":null,"role":"system","content":"prepared history","attachments":[],"toolCalls":[],"toolCallId":null}],
			"artifactHistoryBytes":128,
			"artifactContentBytes":1024,
			"preparedPromptId":"d3000000-0000-4000-8000-000000000001",
			"preparedContextPayloadSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			"preparedSurfaceProfile":"global_basic",
			"artifactPrepared":{"sourcePreparedPromptId":"d3000000-0000-4000-8000-000000000001","contextPayload":{"workspace":"trusted"},"conversationSummary":"trusted summary","surfaceProfile":"global_basic","systemPrompt":"trusted system","promptSections":[{"id":"context","content_sha256":"abc","content_chars":12}],"toolSurface":{"names":[]}}
		}'::jsonb
	)
);

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'newly_admitted'
		AND result->>'status' = 'queued'
		AND NOT (result->>'execution_may_start')::boolean
	FROM admission_results WHERE name = 'prepared_new'),
	'new worker admission returned an invalid handle'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.chat_turn_runs WHERE id = 'd4000000-0000-4000-8000-000000000001') = 1
		AND (SELECT count(*) FROM public.chat_messages WHERE id = 'd5000000-0000-4000-8000-000000000001') = 1
		AND (SELECT count(*) FROM public.chat_turn_input_artifacts WHERE id = 'd6000000-0000-4000-8000-000000000001') = 1
		AND (SELECT count(*) FROM public.queue_jobs WHERE dedup_key = 'agentic-chat-turn:d4000000-0000-4000-8000-000000000001') = 1
		AND (SELECT consumed_at IS NOT NULL FROM public.agentic_chat_prepared_prompts WHERE id = 'd3000000-0000-4000-8000-000000000001'),
	'prepared admission did not commit exactly one turn/message/artifact/job/claim'
);
SELECT pg_temp.assert_true(
	(
		SELECT status = 'attached'
			AND linked_entity_type = 'chat_message'
			AND linked_entity_id = 'd5000000-0000-4000-8000-000000000001'
			AND chat_session_id = 'd2000000-0000-4000-8000-000000000001'
		FROM public.voice_note_groups
		WHERE id = 'd9000000-0000-4000-8000-000000000001'
	),
	'worker admission did not atomically attach the voice-note group'
);
INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
VALUES (
	'd5000000-0000-4000-8000-000000000002',
	'd2000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	'user',
	'Attempt to relink an attached voice note',
	'{"voice_note_group_id":"d9000000-0000-4000-8000-000000000001"}'::jsonb
);
SELECT pg_temp.assert_true(
	(
		SELECT linked_entity_id = 'd5000000-0000-4000-8000-000000000001'
		FROM public.voice_note_groups
		WHERE id = 'd9000000-0000-4000-8000-000000000001'
	),
	'an already attached voice-note group was relinked by later message metadata'
);
INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
VALUES (
	'd5f00000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001',
	'd1000000-0000-4000-8000-000000000001',
	'user',
	'Attempt to attach another user''s voice note',
	'{"voice_note_group_id":"d9000000-0000-4000-8000-000000000002"}'::jsonb
);
SELECT pg_temp.assert_true(
	(
		SELECT status = 'draft'
			AND linked_entity_id IS NULL
			AND chat_session_id IS NULL
		FROM public.voice_note_groups
		WHERE id = 'd9000000-0000-4000-8000-000000000002'
	),
	'a chat message attached a voice-note group owned by another user'
);
SELECT pg_temp.assert_true(
	(
		SELECT turns.status = 'queued'
			AND turns.execution_mode = 'worker_realtime'
			AND turns.execution_generation = 0
			AND turns.user_message_id = 'd5000000-0000-4000-8000-000000000001'
			AND turns.input_artifact_id = 'd6000000-0000-4000-8000-000000000001'
			AND turns.queue_job_id = jobs.id
			AND jobs.user_id = turns.user_id
			AND jobs.metadata->>'turnRunId' = turns.id::text
			AND jobs.metadata->>'correlationId' = turns.correlation_id::text
		FROM public.chat_turn_runs turns
		JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
		WHERE turns.id = 'd4000000-0000-4000-8000-000000000001'
	),
	'worker admission relationships are incomplete'
);

-- Duplicate lookup precedes pressure and the already-consumed prepared row.
INSERT INTO admission_results VALUES (
	'prepared_duplicate',
	public.test_create_agentic_chat_turn_with_job(
		'{
			"userId":"d1000000-0000-4000-8000-000000000001",
			"sessionId":"d2000000-0000-4000-8000-000000000001",
			"turnRunId":"d4000000-0000-4000-8000-000000000099",
			"userMessageId":"d5000000-0000-4000-8000-000000000099",
			"inputArtifactId":"d6000000-0000-4000-8000-000000000099",
			"transportDecisionId":"d7000000-0000-4000-8000-000000000099",
			"correlationId":"d8000000-0000-4000-8000-000000000099",
			"clientTurnId":"prepared-client-1",
			"streamRunId":"prepared-stream-1",
			"requestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"capacityAvailable":false
		}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'matching_duplicate'
		AND result->>'turn_run_id' = 'd4000000-0000-4000-8000-000000000001'
	FROM admission_results WHERE name = 'prepared_duplicate')
		AND (SELECT count(*) FROM public.chat_turn_runs WHERE client_turn_id = 'prepared-client-1') = 1,
	'duplicate did not resolve before pressure/prepared-input checks'
);

-- A different hash and a non-null wrong session are typed conflicts with no write.
INSERT INTO admission_results VALUES (
	'hash_conflict',
	public.test_create_agentic_chat_turn_with_job(
		'{"userId":"d1000000-0000-4000-8000-000000000001","sessionId":"d2000000-0000-4000-8000-000000000001","turnRunId":"d4000000-0000-4000-8000-000000000098","userMessageId":"d5000000-0000-4000-8000-000000000098","inputArtifactId":"d6000000-0000-4000-8000-000000000098","transportDecisionId":"d7000000-0000-4000-8000-000000000098","correlationId":"d8000000-0000-4000-8000-000000000098","clientTurnId":"prepared-client-1","requestHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}'::jsonb
	)
), (
	'session_conflict',
	public.test_create_agentic_chat_turn_with_job(
		'{"userId":"d1000000-0000-4000-8000-000000000001","sessionId":"d2000000-0000-4000-8000-000000000003","turnRunId":"d4000000-0000-4000-8000-000000000097","userMessageId":"d5000000-0000-4000-8000-000000000097","inputArtifactId":"d6000000-0000-4000-8000-000000000097","transportDecisionId":"d7000000-0000-4000-8000-000000000097","correlationId":"d8000000-0000-4000-8000-000000000097","clientTurnId":"prepared-client-1","requestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'idempotency_conflict' AND result->>'conflict_reason' = 'request_hash_mismatch' FROM admission_results WHERE name = 'hash_conflict')
		AND (SELECT result->>'outcome' = 'idempotency_conflict' AND result->>'conflict_reason' = 'session_mismatch' FROM admission_results WHERE name = 'session_conflict'),
	'idempotency conflicts were not typed deterministically'
);

-- Admission-window lineage is selected in the transaction and remains frozen.
INSERT INTO admission_results VALUES (
	'history_new',
	public.test_create_agentic_chat_turn_with_job(
		'{
			"userId":"d1000000-0000-4000-8000-000000000001",
			"sessionId":"d2000000-0000-4000-8000-000000000003",
			"turnRunId":"d4000000-0000-4000-8000-000000000003",
			"userMessageId":"d5000000-0000-4000-8000-000000000003",
			"inputArtifactId":"d6000000-0000-4000-8000-000000000003",
			"transportDecisionId":"d7000000-0000-4000-8000-000000000003",
			"correlationId":"d8000000-0000-4000-8000-000000000003",
			"clientTurnId":"history-client-3",
			"artifactHistory":[{"sourceMessageId":"d2100000-0000-4000-8000-000000000001","role":"user","content":"Frozen before admission","attachments":[],"toolCalls":[],"toolCallId":null}],
			"artifactHistoryBytes":180,
			"artifactContentBytes":512
		}'::jsonb
	)
);
UPDATE public.chat_messages
SET content = 'Source changed after admission'
WHERE id = 'd2100000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(
		SELECT turns.history_message_ids = ARRAY['d2100000-0000-4000-8000-000000000001'::uuid]
			AND artifact.history->0->>'content' = 'Frozen before admission'
			AND NOT (artifact.history @> '[{"content":"Source changed after admission"}]'::jsonb)
		FROM public.chat_turn_runs turns
		JOIN public.chat_turn_input_artifacts artifact ON artifact.id = turns.input_artifact_id
		WHERE turns.id = 'd4000000-0000-4000-8000-000000000003'
	),
	'source mutation changed or broke the frozen admission artifact'
);

-- The canonical daily-brief key protects the one context that intentionally
-- resolves by target, including races with the legacy pre-admission creator.
INSERT INTO public.chat_sessions (id, user_id, context_type, status, entity_id)
VALUES (
	'd2000000-0000-4000-8000-000000000060',
	'd1000000-0000-4000-8000-000000000002',
	'daily_brief',
	'active',
	'da000000-0000-4000-8000-000000000060'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_sessions (id, user_id, context_type, status, entity_id)
			VALUES (
				'd2000000-0000-4000-8000-000000000061',
				'd1000000-0000-4000-8000-000000000002',
				'daily_brief', 'active',
				'da000000-0000-4000-8000-000000000060'
			)
		$test$,
		'duplicate key value violates unique constraint'
	),
	'canonical daily-brief database key accepted a duplicate'
);
INSERT INTO admission_results VALUES (
	'daily_brief_resolved',
	public.test_create_agentic_chat_turn_with_job(
		'{"userId":"d1000000-0000-4000-8000-000000000002","turnRunId":"d4000000-0000-4000-8000-000000000060","userMessageId":"d5000000-0000-4000-8000-000000000060","inputArtifactId":"d6000000-0000-4000-8000-000000000060","transportDecisionId":"d7000000-0000-4000-8000-000000000060","correlationId":"d8000000-0000-4000-8000-000000000060","clientTurnId":"daily-brief-client-60","contextType":"daily_brief","entityId":"da000000-0000-4000-8000-000000000060","message":"daily canonical"}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'newly_admitted'
		AND result->>'session_id' = 'd2000000-0000-4000-8000-000000000060'
		AND NOT (result->>'session_created')::boolean
	FROM admission_results WHERE name = 'daily_brief_resolved'),
	'worker admission did not resolve the existing canonical daily-brief session'
);

-- Runtime pressure is operational metadata. It cannot reject a compatible
-- turn before the durable session/turn/message/artifact/job transaction.
CREATE TEMP TABLE pressure_counts AS
SELECT
	(SELECT count(*) FROM public.chat_sessions) AS sessions,
	(SELECT count(*) FROM public.chat_turn_runs) AS turns,
	(SELECT count(*) FROM public.chat_messages) AS messages,
	(SELECT count(*) FROM public.chat_turn_input_artifacts) AS artifacts,
	(SELECT count(*) FROM public.queue_jobs) AS jobs;
INSERT INTO admission_results VALUES (
	'pressure_queued',
	public.test_create_agentic_chat_turn_with_job(
		'{"userId":"d1000000-0000-4000-8000-000000000002","turnRunId":"d4000000-0000-4000-8000-000000000020","userMessageId":"d5000000-0000-4000-8000-000000000020","inputArtifactId":"d6000000-0000-4000-8000-000000000020","transportDecisionId":"d7000000-0000-4000-8000-000000000020","correlationId":"d8000000-0000-4000-8000-000000000020","clientTurnId":"pressure-client","capacityAvailable":false}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'newly_admitted'
		AND result->>'status' = 'queued'
		AND result->>'queue_job_id' IS NOT NULL
	 FROM admission_results WHERE name = 'pressure_queued')
		AND (SELECT (sessions + 1, turns + 1, messages + 1, artifacts + 1, jobs + 1) = (
			(SELECT count(*) FROM public.chat_sessions),
			(SELECT count(*) FROM public.chat_turn_runs),
			(SELECT count(*) FROM public.chat_messages),
			(SELECT count(*) FROM public.chat_turn_input_artifacts),
			(SELECT count(*) FROM public.queue_jobs)
		) FROM pressure_counts),
	'pressure-closed admission did not atomically enqueue every durable row'
);

-- A much higher emergency ceiling remains separate from the normal scaling
-- threshold. It protects one account from unbounded database growth.
INSERT INTO public.chat_sessions (id, user_id, context_type, status)
SELECT gen_random_uuid(), 'd1000000-0000-4000-8000-000000000003', 'global', 'active'
FROM generate_series(1, 100);
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, context_type,
	request_message, status, execution_mode
)
SELECT
	gen_random_uuid(), sessions.id, sessions.user_id,
	'capacity-stream-' || row_number() OVER (),
	'capacity-client-' || row_number() OVER (),
	'global', 'capacity fixture', 'queued', 'worker_realtime'
FROM public.chat_sessions sessions
WHERE sessions.user_id = 'd1000000-0000-4000-8000-000000000003';
INSERT INTO admission_results VALUES (
	'hard_cap_rejected',
	public.test_create_agentic_chat_turn_with_job(
		'{"userId":"d1000000-0000-4000-8000-000000000003","turnRunId":"d4000000-0000-4000-8000-000000000030","userMessageId":"d5000000-0000-4000-8000-000000000030","inputArtifactId":"d6000000-0000-4000-8000-000000000030","transportDecisionId":"d7000000-0000-4000-8000-000000000030","correlationId":"d8000000-0000-4000-8000-000000000030","clientTurnId":"hard-cap-client"}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'capacity_exceeded'
		AND result->>'capacity_reason' = 'max_queued'
		AND (result->>'queued_count')::integer = 100
	FROM admission_results WHERE name = 'hard_cap_rejected'),
	'database emergency max_queued=100 cap was not enforced'
);

-- A legacy turn with the same semantic identity is returned as the stored mode;
-- worker admission never creates a competing transport.
INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES ('d2000000-0000-4000-8000-000000000040', 'd1000000-0000-4000-8000-000000000004', 'global', 'active');
INSERT INTO public.chat_messages (id, session_id, user_id, role, content)
VALUES ('d5000000-0000-4000-8000-000000000040', 'd2000000-0000-4000-8000-000000000040', 'd1000000-0000-4000-8000-000000000004', 'user', 'legacy winner');
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, context_type,
	request_message, status, request_hash, request_hash_version, execution_mode,
	user_message_id
)
VALUES (
	'd4000000-0000-4000-8000-000000000040',
	'd2000000-0000-4000-8000-000000000040',
	'd1000000-0000-4000-8000-000000000004',
	'legacy-stream-40', 'legacy-client-40', 'global', 'legacy winner', 'running',
	repeat('e', 64), 'agentic_chat_request_hash_v2', 'legacy_sse',
	'd5000000-0000-4000-8000-000000000040'
);
INSERT INTO admission_results VALUES (
	'legacy_duplicate',
	public.test_create_agentic_chat_turn_with_job(
		'{"userId":"d1000000-0000-4000-8000-000000000004","sessionId":"d2000000-0000-4000-8000-000000000040","turnRunId":"d4000000-0000-4000-8000-000000000041","userMessageId":"d5000000-0000-4000-8000-000000000041","inputArtifactId":"d6000000-0000-4000-8000-000000000041","transportDecisionId":"d7000000-0000-4000-8000-000000000041","correlationId":"d8000000-0000-4000-8000-000000000041","clientTurnId":"legacy-client-40","streamRunId":"legacy-stream-40","requestHash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}'::jsonb
	)
);
SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'matching_duplicate'
		AND result->>'execution_mode' = 'legacy_sse'
		AND result->>'turn_run_id' = 'd4000000-0000-4000-8000-000000000040'
	FROM admission_results WHERE name = 'legacy_duplicate'),
	'worker admission did not converge on the stored legacy mode'
);

RESET ROLE;

-- Signed-claim checks prevent a SECURITY DEFINER wrapper from laundering an
-- authenticated request through the service-owned function.
CREATE OR REPLACE FUNCTION public.test_worker_admission_wrapper(p jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.test_create_agentic_chat_turn_with_job(p)
$$;
GRANT EXECUTE ON FUNCTION public.test_worker_admission_wrapper(jsonb) TO authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$SELECT public.test_worker_admission_wrapper('{"userId":"d1000000-0000-4000-8000-000000000002","turnRunId":"d4000000-0000-4000-8000-000000000090","userMessageId":"d5000000-0000-4000-8000-000000000090","inputArtifactId":"d6000000-0000-4000-8000-000000000090","transportDecisionId":"d7000000-0000-4000-8000-000000000090","correlationId":"d8000000-0000-4000-8000-000000000090"}'::jsonb)$test$,
		'agentic_chat_admission_service_role_required'
	),
	'definer wrapper bypassed the admission request-role check'
);
RESET ROLE;
RESET request.jwt.claims;

-- Concurrent create-inline duplicates serialize on the shared per-user lock.
CREATE OR REPLACE FUNCTION public.test_pause_worker_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.id = 'd4000000-0000-4000-8000-000000000050' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER test_pause_worker_admission
BEFORE INSERT ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_pause_worker_admission();

SELECT dblink_connect('worker_admit_a', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
SELECT dblink_connect('worker_admit_b', format('dbname=%L host=%L port=%L', current_database(), current_setting('unix_socket_directories'), current_setting('port')));

SELECT dblink_send_query('worker_admit_a', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.test_create_agentic_chat_turn_with_job(
		'{"userId":"d1000000-0000-4000-8000-000000000002","turnRunId":"d4000000-0000-4000-8000-000000000050","userMessageId":"d5000000-0000-4000-8000-000000000050","inputArtifactId":"d6000000-0000-4000-8000-000000000050","transportDecisionId":"d7000000-0000-4000-8000-000000000050","correlationId":"d8000000-0000-4000-8000-000000000050","clientTurnId":"concurrent-inline-50","streamRunId":"concurrent-inline-stream-50"}'::jsonb
	) FROM trusted
$query$);
SELECT dblink_send_query('worker_admit_b', $query$
	WITH trusted AS MATERIALIZED (SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false))
	SELECT public.test_create_agentic_chat_turn_with_job(
		'{"userId":"d1000000-0000-4000-8000-000000000002","turnRunId":"d4000000-0000-4000-8000-000000000051","userMessageId":"d5000000-0000-4000-8000-000000000051","inputArtifactId":"d6000000-0000-4000-8000-000000000051","transportDecisionId":"d7000000-0000-4000-8000-000000000051","correlationId":"d8000000-0000-4000-8000-000000000051","clientTurnId":"concurrent-inline-50","streamRunId":"concurrent-inline-stream-50"}'::jsonb
	) FROM trusted
$query$);

CREATE TEMP TABLE concurrent_admission_results (result jsonb);
INSERT INTO concurrent_admission_results
SELECT result FROM dblink_get_result('worker_admit_a', false) AS response(result jsonb);
INSERT INTO concurrent_admission_results
SELECT result FROM dblink_get_result('worker_admit_b', false) AS response(result jsonb);

SELECT pg_temp.assert_true(
	(SELECT count(*) FROM concurrent_admission_results WHERE result->>'outcome' = 'newly_admitted') = 1
		AND (SELECT count(*) FROM concurrent_admission_results WHERE result->>'outcome' = 'matching_duplicate') = 1
		AND (SELECT count(DISTINCT result->>'session_id') FROM concurrent_admission_results) = 1
		AND (SELECT count(*) FROM public.chat_turn_runs WHERE client_turn_id = 'concurrent-inline-50') = 1
		AND (
			SELECT count(*)
			FROM public.chat_messages
			WHERE id = (
				SELECT (result->>'user_message_id')::uuid
				FROM concurrent_admission_results
				WHERE result->>'outcome' = 'newly_admitted'
			)
		) = 1,
	format(
		'concurrent inline duplicate did not produce one session/turn/message winner: results=%s sessions=%s turns=%s messages=%s',
		(SELECT jsonb_agg(result) FROM concurrent_admission_results),
		(SELECT count(DISTINCT result->>'session_id') FROM concurrent_admission_results),
		(SELECT count(*) FROM public.chat_turn_runs WHERE client_turn_id = 'concurrent-inline-50'),
		(
			SELECT count(*)
			FROM public.chat_messages
			WHERE id = (
				SELECT (result->>'user_message_id')::uuid
				FROM concurrent_admission_results
				WHERE result->>'outcome' = 'newly_admitted'
			)
		)
	)
);

SELECT dblink_disconnect('worker_admit_a');
SELECT dblink_disconnect('worker_admit_b');
DROP TRIGGER test_pause_worker_admission ON public.chat_turn_runs;
DROP FUNCTION public.test_pause_worker_admission();

-- Package-only rollback leaves all earlier Phase 2B/2A/legacy objects intact.
BEGIN;
DROP INDEX public.uq_chat_sessions_active_daily_brief_context;
DROP FUNCTION public.create_agentic_chat_turn_with_job(
	uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid,
	text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer,
	text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean
);
SELECT pg_temp.assert_true(
	to_regprocedure('public.create_agentic_chat_turn_with_job(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,uuid,uuid,text,boolean,text,jsonb,text,text,jsonb,integer,text,jsonb,jsonb,text,integer,integer,uuid,text,text,jsonb,boolean)') IS NULL
		AND to_regclass('public.uq_chat_sessions_active_daily_brief_context') IS NULL
		AND to_regprocedure('public.reserve_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,text,boolean,text)') IS NOT NULL
		AND to_regclass('public.chat_turn_input_artifacts') IS NOT NULL
		AND to_regprocedure('public.admit_legacy_agentic_chat_turn(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,boolean,text,timestamptz,text,jsonb,integer,integer,integer,integer)') IS NOT NULL,
	'admission rollback removed or depended on an earlier package'
);
ROLLBACK;

SELECT pg_temp.assert_true(
	to_regprocedure('public.create_agentic_chat_turn_with_job(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,uuid,uuid,text,boolean,text,jsonb,text,text,jsonb,integer,text,jsonb,jsonb,text,integer,integer,uuid,text,text,jsonb,boolean)') IS NOT NULL
		AND to_regclass('public.uq_chat_sessions_active_daily_brief_context') IS NOT NULL,
	'admission rollback proof did not restore the disposable transaction'
);

DROP FUNCTION public.test_worker_admission_wrapper(jsonb);
DROP FUNCTION public.test_create_agentic_chat_turn_with_job(jsonb);

SELECT 'phase2b_atomic_admission_ok' AS result;
