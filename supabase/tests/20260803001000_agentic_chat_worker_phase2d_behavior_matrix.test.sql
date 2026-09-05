-- supabase/tests/20260803001000_agentic_chat_worker_phase2d_behavior_matrix.test.sql
-- Composed disposable PostgreSQL proof for the remaining Phase 2D ordering and
-- immutable-input retention matrix.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS dblink;

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

-- A JSON-only test adapter keeps the composed proof readable while preserving
-- the exact production RPC signature and validation boundary.
CREATE OR REPLACE FUNCTION public.test_phase2d_admit_turn(p jsonb)
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

REVOKE ALL ON FUNCTION public.test_phase2d_admit_turn(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_phase2d_admit_turn(jsonb)
	TO service_role;

INSERT INTO public.users (id)
VALUES
	('b1000000-0000-4000-8000-000000000001'),
	('b1000000-0000-4000-8000-000000000010');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	(
		'b2000000-0000-4000-8000-000000000001',
		'b1000000-0000-4000-8000-000000000001',
		'global', 'active'
	),
	(
		'b2000000-0000-4000-8000-000000000010',
		'b1000000-0000-4000-8000-000000000010',
		'global', 'active'
	);

INSERT INTO public.agentic_chat_prepared_prompts (
	id, user_id, session_id, context_type, entity_id, project_id,
	context_payload, history_for_model, prepared_surfaces,
	default_surface_profile, context_payload_sha256, expires_at,
	conversation_summary
)
VALUES (
	'b3000000-0000-4000-8000-000000000001',
	'b1000000-0000-4000-8000-000000000001',
	'b2000000-0000-4000-8000-000000000001',
	'global', NULL, NULL,
	'{"workspace":"retained"}'::jsonb,
	'[{"role":"system","content":"prepared history"}]'::jsonb,
	'{"global_basic":{"surface_profile":"global_basic","system_prompt":"retained system","system_prompt_sha256":"1decc6f47eeaf6c057772cfcbf457a77322652ddcbd9e118ea9a77ab93167c6c","sections":[{"id":"context","content_sha256":"abc","content_chars":16}]}}'::jsonb,
	'global_basic', repeat('b', 64), now() + interval '10 minutes',
	'retained summary'
);

CREATE TEMP TABLE phase2d_results (name text PRIMARY KEY, result jsonb);
GRANT SELECT, INSERT, UPDATE, DELETE ON phase2d_results TO service_role;

SET LOCAL ROLE service_role;

-- Admit from a short-lived prepared prompt, then let normal cleanup remove the
-- cache row before any worker owns the turn.
INSERT INTO phase2d_results VALUES (
	'prepared_admission',
	public.test_phase2d_admit_turn(
		'{
			"userId":"b1000000-0000-4000-8000-000000000001",
			"sessionId":"b2000000-0000-4000-8000-000000000001",
			"turnRunId":"b4000000-0000-4000-8000-000000000001",
			"userMessageId":"b5000000-0000-4000-8000-000000000001",
			"inputArtifactId":"b6000000-0000-4000-8000-000000000001",
			"transportDecisionId":"b7000000-0000-4000-8000-000000000001",
			"correlationId":"b8000000-0000-4000-8000-000000000001",
			"clientTurnId":"phase2d-prepared-client-1",
			"streamRunId":"phase2d-prepared-stream-1",
			"message":"Use retained prepared input",
			"historySource":"prepared_prompt",
			"artifactHistory":[{"sourceMessageId":null,"role":"system","content":"prepared history","attachments":[],"toolCalls":[],"toolCallId":null}],
			"artifactHistoryBytes":128,
			"artifactContentBytes":1024,
			"artifactContentHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
			"preparedPromptId":"b3000000-0000-4000-8000-000000000001",
			"preparedContextPayloadSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			"preparedSurfaceProfile":"global_basic",
			"artifactPrepared":{"sourcePreparedPromptId":"b3000000-0000-4000-8000-000000000001","sourcePreparedSurface":{"systemPromptSha256":"1decc6f47eeaf6c057772cfcbf457a77322652ddcbd9e118ea9a77ab93167c6c","promptSections":[{"id":"context","content_sha256":"abc","content_chars":16}]},"contextPayload":{"workspace":"retained"},"conversationSummary":"retained summary","surfaceProfile":"global_basic","systemPrompt":"retained system","promptSections":[{"id":"context","content_sha256":"abc","content_chars":16}],"toolSurface":{"names":[]}}
		}'::jsonb
	)
);

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'newly_admitted'
	 FROM phase2d_results WHERE name = 'prepared_admission'),
	'prepared fixture was not admitted'
);

UPDATE public.agentic_chat_prepared_prompts
SET consumed_at = now() - interval '11 minutes',
	updated_at = now() - interval '11 minutes'
WHERE id = 'b3000000-0000-4000-8000-000000000001';

INSERT INTO phase2d_results VALUES (
	'prepared_cleanup',
	jsonb_build_object(
		'deleted', public.cleanup_expired_agentic_chat_prepared_prompts()
	)
);

SELECT pg_temp.assert_true(
	(SELECT (result->>'deleted')::integer = 1
	 FROM phase2d_results WHERE name = 'prepared_cleanup')
		AND NOT EXISTS (
			SELECT 1 FROM public.agentic_chat_prepared_prompts
			WHERE id = 'b3000000-0000-4000-8000-000000000001'
		)
		AND (
			SELECT turns.input_artifact_id = artifacts.id
				AND turns.prepared_prompt_id IS NULL
				AND artifacts.source_prepared_prompt_id
					= 'b3000000-0000-4000-8000-000000000001'
				AND artifacts.content_hash
					= 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
				AND artifacts.history->0->>'content' = 'prepared history'
			FROM public.chat_turn_runs turns
			JOIN public.chat_turn_input_artifacts artifacts
				ON artifacts.id = turns.input_artifact_id
			WHERE turns.id = 'b4000000-0000-4000-8000-000000000001'
		),
	'prepared cache cleanup removed or changed the retained turn input'
);

-- Generic queue ownership, domain claim, and the immediate provider-start
-- fence all succeed using only the retained artifact after cleanup.
UPDATE public.queue_jobs jobs
SET status = 'processing',
	processing_token = 'b9000000-0000-4000-8000-000000000001',
	started_at = now(),
	updated_at = now()
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000001'
	AND jobs.id = turns.queue_job_id;

INSERT INTO phase2d_results
SELECT 'prepared_claim', public.claim_agentic_chat_turn(
	turns.id,
	turns.queue_job_id,
	'b9000000-0000-4000-8000-000000000001'
)
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000001';

INSERT INTO phase2d_results
SELECT 'prepared_start', public.begin_agentic_chat_turn_execution(
	turns.id,
	turns.queue_job_id,
	'b9000000-0000-4000-8000-000000000001',
	1
)
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'claimed'
	 FROM phase2d_results WHERE name = 'prepared_claim')
		AND (SELECT result->>'outcome' = 'started'
			AND (result->>'invoke_provider')::boolean
			FROM phase2d_results WHERE name = 'prepared_start'),
	'prepared cleanup made the retained turn non-executable'
);

-- A replacement request is rejected both before and after a supersede signal.
-- This models a provider that has already started and ignores abort: cancellation
-- acknowledgement alone never releases the one-active-turn session invariant.
INSERT INTO phase2d_results VALUES (
	'replacement_before_cancel',
	public.test_phase2d_admit_turn(
		'{"userId":"b1000000-0000-4000-8000-000000000001","sessionId":"b2000000-0000-4000-8000-000000000001","turnRunId":"b4000000-0000-4000-8000-000000000002","userMessageId":"b5000000-0000-4000-8000-000000000002","inputArtifactId":"b6000000-0000-4000-8000-000000000002","transportDecisionId":"b7000000-0000-4000-8000-000000000002","correlationId":"b8000000-0000-4000-8000-000000000002","clientTurnId":"phase2d-replacement-client-2","streamRunId":"phase2d-replacement-stream-2","message":"Replacement"}'::jsonb
	)
);

INSERT INTO phase2d_results VALUES (
	'supersede_requested',
	public.request_agentic_chat_turn_cancel(
		'b4000000-0000-4000-8000-000000000001',
		'b1000000-0000-4000-8000-000000000001',
		'superseded',
		'browser'
	)
);

INSERT INTO phase2d_results VALUES (
	'replacement_before_terminal',
	public.test_phase2d_admit_turn(
		'{"userId":"b1000000-0000-4000-8000-000000000001","sessionId":"b2000000-0000-4000-8000-000000000001","turnRunId":"b4000000-0000-4000-8000-000000000002","userMessageId":"b5000000-0000-4000-8000-000000000002","inputArtifactId":"b6000000-0000-4000-8000-000000000002","transportDecisionId":"b7000000-0000-4000-8000-000000000002","correlationId":"b8000000-0000-4000-8000-000000000002","clientTurnId":"phase2d-replacement-client-2","streamRunId":"phase2d-replacement-stream-2","message":"Replacement"}'::jsonb
	)
);

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'active_turn_conflict'
	 FROM phase2d_results WHERE name = 'replacement_before_cancel')
		AND (SELECT result->>'outcome' = 'cancel_requested'
			AND result->>'status' = 'running'
			AND result->>'cancel_reason' = 'superseded'
			FROM phase2d_results WHERE name = 'supersede_requested')
		AND (SELECT result->>'outcome' = 'active_turn_conflict'
			FROM phase2d_results WHERE name = 'replacement_before_terminal')
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_turn_runs
			WHERE id = 'b4000000-0000-4000-8000-000000000002'
		)
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_messages
			WHERE id = 'b5000000-0000-4000-8000-000000000002'
		)
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_turn_input_artifacts
			WHERE id = 'b6000000-0000-4000-8000-000000000002'
		),
	'supersede acknowledgement admitted a replacement before durable terminal truth'
);

INSERT INTO phase2d_results
SELECT 'superseded_terminal', public.finalize_agentic_chat_turn(
	turns.id,
	turns.user_id,
	turns.queue_job_id,
	'b9000000-0000-4000-8000-000000000001',
	1,
	'cancelled',
	'superseded',
	NULL,
	NULL,
	'',
	'{}'::jsonb,
	NULL, NULL, NULL,
	'{}'::jsonb,
	'{"cancel_reason":"superseded","provider_ignored_abort":true}'::jsonb
)
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000001';

INSERT INTO phase2d_results VALUES (
	'replacement_after_terminal',
	public.test_phase2d_admit_turn(
		'{"userId":"b1000000-0000-4000-8000-000000000001","sessionId":"b2000000-0000-4000-8000-000000000001","turnRunId":"b4000000-0000-4000-8000-000000000002","userMessageId":"b5000000-0000-4000-8000-000000000002","inputArtifactId":"b6000000-0000-4000-8000-000000000002","transportDecisionId":"b7000000-0000-4000-8000-000000000002","correlationId":"b8000000-0000-4000-8000-000000000002","clientTurnId":"phase2d-replacement-client-2","streamRunId":"phase2d-replacement-stream-2","message":"Replacement"}'::jsonb
	)
);

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'finalized'
		AND result->>'status' = 'cancelled'
	 FROM phase2d_results WHERE name = 'superseded_terminal')
		AND (SELECT result->>'outcome' = 'newly_admitted'
			AND result->>'status' = 'queued'
			FROM phase2d_results WHERE name = 'replacement_after_terminal')
		AND (SELECT status = 'cancelled' AND terminal_event_id IS NOT NULL
			FROM public.chat_turn_runs
			WHERE id = 'b4000000-0000-4000-8000-000000000001')
		AND (SELECT count(*) = 1 FROM public.chat_turn_runs
			WHERE id = 'b4000000-0000-4000-8000-000000000002')
		AND (SELECT count(*) = 1 FROM public.chat_messages
			WHERE id = 'b5000000-0000-4000-8000-000000000002')
		AND (SELECT count(*) = 1 FROM public.chat_turn_input_artifacts
			WHERE id = 'b6000000-0000-4000-8000-000000000002'),
	'replacement did not wait for and then follow durable terminal truth'
);

-- A separate turn freezes source-backed history, survives mutation/deletion of
-- that source, safely requeues before provider start, and begins generation 2
-- with the exact same retained artifact.
RESET ROLE;
INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
VALUES (
	'b2100000-0000-4000-8000-000000000010',
	'b2000000-0000-4000-8000-000000000010',
	'b1000000-0000-4000-8000-000000000010',
	'user',
	'Frozen before admission',
	'{}'::jsonb
);
SET LOCAL ROLE service_role;

INSERT INTO phase2d_results VALUES (
	'history_admission',
	public.test_phase2d_admit_turn(
		'{
			"userId":"b1000000-0000-4000-8000-000000000010",
			"sessionId":"b2000000-0000-4000-8000-000000000010",
			"turnRunId":"b4000000-0000-4000-8000-000000000010",
			"userMessageId":"b5000000-0000-4000-8000-000000000010",
			"inputArtifactId":"b6000000-0000-4000-8000-000000000010",
			"transportDecisionId":"b7000000-0000-4000-8000-000000000010",
			"correlationId":"b8000000-0000-4000-8000-000000000010",
			"clientTurnId":"phase2d-history-client-10",
			"streamRunId":"phase2d-history-stream-10",
			"message":"Use immutable history",
			"artifactHistory":[{"sourceMessageId":"b2100000-0000-4000-8000-000000000010","role":"user","content":"Frozen before admission","attachments":[],"toolCalls":[],"toolCallId":null}],
			"artifactHistoryBytes":180,
			"artifactContentBytes":512,
			"artifactContentHash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
		}'::jsonb
	)
);

UPDATE public.chat_messages
SET content = 'Mutated after admission'
WHERE id = 'b2100000-0000-4000-8000-000000000010';

SELECT pg_temp.assert_true(
	(
		SELECT turns.history_message_ids
				= ARRAY['b2100000-0000-4000-8000-000000000010'::uuid]
			AND artifacts.history->0->>'content' = 'Frozen before admission'
			AND artifacts.content_hash
				= 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
		FROM public.chat_turn_runs turns
		JOIN public.chat_turn_input_artifacts artifacts
			ON artifacts.id = turns.input_artifact_id
		WHERE turns.id = 'b4000000-0000-4000-8000-000000000010'
	),
	'source history edit changed the retained artifact'
);

DELETE FROM public.chat_messages
WHERE id = 'b2100000-0000-4000-8000-000000000010';

UPDATE public.queue_jobs jobs
SET status = 'processing',
	processing_token = 'b9000000-0000-4000-8000-000000000010',
	started_at = now(),
	updated_at = now()
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000010'
	AND jobs.id = turns.queue_job_id;

INSERT INTO phase2d_results
SELECT 'history_claim_generation_1', public.claim_agentic_chat_turn(
	turns.id,
	turns.queue_job_id,
	'b9000000-0000-4000-8000-000000000010'
)
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000010';

INSERT INTO phase2d_results
SELECT 'history_requeue', public.recover_agentic_chat_turn(
	turns.id,
	turns.queue_job_id,
	'b9000000-0000-4000-8000-000000000010',
	1,
	'transient_infra',
	'fixture retry before provider start'
)
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000010';

UPDATE public.queue_jobs jobs
SET status = 'processing',
	processing_token = 'b9000000-0000-4000-8000-000000000011',
	started_at = now(),
	updated_at = now()
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000010'
	AND jobs.id = turns.queue_job_id;

INSERT INTO phase2d_results
SELECT 'history_claim_generation_2', public.claim_agentic_chat_turn(
	turns.id,
	turns.queue_job_id,
	'b9000000-0000-4000-8000-000000000011'
)
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000010';

INSERT INTO phase2d_results
SELECT 'history_start_generation_2', public.begin_agentic_chat_turn_execution(
	turns.id,
	turns.queue_job_id,
	'b9000000-0000-4000-8000-000000000011',
	2
)
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000010';

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'claimed'
		AND (result->>'execution_generation')::integer = 1
	 FROM phase2d_results WHERE name = 'history_claim_generation_1')
		AND (SELECT result->>'outcome' = 'retry_scheduled'
			AND (result->>'execution_may_retry')::boolean
			FROM phase2d_results WHERE name = 'history_requeue')
		AND (SELECT result->>'outcome' = 'claimed'
			AND (result->>'execution_generation')::integer = 2
			FROM phase2d_results WHERE name = 'history_claim_generation_2')
		AND (SELECT result->>'outcome' = 'started'
			AND (result->>'invoke_provider')::boolean
			AND (result->>'execution_generation')::integer = 2
			FROM phase2d_results WHERE name = 'history_start_generation_2')
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_messages
			WHERE id = 'b2100000-0000-4000-8000-000000000010'
		)
		AND (
			SELECT turns.execution_generation = 2
				AND turns.input_artifact_id
					= 'b6000000-0000-4000-8000-000000000010'
				AND artifacts.history->0->>'content' = 'Frozen before admission'
				AND artifacts.content_hash
					= 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
			FROM public.chat_turn_runs turns
			JOIN public.chat_turn_input_artifacts artifacts
				ON artifacts.id = turns.input_artifact_id
			WHERE turns.id = 'b4000000-0000-4000-8000-000000000010'
		),
	'retry generation did not reuse the immutable admitted history after source deletion'
);

RESET ROLE;
COMMIT;

-- The start-before-cancel branch above authorized exactly one provider. Run the
-- inverse interleaving with two real scheduler connections: cancellation wins
-- the turn lock while execution-start waits, so the late scheduler receives no
-- provider authority and cannot create any durable output.
UPDATE public.queue_jobs jobs
SET status = 'processing',
	processing_token = 'b9000000-0000-4000-8000-000000000002',
	started_at = now(),
	updated_at = now()
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000002'
	AND jobs.id = turns.queue_job_id;

SET ROLE service_role;
INSERT INTO phase2d_results
SELECT 'cancel_first_claim', public.claim_agentic_chat_turn(
	turns.id,
	turns.queue_job_id,
	'b9000000-0000-4000-8000-000000000002'
)
FROM public.chat_turn_runs turns
WHERE turns.id = 'b4000000-0000-4000-8000-000000000002';
RESET ROLE;

CREATE OR REPLACE FUNCTION public.test_phase2d_pause_cancel_first()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.id = 'b4000000-0000-4000-8000-000000000002'
		AND OLD.cancel_requested_at IS NULL
		AND NEW.cancel_requested_at IS NOT NULL THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_phase2d_pause_cancel_first
BEFORE UPDATE ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_phase2d_pause_cancel_first();

SELECT dblink_connect('phase2d_cancel_first_cancel', format(
	'dbname=%L host=%L port=%L',
	current_database(),
	current_setting('unix_socket_directories'),
	current_setting('port')
));
SELECT dblink_connect('phase2d_cancel_first_start', format(
	'dbname=%L host=%L port=%L',
	current_database(),
	current_setting('unix_socket_directories'),
	current_setting('port')
));

SELECT dblink_send_query('phase2d_cancel_first_cancel', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.request_agentic_chat_turn_cancel(
		'b4000000-0000-4000-8000-000000000002',
		'b1000000-0000-4000-8000-000000000001',
		'user_cancelled',
		'browser'
	) FROM trusted
$query$);
SELECT pg_sleep(0.1);
SELECT dblink_send_query('phase2d_cancel_first_start', $query$
	WITH trusted AS MATERIALIZED (
		SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
	)
	SELECT public.begin_agentic_chat_turn_execution(
		'b4000000-0000-4000-8000-000000000002',
		(
			SELECT queue_job_id FROM public.chat_turn_runs
			WHERE id = 'b4000000-0000-4000-8000-000000000002'
		),
		'b9000000-0000-4000-8000-000000000002',
		1
	) FROM trusted
$query$);

INSERT INTO phase2d_results
SELECT 'cancel_first_cancel', result
FROM dblink_get_result('phase2d_cancel_first_cancel', false)
	AS response(result jsonb);
INSERT INTO phase2d_results
SELECT 'cancel_first_start', result
FROM dblink_get_result('phase2d_cancel_first_start', false)
	AS response(result jsonb);

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'claimed'
		AND (result->>'execution_generation')::integer = 1
	 FROM phase2d_results WHERE name = 'cancel_first_claim')
		AND (SELECT result->>'outcome' = 'cancel_requested'
			FROM phase2d_results WHERE name = 'cancel_first_cancel')
		AND (SELECT result->>'outcome' = 'cancel_requested'
			AND NOT (result->>'invoke_provider')::boolean
			FROM phase2d_results WHERE name = 'cancel_first_start')
		AND (
			SELECT status = 'running'
				AND cancel_requested_at IS NOT NULL
				AND execution_started_at IS NULL
			FROM public.chat_turn_runs
			WHERE id = 'b4000000-0000-4000-8000-000000000002'
		)
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_turn_events
			WHERE turn_run_id = 'b4000000-0000-4000-8000-000000000002'
		)
		AND NOT EXISTS (
			SELECT 1 FROM public.chat_messages
			WHERE metadata->>'turn_run_id'
				= 'b4000000-0000-4000-8000-000000000002'
				AND role = 'assistant'
		),
	'cancel-first scheduler race granted provider start or persisted output'
);

SELECT dblink_disconnect('phase2d_cancel_first_cancel');
SELECT dblink_disconnect('phase2d_cancel_first_start');
DROP TRIGGER test_phase2d_pause_cancel_first ON public.chat_turn_runs;
DROP FUNCTION public.test_phase2d_pause_cancel_first();

SELECT 'phase2d_behavior_matrix_ok' AS result;
