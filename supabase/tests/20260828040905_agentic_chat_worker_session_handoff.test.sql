-- Disposable PostgreSQL proof for the generation-fenced worker session handoff.
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

-- The historical worker fixture intentionally omits ontology tables. Model
-- only the access projection required by this focused handoff proof.
CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY,
	user_id uuid UNIQUE REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE TABLE public.onto_project_members (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL,
	actor_id uuid NOT NULL REFERENCES public.onto_actors(id) ON DELETE CASCADE,
	removed_at timestamptz
);
GRANT SELECT ON public.onto_actors, public.onto_project_members TO service_role;

INSERT INTO public.users (id)
VALUES ('a1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (
	id, user_id, context_type, status, entity_id, agent_metadata
)
VALUES (
	'a2000000-0000-4000-8000-000000000001',
	'a1000000-0000-4000-8000-000000000001',
	'project_create',
	'active',
	NULL,
	'{"retained":"value"}'::jsonb
);

INSERT INTO public.onto_actors (id, user_id)
VALUES (
	'a3000000-0000-4000-8000-000000000001',
	'a1000000-0000-4000-8000-000000000001'
);
INSERT INTO public.onto_project_members (project_id, actor_id)
VALUES (
	'a4000000-0000-4000-8000-000000000001',
	'a3000000-0000-4000-8000-000000000001'
);

INSERT INTO public.queue_jobs (
	id, job_type, user_id, metadata, queue_job_id, status,
	processing_token, dedup_key
)
VALUES (
	'a5000000-0000-4000-8000-000000000001',
	'agentic_chat_turn',
	'a1000000-0000-4000-8000-000000000001',
	'{"turnRunId":"a6000000-0000-4000-8000-000000000001","correlationId":"a7000000-0000-4000-8000-000000000001"}'::jsonb,
	'agentic_chat_turn_a5000000-0000-4000-8000-000000000001',
	'processing',
	'a8000000-0000-4000-8000-000000000001',
	'agentic-chat-turn:a6000000-0000-4000-8000-000000000001'
);

INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, source,
	context_type, entity_id, project_id, gateway_enabled, request_message,
	status, execution_mode, queue_job_id, correlation_id,
	execution_generation, request_payload, request_payload_version,
	transport_contract_version, worker_started_at, execution_started_at
)
VALUES (
	'a6000000-0000-4000-8000-000000000001',
	'a2000000-0000-4000-8000-000000000001',
	'a1000000-0000-4000-8000-000000000001',
	'session-handoff-stream-1',
	'session-handoff-client-1',
	'live_ui',
	'project_create',
	NULL,
	NULL,
	true,
	'Create the project',
	'running',
	'worker_realtime',
	'a5000000-0000-4000-8000-000000000001',
	'a7000000-0000-4000-8000-000000000001',
	1,
	'{"context":{"type":"project_create"}}'::jsonb,
	'agentic_chat_request_v1',
	'agentic_chat_worker_v1',
	now(),
	now()
);

CREATE TEMP TABLE handoff_results (name text PRIMARY KEY, result jsonb);
GRANT SELECT, INSERT ON handoff_results TO service_role;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
	PERFORM public.persist_agentic_chat_session_handoff(
		'a6000000-0000-4000-8000-000000000001',
		'a1000000-0000-4000-8000-000000000001',
		'a5000000-0000-4000-8000-000000000001',
		'a8000000-0000-4000-8000-000000000001',
		1,
		'project',
		'a4000000-0000-4000-8000-000000000001',
		'a4000000-0000-4000-8000-000000000001'
	);
	RAISE EXCEPTION 'authenticated handoff unexpectedly succeeded';
EXCEPTION
	WHEN insufficient_privilege THEN NULL;
END;
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO handoff_results
VALUES (
	'first',
	public.persist_agentic_chat_session_handoff(
		'a6000000-0000-4000-8000-000000000001',
		'a1000000-0000-4000-8000-000000000001',
		'a5000000-0000-4000-8000-000000000001',
		'a8000000-0000-4000-8000-000000000001',
		1,
		'project',
		'a4000000-0000-4000-8000-000000000001',
		'a4000000-0000-4000-8000-000000000001'
	)
);

INSERT INTO handoff_results
VALUES (
	'replay',
	public.persist_agentic_chat_session_handoff(
		'a6000000-0000-4000-8000-000000000001',
		'a1000000-0000-4000-8000-000000000001',
		'a5000000-0000-4000-8000-000000000001',
		'a8000000-0000-4000-8000-000000000001',
		1,
		'project',
		'a4000000-0000-4000-8000-000000000001',
		'a4000000-0000-4000-8000-000000000001'
	)
);

INSERT INTO handoff_results
VALUES (
	'stale',
	public.persist_agentic_chat_session_handoff(
		'a6000000-0000-4000-8000-000000000001',
		'a1000000-0000-4000-8000-000000000001',
		'a5000000-0000-4000-8000-000000000001',
		'a8000000-0000-4000-8000-000000000001',
		2,
		'project',
		'a4000000-0000-4000-8000-000000000001',
		'a4000000-0000-4000-8000-000000000001'
	)
);

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'persisted' FROM handoff_results WHERE name = 'first')
		AND (SELECT result->>'outcome' = 'already_applied'
			FROM handoff_results WHERE name = 'replay')
		AND (SELECT result->>'shifted_at' FROM handoff_results WHERE name = 'first')
			= (SELECT result->>'shifted_at' FROM handoff_results WHERE name = 'replay'),
	'first write and exact replay did not converge on one handoff'
);

SELECT pg_temp.assert_true(
	(SELECT result->>'outcome' = 'stale_generation'
		FROM handoff_results WHERE name = 'stale'),
	'stale generation did not fail closed'
);

SELECT pg_temp.assert_true(
	(
		SELECT context_type = 'project'
			AND entity_id = 'a4000000-0000-4000-8000-000000000001'
			AND agent_metadata->>'retained' = 'value'
			AND agent_metadata->'fastchat_last_context_shift'->>'context_type' = 'project'
			AND agent_metadata->'fastchat_last_context_shift'->>'entity_id'
				= 'a4000000-0000-4000-8000-000000000001'
			AND agent_metadata->'fastchat_last_context_shift'->>'project_id'
				= 'a4000000-0000-4000-8000-000000000001'
			AND agent_metadata->'fastchat_last_context_shift'->>'turn_run_id'
				= 'a6000000-0000-4000-8000-000000000001'
			AND agent_metadata->'fastchat_last_context_shift'->>'execution_generation' = '1'
		FROM public.chat_sessions
		WHERE id = 'a2000000-0000-4000-8000-000000000001'
	),
	'session scope or durable context-shift metadata is incomplete'
);

RESET ROLE;
ROLLBACK;

SELECT 'agentic_chat_worker_session_handoff_ok' AS result;
