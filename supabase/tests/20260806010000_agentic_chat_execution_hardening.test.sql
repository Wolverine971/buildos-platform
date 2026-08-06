-- supabase/tests/20260806010000_agentic_chat_execution_hardening.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 4 Slice 16.
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

-- Keep this proof self-contained when composed with the compact historical
-- worker fixture instead of a hosted schema dump.
ALTER TABLE public.chat_turn_runs
	ADD COLUMN IF NOT EXISTS history_strategy text,
	ADD COLUMN IF NOT EXISTS history_compressed boolean,
	ADD COLUMN IF NOT EXISTS raw_history_count integer,
	ADD COLUMN IF NOT EXISTS history_for_model_count integer,
	ADD COLUMN IF NOT EXISTS cache_source text,
	ADD COLUMN IF NOT EXISTS cache_age_seconds numeric,
	ADD COLUMN IF NOT EXISTS request_prewarmed_context boolean;

INSERT INTO public.users (id)
VALUES ('fa100000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.seed_slice16_turn(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_user_message_id uuid,
	p_correlation_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_admitted_at timestamptz := clock_timestamp() - interval '10 seconds';
	v_accepted_at timestamptz := v_admitted_at + interval '100 milliseconds';
	v_worker_started_at timestamptz := v_admitted_at + interval '200 milliseconds';
	v_provider_authorized_at timestamptz := v_admitted_at + interval '300 milliseconds';
BEGIN
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		'global',
		'active'
	);

	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (
		p_user_message_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		'user',
		'execution hardening fixture',
		'{"idempotency_key":"slice16-user"}'::jsonb
	);

	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status,
		queue_job_id, processing_token, started_at, attempts, max_attempts
	) VALUES (
		p_queue_job_id,
		'fa100000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', p_turn_run_id,
			'correlationId', p_correlation_id
		),
		v_admitted_at,
		'agentic-chat-turn:' || p_turn_run_id::text,
		'processing',
		'agentic_chat_slice16_fixture',
		p_processing_token,
		v_worker_started_at,
		0,
		3
	);

	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, worker_started_at, execution_started_at,
		history_cutoff_at, last_progress_at, last_event_sequence, user_message_id,
		created_at, started_at, cache_source, cache_age_seconds,
		request_prewarmed_context, history_strategy, history_compressed,
		raw_history_count, history_for_model_count, prepared_prompt_hit,
		prepared_prompt_miss_reason, prepared_surface_profile
	) VALUES (
		p_turn_run_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		'slice16-stream',
		'slice16-client',
		'global',
		'execution hardening fixture',
		'running',
		'worker_realtime',
		p_queue_job_id,
		p_correlation_id,
		1,
		v_worker_started_at,
		v_provider_authorized_at,
		v_accepted_at,
		v_provider_authorized_at,
		1,
		p_user_message_id,
		v_admitted_at,
		v_accepted_at,
		'not_requested',
		NULL,
		false,
		'raw_history',
		false,
		0,
		0,
		false,
		NULL,
		NULL
	);

	INSERT INTO public.chat_turn_events (
		turn_run_id, session_id, user_id, stream_run_id, execution_generation,
		sequence_index, event_id, phase, event_type, payload, created_at
	) VALUES (
		p_turn_run_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		'slice16-stream',
		1,
		1,
		p_turn_run_id::text || ':1:1',
		'stream',
		'turn_phase',
		'{"type":"turn_phase","turn_phase":"acknowledged"}'::jsonb,
		v_admitted_at + interval '500 milliseconds'
	);

	INSERT INTO public.chat_turn_stream_state (
		turn_run_id, session_id, user_id, execution_generation,
		snapshot_sequence, durable_through_sequence, projection_durable_sequence,
		assistant_text, projection
	) VALUES (
		p_turn_run_id,
		p_turn_run_id,
		'fa100000-0000-4000-8000-000000000001',
		1,
		1,
		1,
		1,
		'',
		'{"version":"agentic_chat_ui_projection_v1","current_activity":"","semantic_events":[]}'::jsonb
	);
END;
$$;

SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)',
		'EXECUTE'
	)
	AND NOT has_function_privilege(
		'authenticated',
		'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)',
		'EXECUTE'
	)
	AND NOT has_table_privilege(
		'authenticated',
		'public.agentic_chat_execution_observations',
		'SELECT'
	),
	'execution observations are not service-only'
);

SELECT pg_temp.assert_true(
	position(
		'AND turns.execution_mode = ''worker_realtime''' IN
		pg_get_functiondef(
			'public.create_agentic_chat_turn_with_job(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,uuid,uuid,text,boolean,text,jsonb,text,text,jsonb,integer,text,jsonb,jsonb,text,integer,integer,uuid,text,text,jsonb,boolean)'::regprocedure
		)
	) > 0,
	'worker admission capacity remains cross-mode instead of worker-only'
);

SELECT pg_temp.seed_slice16_turn(
	'fc300000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	'fc600000-0000-4000-8000-000000000001',
	'fc700000-0000-4000-8000-000000000001'
);

SET ROLE service_role;
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('1', 64), 'provider', 'provider_attempt_started',
	'{"round":"initial","route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
) AS receipt \gset provider_started_
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('2', 64), 'provider', 'provider_attempt_ended',
	'{"round":"initial","route_id":"openrouter","model_requested":"provider/primary","status":"success","duration_ms":12,"finish_reason":"tool_calls","error_class":null,"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}'::jsonb
);
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('3', 64), 'tool', 'tool_execution_started',
	'{"tool_name":"get_project_overview","provider_tool_call_id":"read-1","sequence_index":1}'::jsonb
);
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('4', 64), 'tool', 'tool_execution_ended',
	'{"tool_name":"get_project_overview","provider_tool_call_id":"read-1","sequence_index":1,"status":"success","duration_ms":9,"error_code":null}'::jsonb
);
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('5', 64), 'provider', 'provider_attempt_started',
	'{"round":"synthesis","route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
);
SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('6', 64), 'provider', 'provider_attempt_ended',
	'{"round":"synthesis","route_id":"openrouter","model_requested":"provider/primary","status":"success","duration_ms":7,"finish_reason":"stop","error_class":null,"usage":null}'::jsonb
);

SELECT public.persist_agentic_chat_execution_observation(
	'fc300000-0000-4000-8000-000000000001',
	'fa100000-0000-4000-8000-000000000001',
	'fc400000-0000-4000-8000-000000000001',
	'fc500000-0000-4000-8000-000000000001',
	1, repeat('1', 64), 'provider', 'provider_attempt_started',
	'{"round":"initial","route_id":"openrouter","model_requested":"provider/primary"}'::jsonb
) AS receipt \gset provider_replay_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'provider_started_receipt'::jsonb->>'outcome' = 'persisted'
	AND :'provider_replay_receipt'::jsonb->>'outcome' = 'already_persisted',
	'exact observation replay was not idempotent'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 6
			AND bool_and(
				NOT payload ? 'content'
				AND NOT payload ? 'arguments'
				AND NOT payload ? 'result'
				AND NOT payload ? 'messages'
			)
		FROM public.agentic_chat_execution_observations
		WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000001'
	),
	'redacted provider/tool observations were not durably exact'
);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	(
		SELECT array_agg(event_type ORDER BY observation_sequence_index) = ARRAY[
			'turn_intent_resolved',
			'prepared_prompt_cache_checked',
			'provider_attempt_started',
			'provider_attempt_ended',
			'tool_execution_started',
			'tool_execution_ended',
			'provider_attempt_started',
			'provider_attempt_ended'
		]::text[]
		FROM public.agentic_chat_worker_lifecycle_observations
		WHERE turn_run_id = 'fc300000-0000-4000-8000-000000000001'
	),
	'provider/tool boundaries do not appear in the private lifecycle order'
);
RESET ROLE;

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$
			SELECT public.persist_agentic_chat_execution_observation(
				'fc300000-0000-4000-8000-000000000001',
				'fa100000-0000-4000-8000-000000000001',
				'fc400000-0000-4000-8000-000000000001',
				'fc500000-0000-4000-8000-000000000001',
				1, repeat('7', 64), 'provider', 'provider_attempt_started',
				'{"round":"initial","route_id":"openrouter","content":"secret"}'::jsonb
			)
		$$,
		'payload_not_redacted'
	),
	'observation payload accepted provider content'
);
RESET ROLE;

SELECT 'phase4_slice16_execution_hardening_ok' AS result;
