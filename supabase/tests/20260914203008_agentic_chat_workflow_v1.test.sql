-- supabase/tests/20260914203008_agentic_chat_workflow_v1.test.sql
-- Tasker 85 workflow v1 contract: raw v4 admission through the real artifact
-- triggers, fenced context/plan/step checkpoints, the physical dispatch ledger,
-- durable answer cursor, read-only recovery, terminal sync, retention, grants,
-- and unchanged v2/v3 prepared admission. Races and TS/SQL byte equality live in
-- apps/worker/tests/agenticChatWorkflowV1.postgres.test.ts.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

\ir fixtures/agentic_chat_workflow_v1_base.sql
\ir ../migrations/20260914203007_agentic_chat_workflow_v1_storage.sql
\ir ../migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql

SET client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_label text, p_receipt jsonb, p_outcome text)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
	IF p_receipt->>'outcome' IS DISTINCT FROM p_outcome THEN
		RAISE EXCEPTION 'assertion_failed: % expected % got %', p_label, p_outcome, p_receipt;
	END IF;
	RETURN p_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_label text, p_sql text, p_needle text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
	EXCEPTION WHEN OTHERS THEN
		IF position(p_needle IN SQLERRM) = 0 THEN
			RAISE EXCEPTION 'assertion_failed: % expected error % got %', p_label, p_needle, SQLERRM;
		END IF;
		RETURN;
	END;
	RAISE EXCEPTION 'assertion_failed: % expected error % but it succeeded', p_label, p_needle;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_prefix text, p_n integer)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
	SELECT (p_prefix || '000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

CREATE OR REPLACE FUNCTION pg_temp.proj(p_phase text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
	SELECT jsonb_build_object('workflow', jsonb_build_object(
		'version', 'agentic_chat_workflow_projection_v1', 'phase', p_phase))
$$;

CREATE OR REPLACE FUNCTION pg_temp.evt(p_phase text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
	SELECT jsonb_build_object('type', 'workflow_progress', 'workflow', jsonb_build_object(
		'version', 'agentic_chat_workflow_projection_v1', 'phase', p_phase))
$$;

CREATE OR REPLACE FUNCTION pg_temp.pricing(p_prompt_rate text DEFAULT '0.27')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
	SELECT jsonb_build_object(
		'version', 'agentic_chat_workflow_pricing_v1',
		'model', 'deepseek/deepseek-v4-flash',
		'canonicalModel', 'deepseek/deepseek-v4-flash-20260801',
		'promptUsdPerMillion', p_prompt_rate,
		'completionUsdPerMillion', '1.1',
		'cacheReadUsdPerMillion', '0.0055',
		'requestUsd', '0',
		'source', 'openrouter_models_api',
		'observedAt', '2026-09-14T12:00:00Z'
	)
$$;

CREATE OR REPLACE FUNCTION pg_temp.report(p_role text, p_evidence_id text DEFAULT 'task-1')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
	SELECT jsonb_build_object(
		'version', 'chat_workflow_role_report_v1',
		'role', p_role,
		'summary', 'The venue gates the launch.',
		'findings', jsonb_build_array(jsonb_build_object(
			'claim', 'The venue is not booked.',
			'basis', 'recorded',
			'evidence', jsonb_build_array(jsonb_build_object(
				'kind', 'project_record', 'id', p_evidence_id, 'version', 'v1', 'label', 'Book venue'))
		)),
		'risks', '[]'::jsonb,
		'unknowns', '[]'::jsonb,
		'recommendation', 'Book the venue.',
		'unsupportedReferences', 0,
		'unsupportedFindings', 0
	)
$$;

CREATE OR REPLACE FUNCTION pg_temp.h(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
	SELECT public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(p_value))
$$;

CREATE OR REPLACE FUNCTION pg_temp.b(p_value jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
	SELECT octet_length(public.agentic_chat_canonical_json_v1(p_value))
$$;

CREATE OR REPLACE FUNCTION pg_temp.planner_result()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
	SELECT '{"version":"agentic_chat_workflow_planner_result_v1","assignments":{"project_analyst":{"focus":"next actions"},"risk_reviewer":{"focus":"risks"}}}'::jsonb
$$;

CREATE OR REPLACE FUNCTION pg_temp.plan(
	p_n integer,
	p_request_hash text,
	p_planner_accepted boolean
)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
	SELECT jsonb_build_object(
		'version', 'agentic_chat_project_review_plan_v1',
		'contextId', pg_temp.id('d0', p_n),
		'requestHash', p_request_hash,
		'planner', CASE WHEN p_planner_accepted
			THEN jsonb_build_object('outcome', 'accepted', 'stepAttemptId', pg_temp.id('d1', p_n),
				'resultHash', pg_temp.h(pg_temp.planner_result()))
			ELSE jsonb_build_object('outcome', 'fixed_fallback', 'stepAttemptId', NULL, 'resultHash', NULL)
		END,
		'steps', public.agentic_chat_workflow_plan_steps_v1(),
		'assignments', jsonb_build_object(
			'planner', '{}'::jsonb,
			'project_analyst', CASE WHEN p_planner_accepted
				THEN '{"focus":"next actions"}'::jsonb ELSE '{"focus":"fixed"}'::jsonb END,
			'risk_reviewer', CASE WHEN p_planner_accepted
				THEN '{"focus":"risks"}'::jsonb ELSE '{"focus":"fixed"}'::jsonb END,
			'editor', '{}'::jsonb
		)
	)
$$;

-- Server-derived request hash exactly as the web writer will send it.
CREATE OR REPLACE FUNCTION pg_temp.admit(
	p_n integer,
	p_session uuid,
	p_client text,
	p_project uuid,
	p_message text,
	p_request_hash text DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql AS $$
	SELECT public.create_agentic_chat_workflow_turn_with_job_v1(
		'c1000000-0000-4000-8000-000000000001', p_session,
		pg_temp.id('c4', p_n), pg_temp.id('c5', p_n), pg_temp.id('c6', p_n),
		'stream-' || p_client, p_client, pg_temp.id('c7', p_n), pg_temp.id('c8', p_n),
		p_project, p_message,
		public.agentic_chat_workflow_review_intent_v1(p_message),
		public.agentic_chat_workflow_policy_v1(), 'policy-ref-1',
		COALESCE(p_request_hash, public.agentic_chat_workflow_request_hash_v1(jsonb_build_object(
			'clientTurnId', p_client,
			'streamRunId', 'stream-' || p_client,
			'context', jsonb_build_object('type', 'project', 'entityId', p_project, 'projectId', p_project),
			'message', p_message,
			'reviewIntent', public.agentic_chat_workflow_review_intent_v1(p_message),
			'policy', public.agentic_chat_workflow_policy_v1(),
			'policyRef', 'policy-ref-1'
		)))
	)
$$;

CREATE OR REPLACE FUNCTION pg_temp.context(
	p_n integer,
	p_token uuid,
	p_generation integer,
	p_transition integer
)
RETURNS jsonb LANGUAGE sql AS $$
	SELECT public.accept_agentic_chat_workflow_context_v1(
		turns.id, turns.queue_job_id, p_token, p_generation, pg_temp.id('d0', p_n),
		turns.input_artifact_id, turns.request_hash, 'agentic_chat_prepared_context_v1',
		jsonb_build_object('userId', turns.user_id, 'projectId', turns.project_id,
			'accessCheckedAt', '2026-09-14T12:00:00Z', 'contextLoadedAt', '2026-09-14T12:00:00Z',
			'cacheRefUsed', NULL),
		'[{"kind":"task","id":"task-1","version":"v1","observedAt":"2026-09-14T12:00:00Z"}]'::jsonb,
		'{"project":{"name":"Cedar House"},"tasks":[{"id":"task-1","title":"Book venue"}]}'::jsonb,
		repeat('a', 64), 40, pg_temp.id('da', p_n * 100 + p_transition),
		pg_temp.proj('assessing'), pg_temp.evt('assessing')
	)
	FROM public.chat_turn_runs turns
	WHERE turns.id = pg_temp.id('c4', p_n)
$$;

-- Stands in for the queue claimer: lease the turn's job with a fresh token.
CREATE OR REPLACE FUNCTION pg_temp.lease(p_n integer, p_token uuid)
RETURNS uuid LANGUAGE sql AS $$
	UPDATE public.queue_jobs jobs
	SET status = 'processing', processing_token = p_token, started_at = clock_timestamp()
	FROM public.chat_turn_runs turns
	WHERE turns.id = pg_temp.id('c4', p_n) AND jobs.id = turns.queue_job_id
	RETURNING jobs.id
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_ordinary(p_n integer, p_version text, p_prepared jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	v_user uuid := pg_temp.id('a1', 1);
	v_turn uuid := pg_temp.id('a4', p_n);
BEGIN
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (pg_temp.id('a2', p_n), v_user, 'global', 'active');
	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (pg_temp.id('a3', p_n), pg_temp.id('a2', p_n), v_user, 'user', 'Hello there',
		jsonb_build_object('idempotency_key', 'chat-turn:' || v_turn || ':user'));
	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status, queue_job_id,
		processing_token, started_at, attempts, max_attempts
	) VALUES (
		pg_temp.id('a5', p_n), v_user, 'agentic_chat_turn',
		jsonb_build_object('turnRunId', v_turn, 'correlationId', pg_temp.id('a6', p_n)),
		now(), 'agentic-chat-turn:' || v_turn, 'processing', 'ordinary_' || p_n,
		pg_temp.id('a7', p_n), now(), 0, 3
	);
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type, request_message,
		request_payload, request_payload_version, status, execution_mode, queue_job_id,
		correlation_id, execution_generation, history_cutoff_at, last_progress_at, user_message_id
	) VALUES (
		v_turn, pg_temp.id('a2', p_n), v_user, 'ordinary-stream-' || p_n, 'ordinary-client-' || p_n,
		'global', 'Hello there',
		jsonb_build_object('message', 'Hello there', 'attachments', '[]'::jsonb,
			'context', jsonb_build_object('type', 'global'),
			'clientTurnId', 'ordinary-client-' || p_n, 'streamRunId', 'ordinary-stream-' || p_n),
		'agentic_chat_request_v1', 'queued', 'worker_realtime', pg_temp.id('a5', p_n),
		pg_temp.id('a6', p_n), 0, now(), now(), pg_temp.id('a3', p_n)
	);
	INSERT INTO public.chat_turn_input_artifacts (
		id, turn_run_id, session_id, user_id, source_prepared_prompt_id, artifact_version,
		history_source, history, prepared, content_hash, history_bytes, content_bytes,
		created_at, retain_until
	) VALUES (
		pg_temp.id('a8', p_n), v_turn, pg_temp.id('a2', p_n), v_user, NULL, p_version,
		'admission_window', '[]'::jsonb, p_prepared, repeat('c', 64), 2, 200,
		now(), now() + interval '8 days'
	);
	UPDATE public.chat_turn_runs SET input_artifact_id = pg_temp.id('a8', p_n) WHERE id = v_turn;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seed identities and project access
-- ---------------------------------------------------------------------------

INSERT INTO public.users (id) VALUES
	('c1000000-0000-4000-8000-000000000001'), ('a1000000-0000-4000-8000-000000000001');
INSERT INTO auth.users (id) VALUES
	('c1000000-0000-4000-8000-000000000001'), ('a1000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES
	('c2000000-0000-4000-8000-000000000001', 'human', 'Owner', 'c1000000-0000-4000-8000-000000000001'),
	('c2000000-0000-4000-8000-000000000002', 'human', 'Stranger', NULL);
INSERT INTO public.onto_projects (id, name, created_by) VALUES
	('c3000000-0000-4000-8000-000000000001', 'Cedar House', 'c2000000-0000-4000-8000-000000000001'),
	('c3000000-0000-4000-8000-000000000002', 'Private', 'c2000000-0000-4000-8000-000000000002'),
	('c3000000-0000-4000-8000-000000000003', 'Revoked', 'c2000000-0000-4000-8000-000000000001');

\set user c1000000-0000-4000-8000-000000000001
\set project c3000000-0000-4000-8000-000000000001

-- ---------------------------------------------------------------------------
-- Static contract: patched validators, privileges
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
	position('IF NEW.prepared IS NULL OR NOT (NEW.prepared ? ''turnIntent'') THEN' IN
		pg_get_functiondef('public.validate_agentic_chat_turn_intent_snapshot_v1()'::regprocedure)) > 0
	AND position('IF NEW.prepared IS NULL OR NOT (NEW.prepared ? ''domainMetadata'') THEN' IN
		pg_get_functiondef('public.validate_agentic_chat_domain_metadata_snapshot_v1()'::regprocedure)) > 0,
	'prepared-branch validators skip the raw branch'
);

SELECT pg_temp.assert_true(NOT EXISTS (
	SELECT 1
	FROM pg_proc procs
	JOIN pg_namespace namespaces ON namespaces.oid = procs.pronamespace
	CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
	WHERE namespaces.nspname = 'public'
		AND (procs.proname LIKE '%agentic_chat_workflow%' OR procs.proname IN (
			'agentic_chat_canonical_json_v1', 'agentic_chat_sha256_hex_v1', 'agentic_chat_normalize_text_v1'))
		AND has_function_privilege(roles.role_name, procs.oid, 'EXECUTE')
), 'no workflow routine is executable by anon or authenticated');

SELECT pg_temp.assert_true(
	(SELECT count(*) FROM pg_proc procs JOIN pg_namespace namespaces ON namespaces.oid = procs.pronamespace
		WHERE namespaces.nspname = 'public' AND procs.proname LIKE '%agentic_chat_workflow%'
			AND procs.prorettype <> 'trigger'::regtype
			AND NOT has_function_privilege('service_role', procs.oid, 'EXECUTE')) = 0,
	'service_role can execute every workflow routine'
);

SELECT pg_temp.assert_true(NOT EXISTS (
	SELECT 1
	FROM (VALUES ('public.chat_turn_workflow_runs'), ('public.chat_turn_workflow_steps'),
		('public.chat_turn_workflow_dispatches')) AS tables(table_name)
	CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
	CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS privileges(privilege)
	WHERE has_table_privilege(roles.role_name, tables.table_name, privileges.privilege)
), 'workflow tables are service-only');

SELECT pg_temp.assert_true(
	(SELECT bool_and(relrowsecurity) FROM pg_class
		WHERE oid IN ('public.chat_turn_workflow_runs'::regclass, 'public.chat_turn_workflow_steps'::regclass,
			'public.chat_turn_workflow_dispatches'::regclass)),
	'workflow tables have RLS enabled'
);

SET ROLE authenticated;
SELECT pg_temp.expect_error('authenticated admission',
	'SELECT public.recover_agentic_chat_workflow_turn_v1(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, ''unknown'')',
	'permission denied');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Ordinary v2/v3 prepared admission is unchanged and not workflow-recoverable
-- ---------------------------------------------------------------------------

SELECT pg_temp.seed_ordinary(1, 'agentic_chat_input_v2',
	'{"sourcePreparedPromptId":null,"contextPayload":{},"conversationSummary":null,"surfaceProfile":"worker_realtime:global","systemPrompt":"x","promptSections":[],"toolSurface":{}}');
SELECT pg_temp.seed_ordinary(2, 'agentic_chat_input_v3',
	'{"sourcePreparedPromptId":null,"contextPayload":{},"conversationSummary":null,"surfaceProfile":"worker_realtime:global","systemPrompt":"x","promptSections":[],"toolSurface":{},"sessionSnapshot":{"summary":null,"agent_metadata":{}},"contextUsageSnapshot":{"estimatedTokens":10,"tokenBudget":15000,"usagePercent":0,"tokensRemaining":14990,"status":"ok","lastCompressedAt":null,"lastCompression":null}}');
SELECT pg_temp.expect_error('v3 still requires its lifecycle snapshot',
	$sql$SELECT pg_temp.seed_ordinary(3, 'agentic_chat_input_v3', '{"sourcePreparedPromptId":null,"contextPayload":{},"conversationSummary":null,"surfaceProfile":"worker_realtime:global","systemPrompt":"x","promptSections":[],"toolSurface":{}}')$sql$,
	'agentic_chat_input_v3_missing_lifecycle_snapshot');
SELECT pg_temp.expect_error('prepared row cannot carry a raw request',
	$sql$INSERT INTO public.chat_turn_input_artifacts (id, turn_run_id, session_id, user_id, artifact_version, history_source, history, prepared, request, content_hash, history_bytes, content_bytes, created_at, retain_until)
	VALUES (gen_random_uuid(), 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'agentic_chat_input_v2', 'admission_window', '[]', '{}', '{}', repeat('c', 64), 2, 200, now(), now() + interval '8 days')$sql$,
	'agentic_chat_workflow_input_v4_branch_mismatch');

SET ROLE service_role;
SELECT pg_temp.expect('ordinary v2 claim', public.claim_agentic_chat_turn(
	pg_temp.id('a4', 1), pg_temp.id('a5', 1), pg_temp.id('a7', 1)), 'claimed');
SELECT pg_temp.expect('ordinary v3 claim', public.claim_agentic_chat_turn(
	pg_temp.id('a4', 2), pg_temp.id('a5', 2), pg_temp.id('a7', 2)), 'claimed');
SELECT pg_temp.assert_true(
	public.recover_agentic_chat_workflow_turn_v1(pg_temp.id('a4', 1), pg_temp.id('a5', 1), pg_temp.id('a7', 1), 1, 'transient_infra')
		@> '{"outcome":"policy_denied","reason":"not_a_workflow_turn","execution_may_retry":false}',
	'workflow recovery refuses ordinary turns');

-- ---------------------------------------------------------------------------
-- Turn 1: admission, full happy path, replays, and fail-closed validation
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_error('caller hash is not authority',
	format('SELECT pg_temp.admit(1, NULL, %L, %L, %L, %L)', 'client-1', :'project', 'What should we prioritize next?', repeat('0', 64)),
	'agentic_chat_workflow_admission_request_hash_mismatch');
SELECT pg_temp.expect_error('message must already be normalized',
	format('SELECT pg_temp.admit(1, NULL, %L, %L, %L)', 'client-1', :'project', '  padded question  '),
	'agentic_chat_workflow_admission_invalid_message');

SELECT pg_temp.expect('admit 1', pg_temp.admit(1, NULL, 'client-1', :'project', 'What should we prioritize next?'), 'newly_admitted');
SELECT session_id AS session, queue_job_id AS job1, input_artifact_id AS artifact1, request_hash AS rhash1
FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 1) \gset

SELECT pg_temp.assert_true(
	(SELECT artifact_version = 'agentic_chat_input_v4' AND prepared IS NULL AND request_hash = :'rhash1'
		AND history = '[]'::jsonb AND request->>'message' = 'What should we prioritize next?'
		AND request->'policy' = public.agentic_chat_workflow_policy_v1()
		FROM public.chat_turn_input_artifacts WHERE id = :'artifact1')
	AND (SELECT phase = 'preparing' AND context_id IS NULL AND max_spend_micro_usd = 250000
		FROM public.chat_turn_workflow_runs WHERE turn_run_id = pg_temp.id('c4', 1))
	AND (SELECT request_hash_version = 'agentic_chat_workflow_request_hash_v1'
		AND request_payload->>'inputArtifactVersion' = 'agentic_chat_input_v4'
		FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 1)),
	'raw admission saves request, turn, and preparing workflow run together');

SELECT pg_temp.lease(1, pg_temp.id('c9', 1));

-- Nothing can be claimed or reserved from the raw request alone.
SELECT pg_temp.expect('claim 1', public.claim_agentic_chat_turn(pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1)), 'claimed');
SELECT pg_temp.expect('begin 1', public.begin_agentic_chat_turn_execution(pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1), 'started');
SELECT pg_temp.expect('planner before context', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, NULL, 'planner', pg_temp.id('d1', 1)), 'not_ready');
SELECT pg_temp.expect('dispatch before context', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('e1', 99), 'planner', pg_temp.id('d1', 1),
	1, 'planner', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2000, 1200), 'stale_claim');

SELECT pg_temp.expect('context 1', pg_temp.context(1, pg_temp.id('c9', 1), 1, 1), 'accepted');
SELECT pg_temp.expect('context replay', pg_temp.context(1, pg_temp.id('c9', 1), 1, 1), 'already_accepted');
SELECT pg_temp.assert_true(
	(SELECT phase = 'assessing' AND deadline_at > created_at FROM public.chat_turn_workflow_runs WHERE turn_run_id = pg_temp.id('c4', 1))
	AND (SELECT count(*) = 1 FROM public.chat_turn_events WHERE turn_run_id = pg_temp.id('c4', 1)
		AND phase = 'llm' AND event_type = 'workflow_progress'),
	'context acceptance commits its progress event exactly once');

SELECT pg_temp.expect('planner claim', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, NULL, 'planner', pg_temp.id('d1', 1)), 'claimed');
SELECT pg_temp.expect('planner claim replay', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, NULL, 'planner', pg_temp.id('d1', 1)), 'claimed');
SELECT pg_temp.expect('competing planner claim', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, NULL, 'planner', pg_temp.id('d1', 98)), 'claim_conflict');
SELECT pg_temp.expect('unclaimed step reservation', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('e1', 97), 'project_analyst', pg_temp.id('d2', 1),
	1, 'specialist', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2000, 4000), 'stale_claim');
SELECT pg_temp.expect('rate above admitted maximum', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('e1', 96), 'planner', pg_temp.id('d1', 1),
	1, 'planner', 'deepseek/deepseek-v4-flash', pg_temp.pricing('0.31'), 2000, 1200), 'pricing_unavailable');
SELECT pg_temp.expect_error('output ceiling is per step',
	format('SELECT public.reserve_agentic_chat_workflow_dispatch_v1(%L, %L, %L, 1, %L, %L, %L, 1, %L, %L, pg_temp.pricing(), 2000, 1201)',
		pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), pg_temp.id('e1', 95), 'planner', pg_temp.id('d1', 1),
		'planner', 'deepseek/deepseek-v4-flash'),
	'agentic_chat_workflow_dispatch_reserve_invalid');

SELECT public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('e1', 1), 'planner', pg_temp.id('d1', 1),
	1, 'planner', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2000, 1200) AS reserve1 \gset
SELECT pg_temp.assert_true(:'reserve1'::jsonb @> '{"outcome":"reserved","reserved_micro_usd":2348,"exposure_micro_usd":2348}',
	'reservation uses the fixed max-rate formula');
SELECT :'reserve1'::jsonb->>'settlement_token' AS stoken1 \gset
SELECT pg_temp.expect('reservation replay', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('e1', 1), 'planner', pg_temp.id('d1', 1),
	1, 'planner', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2000, 1200), 'already_reserved');
SELECT pg_temp.expect('reservation id reuse', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('e1', 1), 'planner', pg_temp.id('d1', 1),
	1, 'planner', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2001, 1200), 'reservation_conflict');
SELECT pg_temp.assert_true(public.begin_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('e1', 1)) @> '{"outcome":"dispatching","dispatch_permitted":true}',
	'first begin grants the provider permit');
SELECT pg_temp.assert_true(public.begin_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('e1', 1)) @> '{"outcome":"already_started","dispatch_permitted":false}',
	'a lost begin response never grants a second permit');
SELECT pg_temp.expect_error('settlement requires the dispatch token',
	format('SELECT public.settle_agentic_chat_workflow_dispatch_v1(%L, gen_random_uuid(), NULL, NULL, 900, %L)', pg_temp.id('e1', 1), 'settled'),
	'agentic_chat_workflow_dispatch_settlement_token_invalid');
SELECT pg_temp.expect('settle', public.settle_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('e1', 1), :'stoken1', 'gen-1', '{"prompt_tokens":700}', 900, 'settled'), 'settled');
SELECT pg_temp.expect('settle replay', public.settle_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('e1', 1), :'stoken1', 'gen-1', '{"prompt_tokens":700}', 900, 'settled'), 'already_settled');
SELECT pg_temp.expect('settle changed amount', public.settle_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('e1', 1), :'stoken1', 'gen-1', '{"prompt_tokens":700}', 901, 'settled'), 'settlement_conflict');
SELECT pg_temp.assert_true(public.agentic_chat_workflow_exposure_micro_usd_v1(pg_temp.id('c4', 1)) = 900,
	'settled work counts at its actual charge');

SELECT pg_temp.expect('planner result', public.accept_agentic_chat_workflow_step_result_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, NULL, 'planner', pg_temp.id('d1', 1), 'complete',
	pg_temp.planner_result(), pg_temp.h(pg_temp.planner_result()), pg_temp.b(pg_temp.planner_result()),
	pg_temp.id('da', 102), pg_temp.proj('assessing'), pg_temp.evt('assessing')), 'accepted');
SELECT pg_temp.expect('planner result replay', public.accept_agentic_chat_workflow_step_result_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, NULL, 'planner', pg_temp.id('d1', 1), 'complete',
	pg_temp.planner_result(), pg_temp.h(pg_temp.planner_result()), pg_temp.b(pg_temp.planner_result()),
	pg_temp.id('da', 102), pg_temp.proj('assessing'), pg_temp.evt('assessing')), 'already_accepted');

SELECT pg_temp.plan(1, :'rhash1', true) AS plan1 \gset
SELECT pg_temp.h(:'plan1') AS phash1 \gset
SELECT pg_temp.expect_error('plan must bind the accepted planner assignments',
	format('SELECT public.install_agentic_chat_workflow_plan_v1(%L, %L, %L, 1, %L, %L, %L, %L, %L, pg_temp.proj(%L), pg_temp.evt(%L))',
		pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), pg_temp.id('d0', 1), 'agentic_chat_project_review_plan_v1',
		jsonb_set(:'plan1'::jsonb, '{assignments,risk_reviewer}', '{"focus":"rewritten"}'),
		pg_temp.h(jsonb_set(:'plan1'::jsonb, '{assignments,risk_reviewer}', '{"focus":"rewritten"}')),
		pg_temp.id('da', 103), 'executing', 'executing'),
	'agentic_chat_workflow_plan_planner_binding_mismatch');
SELECT pg_temp.expect('install plan', public.install_agentic_chat_workflow_plan_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('d0', 1), 'agentic_chat_project_review_plan_v1',
	:'plan1', :'phash1', pg_temp.id('da', 103), pg_temp.proj('executing'), pg_temp.evt('executing')), 'installed');
SELECT pg_temp.expect('install plan replay', public.install_agentic_chat_workflow_plan_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('d0', 1), 'agentic_chat_project_review_plan_v1',
	:'plan1', :'phash1', pg_temp.id('da', 103), pg_temp.proj('executing'), pg_temp.evt('executing')), 'already_installed');

SELECT pg_temp.expect('editor before specialists', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, :'phash1', 'editor', pg_temp.id('d4', 1)), 'not_ready');
SELECT pg_temp.expect('specialist with stale plan hash', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, repeat('f', 64), 'project_analyst', pg_temp.id('d2', 1)), 'plan_conflict');
SELECT pg_temp.expect('analyst claim', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, :'phash1', 'project_analyst', pg_temp.id('d2', 1)), 'claimed');
SELECT pg_temp.expect('reviewer claim', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, :'phash1', 'risk_reviewer', pg_temp.id('d3', 1)), 'claimed');
SELECT pg_temp.expect('late result from another attempt', public.accept_agentic_chat_workflow_step_result_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, :'phash1', 'project_analyst', pg_temp.id('d2', 99), 'complete',
	pg_temp.report('project_analyst'), pg_temp.h(pg_temp.report('project_analyst')), pg_temp.b(pg_temp.report('project_analyst')),
	pg_temp.id('da', 104), pg_temp.proj('executing'), pg_temp.evt('executing')), 'stale_claim');
SELECT pg_temp.expect_error('evidence must resolve inside the accepted context',
	format('SELECT public.accept_agentic_chat_workflow_step_result_v1(%L, %L, %L, 1, %L, %L, %L, %L, %L, %L, %s, %L, pg_temp.proj(%L), pg_temp.evt(%L))',
		pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), :'phash1', 'project_analyst', pg_temp.id('d2', 1), 'complete',
		pg_temp.report('project_analyst', 'task-404'), pg_temp.h(pg_temp.report('project_analyst', 'task-404')),
		pg_temp.b(pg_temp.report('project_analyst', 'task-404')), pg_temp.id('da', 104), 'executing', 'executing'),
	'agentic_chat_workflow_step_result_unverified');
SELECT pg_temp.expect('analyst result', public.accept_agentic_chat_workflow_step_result_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, :'phash1', 'project_analyst', pg_temp.id('d2', 1), 'complete',
	pg_temp.report('project_analyst'), pg_temp.h(pg_temp.report('project_analyst')), pg_temp.b(pg_temp.report('project_analyst')),
	pg_temp.id('da', 104), pg_temp.proj('executing'), pg_temp.evt('executing')), 'accepted');
SELECT pg_temp.expect('reviewer result', public.accept_agentic_chat_workflow_step_result_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, :'phash1', 'risk_reviewer', pg_temp.id('d3', 1), 'complete',
	pg_temp.report('risk_reviewer'), pg_temp.h(pg_temp.report('risk_reviewer')), pg_temp.b(pg_temp.report('risk_reviewer')),
	pg_temp.id('da', 105), pg_temp.proj('executing'), pg_temp.evt('executing')), 'accepted');
SELECT pg_temp.expect('editor claim', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, :'phash1', 'editor', pg_temp.id('d4', 1)), 'claimed');
SELECT pg_temp.assert_true((SELECT phase = 'synthesizing' FROM public.chat_turn_workflow_runs
	WHERE turn_run_id = pg_temp.id('c4', 1)), 'editor claim enters synthesis');

SELECT pg_temp.expect('answer offset conflict', public.persist_agentic_chat_workflow_text_batch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('f1', 1), pg_temp.id('d4', 1), pg_temp.id('f2', 1), 3,
	'Book the venue ', 'Book the venue ', public.agentic_chat_sha256_hex_v1('Book the venue '),
	public.agentic_chat_sha256_hex_v1('Book the venue ')), 'offset_conflict');
SELECT pg_temp.expect('answer batch 1', public.persist_agentic_chat_workflow_text_batch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('f1', 1), pg_temp.id('d4', 1), pg_temp.id('f2', 1), 0,
	'Book the venue ', 'Book the venue ', public.agentic_chat_sha256_hex_v1('Book the venue '),
	public.agentic_chat_sha256_hex_v1('Book the venue ')), 'persisted');
SELECT pg_temp.expect('answer batch 1 replay', public.persist_agentic_chat_workflow_text_batch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('f1', 1), pg_temp.id('d4', 1), pg_temp.id('f2', 1), 0,
	'Book the venue ', 'Book the venue ', public.agentic_chat_sha256_hex_v1('Book the venue '),
	public.agentic_chat_sha256_hex_v1('Book the venue ')), 'already_persisted');
SELECT pg_temp.expect('second answer id', public.persist_agentic_chat_workflow_text_batch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('f1', 2), pg_temp.id('d4', 1), pg_temp.id('f2', 9), 15,
	'first.', 'Book the venue first.', public.agentic_chat_sha256_hex_v1('first.'),
	public.agentic_chat_sha256_hex_v1('Book the venue first.')), 'answer_conflict');
SELECT pg_temp.expect('answer batch 2', public.persist_agentic_chat_workflow_text_batch_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('f1', 1), pg_temp.id('d4', 1), pg_temp.id('f2', 2), 15,
	'first.', 'Book the venue first.', public.agentic_chat_sha256_hex_v1('first.'),
	public.agentic_chat_sha256_hex_v1('Book the venue first.')), 'persisted');
SELECT pg_temp.expect('synthesis wrong bytes', public.accept_agentic_chat_workflow_synthesis_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('f1', 1), pg_temp.id('d4', 1), 15,
	public.agentic_chat_sha256_hex_v1('Book the venue first.'), 'complete', pg_temp.id('da', 106),
	pg_temp.proj('synthesizing'), pg_temp.evt('synthesizing')), 'answer_conflict');
SELECT pg_temp.expect('synthesis', public.accept_agentic_chat_workflow_synthesis_v1(
	pg_temp.id('c4', 1), :'job1', pg_temp.id('c9', 1), 1, pg_temp.id('f1', 1), pg_temp.id('d4', 1), 21,
	public.agentic_chat_sha256_hex_v1('Book the venue first.'), 'complete', pg_temp.id('da', 106),
	pg_temp.proj('synthesizing'), pg_temp.evt('synthesizing')), 'accepted');
SELECT pg_temp.expect('finalize 1', public.finalize_agentic_chat_turn(
	pg_temp.id('c4', 1), :'user', :'job1', pg_temp.id('c9', 1), 1, 'completed', 'stop', NULL, pg_temp.id('f3', 1),
	'Book the venue first.', '{}'::jsonb, NULL, NULL, NULL, pg_temp.proj('synthesizing'), '{}'::jsonb), 'finalized');

SELECT pg_temp.assert_true(
	(SELECT phase = 'finished' AND terminal_outcome = 'complete' AND synthesis_status = 'accepted'
		AND answer_text = 'Book the venue first.' AND finished_at > created_at
		FROM public.chat_turn_workflow_runs WHERE turn_run_id = pg_temp.id('c4', 1))
	AND (SELECT count(*) = 4 AND bool_and(status = 'accepted' AND attempts_used = 1)
		FROM public.chat_turn_workflow_steps WHERE turn_run_id = pg_temp.id('c4', 1))
	AND (SELECT result @> '{"version":"agentic_chat_workflow_synthesis_result_v1","textBytes":21,"quality":"complete"}'
		FROM public.chat_turn_workflow_steps WHERE turn_run_id = pg_temp.id('c4', 1) AND step_key = 'editor')
	AND (SELECT array_agg(event_type ORDER BY sequence_index) =
			ARRAY['workflow_progress', 'workflow_progress', 'workflow_progress', 'workflow_progress',
				'workflow_progress', 'workflow_progress', 'done']
		FROM public.chat_turn_events WHERE turn_run_id = pg_temp.id('c4', 1)),
	'terminal sync records a complete workflow with one durable event per checkpoint');

RESET ROLE;
SELECT pg_temp.expect_error('workflow identity is immutable',
	format('UPDATE public.chat_turn_workflow_runs SET policy_ref = %L WHERE turn_run_id = %L', 'other', pg_temp.id('c4', 1)),
	'agentic_chat_workflow_run_transition_invalid');
SELECT pg_temp.expect_error('accepted step is immutable',
	format('UPDATE public.chat_turn_workflow_steps SET quality = %L WHERE turn_run_id = %L AND step_key = %L', 'partial', pg_temp.id('c4', 1), 'planner'),
	'agentic_chat_workflow_step_transition_invalid');
SELECT pg_temp.expect_error('settled dispatch is immutable',
	format('UPDATE public.chat_turn_workflow_dispatches SET actual_micro_usd = 1 WHERE dispatch_id = %L', pg_temp.id('e1', 1)),
	'agentic_chat_workflow_dispatch_transition_invalid');
SELECT pg_temp.expect_error('settled receipts outlive the turn for 30 days',
	format('DELETE FROM public.chat_turn_workflow_dispatches WHERE dispatch_id = %L', pg_temp.id('e1', 1)),
	'agentic_chat_workflow_dispatch_retention_not_elapsed');
SELECT pg_temp.assert_true(
	(public.cleanup_agentic_chat_workflow_dispatches_v1(1, 1, 1000)) @> '{"dispatches_deleted":0,"dispatch_retention_days":30,"reconciled_retention_days":90}',
	'cleanup clamps retention to the contract minimums');
SET ROLE service_role;

-- ---------------------------------------------------------------------------
-- Turn 2: conflicts, post-start read-only recovery, generation fence, cancel
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect('admit 2', pg_temp.admit(2, :'session', 'client-2', :'project', 'What are the risks?'), 'newly_admitted') AS admit2 \gset
SELECT pg_temp.assert_true((:'admit2'::jsonb->>'history_message_count')::integer = 2,
	'history freezes the prior user and assistant messages');
SELECT pg_temp.assert_true(
	(SELECT jsonb_path_query_array(history, '$[*].role') = '["user","assistant"]'::jsonb
		FROM public.chat_turn_input_artifacts WHERE turn_run_id = pg_temp.id('c4', 2)),
	'frozen history is oldest-first');
SELECT pg_temp.expect('duplicate', pg_temp.admit(2, :'session', 'client-2', :'project', 'What are the risks?'), 'matching_duplicate');
SELECT pg_temp.assert_true(pg_temp.admit(2, :'session', 'client-2', :'project', 'Something else?')
	@> '{"outcome":"idempotency_conflict","conflict_reason":"request_hash_mismatch"}', 'changed replay conflicts');
SELECT pg_temp.expect('active turn', pg_temp.admit(3, :'session', 'client-3', :'project', 'Third question?'), 'active_turn_conflict');
SELECT pg_temp.expect('no project access', pg_temp.admit(3, NULL, 'client-3', 'c3000000-0000-4000-8000-000000000002', 'Private question?'), 'access_denied');
SELECT pg_temp.expect_error('session scope must match the project',
	format('SELECT pg_temp.admit(3, %L, %L, %L, %L)', :'session', 'client-3', 'c3000000-0000-4000-8000-000000000003', 'Other project?'),
	'agentic_chat_workflow_admission_session_scope_mismatch');

SELECT queue_job_id AS job2 FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 2) \gset
SELECT pg_temp.lease(2, pg_temp.id('c9', 2));
SELECT pg_temp.expect('claim 2', public.claim_agentic_chat_turn(pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2)), 'claimed');
SELECT pg_temp.expect('begin 2', public.begin_agentic_chat_turn_execution(pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1), 'started');
SELECT pg_temp.expect('context 2', pg_temp.context(2, pg_temp.id('c9', 2), 1, 1), 'accepted');
SELECT pg_temp.expect('planner claim 2', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, NULL, 'planner', pg_temp.id('d1', 2)), 'claimed');
SELECT pg_temp.expect('reserve 2a', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, pg_temp.id('e2', 1), 'planner', pg_temp.id('d1', 2),
	1, 'planner', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2000, 1200), 'reserved');
SELECT pg_temp.expect('begin 2a', public.begin_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, pg_temp.id('e2', 1)), 'dispatching');
SELECT pg_temp.expect('reserve 2b', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, pg_temp.id('e2', 2), 'planner', pg_temp.id('d1', 2),
	2, 'provider_fallback', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2000, 1200), 'reserved');
SELECT pg_temp.expect('paid tools are disabled', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, pg_temp.id('e2', 9), 'planner', pg_temp.id('d1', 2),
	2, 'paid_tool', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2000, 1200), 'pricing_unavailable');

SELECT pg_temp.assert_true(public.recover_agentic_chat_turn(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, 'timeout_post_start')
	@> '{"outcome":"finalize_failed","execution_may_retry":false}',
	'ordinary recovery still refuses a post-start turn');
SELECT pg_temp.assert_true(
	(SELECT status = 'running' FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 2)),
	'ordinary refusal does not mutate the turn');

SELECT public.recover_agentic_chat_workflow_turn_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, 'timeout_post_start') AS recovery2 \gset
SELECT pg_temp.assert_true(:'recovery2'::jsonb @> '{"outcome":"retry_scheduled","execution_may_retry":true,"released_dispatch_count":1,"uncertain_dispatch_count":1,"uncertain_cost_held":true,"exposure_micro_usd":2348,"queue_attempts":1}',
	'workflow recovery releases unused permits and holds uncertain spend');
SELECT pg_temp.assert_true(
	(SELECT status = 'queued' AND execution_started_at IS NULL AND execution_generation = 1
		FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 2))
	AND (SELECT status::text = 'pending' AND processing_token IS NULL AND scheduled_for > now()
		FROM public.queue_jobs WHERE id = :'job2')
	AND (SELECT recovery_count = 1 AND first_execution_started_at IS NOT NULL
		FROM public.chat_turn_workflow_runs WHERE turn_run_id = pg_temp.id('c4', 2)),
	'recovery requeues with a cleared start boundary and preserved run evidence');
SELECT pg_temp.expect('recovery replay', public.recover_agentic_chat_workflow_turn_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, 'timeout_post_start'), 'already_requeued');
SELECT pg_temp.expect('old owner after requeue', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, NULL, 'planner', pg_temp.id('d1', 3)), 'ownership_lost');
SELECT pg_temp.expect('begin released permit', public.begin_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, pg_temp.id('e2', 2)), 'ownership_lost');

SELECT pg_temp.lease(2, pg_temp.id('c9', 12));
SELECT pg_temp.expect('reclaim 2', public.claim_agentic_chat_turn(pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12)), 'claimed');
SELECT pg_temp.expect('rebegin 2', public.begin_agentic_chat_turn_execution(pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2), 'started');
SELECT pg_temp.expect('generation 1 is fenced', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 2), 1, NULL, 'planner', pg_temp.id('d1', 3)), 'stale_generation');
SELECT pg_temp.expect('context replay in generation 2', pg_temp.context(2, pg_temp.id('c9', 12), 2, 1), 'already_accepted');
SELECT public.resume_agentic_chat_workflow_projection_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, pg_temp.id('db', 2), pg_temp.proj('assessing'), pg_temp.evt('assessing')) AS resume2 \gset
SELECT pg_temp.assert_true(:'resume2'::jsonb @> '{"outcome":"resumed","phase":"assessing","recovery_count":1,"exposure_micro_usd":2348}'
	AND :'resume2'::jsonb->'steps' @> '[{"step_key":"planner","status":"claimed","attempts_used":1}]'
	AND :'resume2'::jsonb#>>'{event,event_id}' = pg_temp.id('c4', 2)::text || ':2:1',
	'resume republishes durable workflow truth as sequence 1 of the new generation');
SELECT pg_temp.expect('planner reclaim', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, NULL, 'planner', pg_temp.id('d1', 12)), 'claimed');
SELECT pg_temp.expect('reserve in generation 2', public.reserve_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, pg_temp.id('e2', 3), 'planner', pg_temp.id('d1', 12),
	1, 'planner', 'deepseek/deepseek-v4-flash', pg_temp.pricing(), 2000, 1200), 'reserved');
SELECT pg_temp.expect('settle cannot resolve uncertain spend', public.settle_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('e2', 1), (SELECT settlement_token FROM public.chat_turn_workflow_dispatches WHERE dispatch_id = pg_temp.id('e2', 1)),
	NULL, NULL, 700, 'settled'), 'settlement_conflict');
SELECT pg_temp.expect_error('reconciliation requires a provider receipt',
	format('SELECT public.reconcile_agentic_chat_workflow_dispatch_v1(%L, %L, %L, NULL, 700)', pg_temp.id('e2', 1), pg_temp.id('ea', 1), 'settled'),
	'agentic_chat_workflow_dispatch_reconcile_invalid');
SELECT pg_temp.expect('reconcile', public.reconcile_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('e2', 1), pg_temp.id('ea', 1), 'settled', '{"generation":"gen-x","total_cost":0.0007}', 700), 'reconciled');
SELECT pg_temp.expect('reconcile replay', public.reconcile_agentic_chat_workflow_dispatch_v1(
	pg_temp.id('e2', 1), pg_temp.id('ea', 1), 'settled', '{"generation":"gen-x","total_cost":0.0007}', 700), 'already_reconciled');
SELECT pg_temp.assert_true(public.agentic_chat_workflow_exposure_micro_usd_v1(pg_temp.id('c4', 2)) = 700 + 2348,
	'reconciled spend counts at actual and the live reservation at its reserve');

SELECT pg_temp.expect('planner exhausts attempts', public.fail_agentic_chat_workflow_step_attempt_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, NULL, 'planner', pg_temp.id('d1', 12),
	'provider_timeout', true, pg_temp.id('db', 3), pg_temp.proj('assessing'), pg_temp.evt('assessing')), 'failed');
SELECT pg_temp.plan(2, (SELECT request_hash FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 2)), false) AS plan2 \gset
SELECT pg_temp.h(:'plan2') AS phash2 \gset
SELECT pg_temp.expect('fixed fallback plan', public.install_agentic_chat_workflow_plan_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, pg_temp.id('d0', 2), 'agentic_chat_project_review_plan_v1',
	:'plan2', :'phash2', pg_temp.id('db', 4), pg_temp.proj('executing'), pg_temp.evt('executing')), 'installed');
SELECT pg_temp.expect('analyst claim 2', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, :'phash2', 'project_analyst', pg_temp.id('d2', 2)), 'claimed');
SELECT pg_temp.expect('analyst retry', public.fail_agentic_chat_workflow_step_attempt_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, :'phash2', 'project_analyst', pg_temp.id('d2', 2),
	'invalid_output', true, pg_temp.id('db', 5), pg_temp.proj('executing'), pg_temp.evt('executing')), 'retry_scheduled');
SELECT pg_temp.expect('analyst claim 2b', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, :'phash2', 'project_analyst', pg_temp.id('d2', 22)), 'claimed');
SELECT pg_temp.expect('analyst fails', public.fail_agentic_chat_workflow_step_attempt_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, :'phash2', 'project_analyst', pg_temp.id('d2', 22),
	'invalid_output', false, pg_temp.id('db', 6), pg_temp.proj('executing'), pg_temp.evt('executing')), 'failed');
SELECT pg_temp.expect('reviewer claim 2', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, :'phash2', 'risk_reviewer', pg_temp.id('d3', 2)), 'claimed');
SELECT pg_temp.assert_true(public.fail_agentic_chat_workflow_step_attempt_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, :'phash2', 'risk_reviewer', pg_temp.id('d3', 2),
	'invalid_output', false, pg_temp.id('db', 7), pg_temp.proj('executing'), pg_temp.evt('executing'))
	@> '{"outcome":"failed","editor_skipped":true}', 'no accepted specialist skips the editor');
SELECT pg_temp.expect('editor unsatisfiable', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, :'phash2', 'editor', pg_temp.id('d4', 2)), 'dependency_failed');
SELECT pg_temp.expect('cancel 2', public.request_agentic_chat_turn_cancel(pg_temp.id('c4', 2), :'user', 'user_cancelled', 'browser'), 'cancel_requested');
SELECT pg_temp.expect('cancel fences workflow writes', public.resume_agentic_chat_workflow_projection_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, pg_temp.id('db', 8), pg_temp.proj('executing'), pg_temp.evt('executing')), 'cancel_requested');
SELECT pg_temp.expect('cancel blocks recovery', public.recover_agentic_chat_workflow_turn_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, 'transient_infra'), 'cancel_requested');
SELECT pg_temp.expect('finalize 2', public.finalize_agentic_chat_turn(
	pg_temp.id('c4', 2), :'user', :'job2', pg_temp.id('c9', 12), 2, 'cancelled', 'user_cancelled', NULL, NULL,
	'', '{}'::jsonb, NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb), 'finalized');
SELECT pg_temp.expect('recover terminal 2', public.recover_agentic_chat_workflow_turn_v1(
	pg_temp.id('c4', 2), :'job2', pg_temp.id('c9', 12), 2, 'transient_infra'), 'terminal_reconciled');
SELECT pg_temp.assert_true(
	(SELECT phase = 'finished' AND terminal_outcome = 'cancelled'
		FROM public.chat_turn_workflow_runs WHERE turn_run_id = pg_temp.id('c4', 2))
	AND (SELECT jsonb_object_agg(dispatch_id, state) =
			jsonb_build_object(pg_temp.id('e2', 1), 'settled', pg_temp.id('e2', 2), 'released', pg_temp.id('e2', 3), 'released')
		FROM public.chat_turn_workflow_dispatches WHERE turn_run_id = pg_temp.id('c4', 2))
	AND (SELECT jsonb_object_agg(step_key, status || ':' || attempts_used) =
			'{"planner":"failed:2","project_analyst":"failed:2","risk_reviewer":"failed:1","editor":"skipped:0"}'::jsonb
		FROM public.chat_turn_workflow_steps WHERE turn_run_id = pg_temp.id('c4', 2)),
	'cancelled terminal sync releases live permits and preserves step truth');

-- ---------------------------------------------------------------------------
-- Turn 3: one accepted specialist yields an honest partial synthesis
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect('admit 3', pg_temp.admit(3, :'session', 'client-3', :'project', 'Is the schedule realistic?'), 'newly_admitted');
SELECT queue_job_id AS job3, request_hash AS rhash3 FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 3) \gset
SELECT pg_temp.lease(3, pg_temp.id('c9', 3));
SELECT pg_temp.expect('claim 3', public.claim_agentic_chat_turn(pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3)), 'claimed');
SELECT pg_temp.expect('context 3', pg_temp.context(3, pg_temp.id('c9', 3), 1, 1), 'accepted');
SELECT pg_temp.expect('planner claim 3', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, NULL, 'planner', pg_temp.id('d1', 3)), 'claimed');
SELECT pg_temp.expect('planner result 3', public.accept_agentic_chat_workflow_step_result_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, NULL, 'planner', pg_temp.id('d1', 3), 'complete',
	pg_temp.planner_result(), pg_temp.h(pg_temp.planner_result()), pg_temp.b(pg_temp.planner_result()),
	pg_temp.id('dc', 1), pg_temp.proj('assessing'), pg_temp.evt('assessing')), 'accepted');
SELECT pg_temp.plan(3, :'rhash3', true) AS plan3 \gset
SELECT pg_temp.h(:'plan3') AS phash3 \gset
SELECT pg_temp.expect('install plan 3', public.install_agentic_chat_workflow_plan_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, pg_temp.id('d0', 3), 'agentic_chat_project_review_plan_v1',
	:'plan3', :'phash3', pg_temp.id('dc', 2), pg_temp.proj('executing'), pg_temp.evt('executing')), 'installed');
SELECT pg_temp.expect('analyst claim 3', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, :'phash3', 'project_analyst', pg_temp.id('d2', 3)), 'claimed');
SELECT pg_temp.expect('partial analyst', public.accept_agentic_chat_workflow_step_result_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, :'phash3', 'project_analyst', pg_temp.id('d2', 3), 'partial',
	pg_temp.report('project_analyst'), pg_temp.h(pg_temp.report('project_analyst')), pg_temp.b(pg_temp.report('project_analyst')),
	pg_temp.id('dc', 3), pg_temp.proj('executing'), pg_temp.evt('executing')), 'accepted');
SELECT pg_temp.expect('reviewer claim 3', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, :'phash3', 'risk_reviewer', pg_temp.id('d3', 3)), 'claimed');
SELECT pg_temp.assert_true(public.fail_agentic_chat_workflow_step_attempt_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, :'phash3', 'risk_reviewer', pg_temp.id('d3', 3),
	'invalid_output', false, pg_temp.id('dc', 4), pg_temp.proj('executing'), pg_temp.evt('executing'))
	@> '{"outcome":"failed","editor_skipped":false}', 'one accepted specialist keeps the editor');
SELECT pg_temp.expect('editor claim 3', public.claim_agentic_chat_workflow_step_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, :'phash3', 'editor', pg_temp.id('d4', 3)), 'claimed');
SELECT pg_temp.expect('answer 3', public.persist_agentic_chat_workflow_text_batch_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, pg_temp.id('f1', 3), pg_temp.id('d4', 3), pg_temp.id('f2', 3), 0,
	'Schedule is tight.', 'Schedule is tight.', public.agentic_chat_sha256_hex_v1('Schedule is tight.'),
	public.agentic_chat_sha256_hex_v1('Schedule is tight.')), 'persisted');
SELECT pg_temp.expect_error('quality cannot be overstated',
	format('SELECT public.accept_agentic_chat_workflow_synthesis_v1(%L, %L, %L, 1, %L, %L, 18, %L, %L, %L, pg_temp.proj(%L), pg_temp.evt(%L))',
		pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), pg_temp.id('f1', 3), pg_temp.id('d4', 3),
		public.agentic_chat_sha256_hex_v1('Schedule is tight.'), 'complete', pg_temp.id('dc', 5), 'synthesizing', 'synthesizing'),
	'agentic_chat_workflow_synthesis_quality_overstated');
SELECT pg_temp.expect('partial synthesis', public.accept_agentic_chat_workflow_synthesis_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, pg_temp.id('f1', 3), pg_temp.id('d4', 3), 18,
	public.agentic_chat_sha256_hex_v1('Schedule is tight.'), 'partial', pg_temp.id('dc', 5),
	pg_temp.proj('synthesizing'), pg_temp.evt('synthesizing')), 'accepted');
SELECT pg_temp.expect('late answer batch', public.persist_agentic_chat_workflow_text_batch_v1(
	pg_temp.id('c4', 3), :'job3', pg_temp.id('c9', 3), 1, pg_temp.id('f1', 3), pg_temp.id('d4', 3), pg_temp.id('f2', 4), 18,
	' More.', 'Schedule is tight. More.', public.agentic_chat_sha256_hex_v1(' More.'),
	public.agentic_chat_sha256_hex_v1('Schedule is tight. More.')), 'stale_claim');
SELECT pg_temp.expect('finalize 3', public.finalize_agentic_chat_turn(
	pg_temp.id('c4', 3), :'user', :'job3', pg_temp.id('c9', 3), 1, 'completed', 'stop', NULL, pg_temp.id('f3', 3),
	'Schedule is tight.', '{}'::jsonb, NULL, NULL, NULL, pg_temp.proj('synthesizing'), '{}'::jsonb), 'finalized');
SELECT pg_temp.assert_true((SELECT terminal_outcome = 'partial' FROM public.chat_turn_workflow_runs
	WHERE turn_run_id = pg_temp.id('c4', 3)), 'completed partial synthesis ends as partial');

-- ---------------------------------------------------------------------------
-- Turns 4 and 5: whole-run deadline and revoked access fail closed
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect('admit 4', pg_temp.admit(4, NULL, 'client-4', :'project', 'Deadline probe?'), 'newly_admitted');
SELECT queue_job_id AS job4 FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 4) \gset
SELECT pg_temp.lease(4, pg_temp.id('c9', 4));
SELECT pg_temp.expect('claim 4', public.claim_agentic_chat_turn(pg_temp.id('c4', 4), :'job4', pg_temp.id('c9', 4)), 'claimed');
-- Backdate the claim so the whole-run deadline lands just after run creation.
RESET ROLE;
UPDATE public.chat_turn_runs turns
SET worker_started_at = runs.created_at - interval '900 seconds' + interval '1 millisecond'
FROM public.chat_turn_workflow_runs runs
WHERE turns.id = pg_temp.id('c4', 4) AND runs.turn_run_id = turns.id;
SELECT pg_sleep(0.01);
SET ROLE service_role;
SELECT pg_temp.expect('expired context', pg_temp.context(4, pg_temp.id('c9', 4), 1, 1), 'deadline_expired');
SELECT pg_temp.expect('expired recovery', public.recover_agentic_chat_workflow_turn_v1(
	pg_temp.id('c4', 4), :'job4', pg_temp.id('c9', 4), 1, 'transient_infra'), 'deadline_expired');
SELECT pg_temp.assert_true((SELECT deadline_at < now() FROM public.chat_turn_workflow_runs
	WHERE turn_run_id = pg_temp.id('c4', 4)), 'recovery persists the first-claim deadline');
SELECT pg_temp.expect('finalize 4', public.finalize_agentic_chat_turn(
	pg_temp.id('c4', 4), :'user', :'job4', pg_temp.id('c9', 4), 1, 'failed', 'deadline_expired', 'deadline_expired', NULL,
	'', '{}'::jsonb, NULL, NULL, NULL, '{}'::jsonb, '{}'::jsonb), 'finalized');
SELECT pg_temp.assert_true((SELECT terminal_outcome = 'failed' FROM public.chat_turn_workflow_runs
	WHERE turn_run_id = pg_temp.id('c4', 4)), 'failed turn ends failed');

SELECT pg_temp.expect('admit 5', pg_temp.admit(5, NULL, 'client-5', 'c3000000-0000-4000-8000-000000000003', 'Access probe?'), 'newly_admitted');
SELECT queue_job_id AS job5 FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 5) \gset
SELECT pg_temp.lease(5, pg_temp.id('c9', 5));
SELECT pg_temp.expect('claim 5', public.claim_agentic_chat_turn(pg_temp.id('c4', 5), :'job5', pg_temp.id('c9', 5)), 'claimed');
SELECT pg_temp.expect('begin 5', public.begin_agentic_chat_turn_execution(pg_temp.id('c4', 5), :'job5', pg_temp.id('c9', 5), 1), 'started');
RESET ROLE;
UPDATE public.onto_projects SET deleted_at = now() WHERE id = 'c3000000-0000-4000-8000-000000000003';
SET ROLE service_role;
SELECT pg_temp.expect('revoked context', pg_temp.context(5, pg_temp.id('c9', 5), 1, 1), 'access_revoked');
SELECT pg_temp.expect('revoked recovery', public.recover_agentic_chat_workflow_turn_v1(
	pg_temp.id('c4', 5), :'job5', pg_temp.id('c9', 5), 1, 'transient_infra'), 'access_revoked');
SELECT pg_temp.expect('permanent failures are not retried', public.recover_agentic_chat_workflow_turn_v1(
	pg_temp.id('c4', 5), :'job5', pg_temp.id('c9', 5), 1, 'permanent'), 'finalize_failed');
RESET ROLE;

SELECT 'agentic_chat_workflow_v1_contract_ok' AS contract;
