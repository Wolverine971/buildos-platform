-- supabase/tests/20260801030600_agentic_chat_worker_queue_function_lockdown.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2A Slice 5.
-- Prerequisite: apply 20260801030600_agentic_chat_worker_queue_function_lockdown.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY.

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

BEGIN;

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		NOT has_table_privilege('anon', 'public.queue_jobs', 'INSERT')
			AND NOT has_table_privilege('authenticated', 'public.queue_jobs', 'INSERT')
			AND has_table_privilege('service_role', 'public.queue_jobs', 'INSERT'),
		'queue_jobs INSERT grants are not server-only'
	);

	PERFORM pg_temp.assert_true(
		NOT has_function_privilege(
			'anon',
			'public.add_queue_job(uuid,text,jsonb,integer,timestamp with time zone,text)',
			'EXECUTE'
		)
			AND NOT has_function_privilege(
				'authenticated',
				'public.add_queue_job(uuid,text,jsonb,integer,timestamp with time zone,text)',
				'EXECUTE'
			)
			AND has_function_privilege(
				'service_role',
				'public.add_queue_job(uuid,text,jsonb,integer,timestamp with time zone,text)',
				'EXECUTE'
			),
		'add_queue_job execution grants are not server-only'
	);

	PERFORM pg_temp.assert_true(
		to_regprocedure('public.reset_stalled_jobs(text)') IS NULL
			AND to_regprocedure('public.reset_stalled_jobs(text,text[],text[])') IS NOT NULL,
		'reset_stalled_jobs legacy overload survived or scoped overload is missing'
	);

	PERFORM pg_temp.assert_true(
		NOT has_function_privilege(
			'anon',
			'public.reset_stalled_jobs(text,text[],text[])',
			'EXECUTE'
		)
			AND NOT has_function_privilege(
				'authenticated',
				'public.reset_stalled_jobs(text,text[],text[])',
				'EXECUTE'
			)
			AND has_function_privilege(
				'service_role',
				'public.reset_stalled_jobs(text,text[],text[])',
				'EXECUTE'
			),
		'reset_stalled_jobs execution grants are not server-only'
	);

	PERFORM pg_temp.assert_true(
		(
			SELECT NOT procedures.prosecdef
				AND 'search_path=pg_catalog, public' = ANY(procedures.proconfig)
			FROM pg_proc procedures
			WHERE procedures.oid =
				'public.add_queue_job(uuid,text,jsonb,integer,timestamp with time zone,text)'::regprocedure
		) AND (
			SELECT NOT procedures.prosecdef
				AND 'search_path=pg_catalog, public' = ANY(procedures.proconfig)
			FROM pg_proc procedures
			WHERE procedures.oid =
				'public.reset_stalled_jobs(text,text[],text[])'::regprocedure
		),
		'queue functions are not explicit invokers with a pinned search path'
	);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.authenticated_insert_is_rejected()
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
	INSERT INTO public.queue_jobs (job_type)
	VALUES ('other');
	RETURN false;
EXCEPTION
	WHEN insufficient_privilege THEN RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.authenticated_add_is_rejected()
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
	PERFORM public.add_queue_job(
		'a1000000-0000-4000-8000-000000000001',
		'other',
		'{}'::jsonb
	);
	RETURN false;
EXCEPTION
	WHEN insufficient_privilege THEN RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.authenticated_reset_is_rejected()
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
	PERFORM public.reset_stalled_jobs('5 minutes', ARRAY['other'], ARRAY[]::text[]);
	RETURN false;
EXCEPTION
	WHEN insufficient_privilege THEN RETURN true;
END;
$$;

SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.authenticated_insert_is_rejected(),
	'authenticated direct queue insert succeeded'
);
SELECT pg_temp.assert_true(
	pg_temp.authenticated_add_is_rejected(),
	'authenticated add_queue_job execution succeeded'
);
SELECT pg_temp.assert_true(
	pg_temp.authenticated_reset_is_rejected(),
	'authenticated reset_stalled_jobs execution succeeded'
);
RESET ROLE;

-- A user-callable SECURITY DEFINER wrapper still carries the trusted request
-- claim. add_queue_job must reject agentic_chat_turn instead of trusting the
-- wrapper owner's effective role.
CREATE OR REPLACE FUNCTION pg_temp.definer_agentic_add_is_rejected()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	PERFORM public.add_queue_job(
		'a1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		'{}'::jsonb
	);
	RETURN false;
EXCEPTION
	WHEN insufficient_privilege THEN
		RETURN SQLERRM = 'agentic_chat_queue_service_role_required';
END;
$$;

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false);
SELECT pg_temp.assert_true(
	pg_temp.definer_agentic_add_is_rejected(),
	'authenticated request claim bypassed the agentic queue guard through a definer wrapper'
);

-- The intended service path can create both ordinary and agentic-chat rows.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT pg_temp.assert_true(
	public.add_queue_job(
		'a1000000-0000-4000-8000-000000000001',
		'other',
		'{}'::jsonb,
		10,
		now(),
		'phase2a-queue-lockdown-other'
	) IS NOT NULL,
	'service_role could not enqueue an ordinary job'
);
SELECT pg_temp.assert_true(
	public.add_queue_job(
		'a1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		'{}'::jsonb,
		10,
		now(),
		'phase2a-queue-lockdown-agentic'
	) IS NOT NULL,
	'service_role could not enqueue an agentic-chat job'
);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT count(*) = 2
				AND bool_and(metadata ? 'correlationId')
			FROM public.queue_jobs
			WHERE dedup_key IN (
				'phase2a-queue-lockdown-other',
				'phase2a-queue-lockdown-agentic'
			)
		),
		'service queue admission did not preserve rows and correlation metadata'
	);
END;
$$;

INSERT INTO public.queue_jobs (
	id,
	user_id,
	job_type,
	queue_job_id,
	status,
	attempts,
	max_attempts,
	scheduled_for,
	started_at,
	updated_at,
	processing_token
)
VALUES
	(
		'a2000000-0000-4000-8000-000000000001',
		'a1000000-0000-4000-8000-000000000001',
		'other',
		'phase2a_stalled_other',
		'processing',
		0,
		3,
		now() - interval '20 minutes',
		now() - interval '20 minutes',
		now() - interval '20 minutes',
		'a3000000-0000-4000-8000-000000000001'
	),
	(
		'a2000000-0000-4000-8000-000000000002',
		'a1000000-0000-4000-8000-000000000001',
		'agent_run',
		'phase2a_stalled_agent_run',
		'processing',
		0,
		3,
		now() - interval '20 minutes',
		now() - interval '20 minutes',
		now() - interval '20 minutes',
		'a3000000-0000-4000-8000-000000000002'
	),
	(
		'a2000000-0000-4000-8000-000000000003',
		'a1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		'phase2a_stalled_agentic',
		'processing',
		0,
		3,
		now() - interval '20 minutes',
		now() - interval '20 minutes',
		now() - interval '20 minutes',
		'a3000000-0000-4000-8000-000000000003'
	);

SET ROLE service_role;
SELECT pg_temp.assert_true(
	public.reset_stalled_jobs(
		'5 minutes',
		ARRAY['other', 'agent_run', 'agentic_chat_turn'],
		ARRAY['agent_run']
	) = 1,
	'include/exclude recovery did not reset exactly the owned ordinary job'
);
RESET ROLE;

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT status = 'pending'
				AND attempts = 1
				AND processing_token IS NULL
			FROM public.queue_jobs
			WHERE id = 'a2000000-0000-4000-8000-000000000001'
		),
		'owned ordinary stalled job was not reset correctly'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT status = 'processing' AND attempts = 0
			FROM public.queue_jobs
			WHERE id = 'a2000000-0000-4000-8000-000000000002'
		),
		'explicitly excluded worker job was reset'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT status = 'processing'
				AND attempts = 0
				AND processing_token = 'a3000000-0000-4000-8000-000000000003'
			FROM public.queue_jobs
			WHERE id = 'a2000000-0000-4000-8000-000000000003'
		),
		'generic recovery changed an agentic-chat job'
	);
END;
$$;

SET ROLE service_role;
SELECT pg_temp.assert_true(
	public.reset_stalled_jobs('5 minutes', ARRAY[]::text[], ARRAY[]::text[]) = 0,
	'an empty consumer registration reset jobs'
);
SELECT pg_temp.assert_true(
	public.reset_stalled_jobs('5 minutes', ARRAY['agentic_chat_turn'], NULL::text[]) = 0,
	'a NULL exclusion bypassed the hard agentic-chat recovery exclusion'
);
SELECT pg_temp.assert_true(
	public.reset_stalled_jobs('5 minutes') = 1,
	'backward-compatible default recovery did not reset the remaining ordinary job'
);
RESET ROLE;

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT status = 'pending' AND attempts = 1
			FROM public.queue_jobs
			WHERE id = 'a2000000-0000-4000-8000-000000000002'
		),
		'default recovery failed to preserve legacy ordinary-job behavior'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT status = 'processing' AND attempts = 0
			FROM public.queue_jobs
			WHERE id = 'a2000000-0000-4000-8000-000000000003'
		),
		'default recovery reset an agentic-chat job'
	);
END;
$$;

ROLLBACK;

SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.queue_jobs),
	'queue lockdown fixture rows survived rollback'
);

\echo phase2a_queue_function_lockdown_ok
