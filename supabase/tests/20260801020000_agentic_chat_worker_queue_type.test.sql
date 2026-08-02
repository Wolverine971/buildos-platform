-- supabase/tests/20260801020000_agentic_chat_worker_queue_type.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2A Slice 2.
-- Prerequisite: apply 20260801020000_agentic_chat_worker_queue_type.sql.
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

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT count(*) = 1
			FROM pg_enum enum_values
			JOIN pg_type types ON types.oid = enum_values.enumtypid
			JOIN pg_namespace schemas ON schemas.oid = types.typnamespace
			WHERE schemas.nspname = 'public'
				AND types.typname = 'queue_type'
				AND enum_values.enumlabel = 'agentic_chat_turn'
		),
		'agentic_chat_turn is absent or duplicated in public.queue_type'
	);
	PERFORM pg_temp.assert_true(
		(
			SELECT count(*) = 3
			FROM unnest(enum_range(NULL::public.queue_type)) AS queue_values(value)
			WHERE value::text = ANY(ARRAY['other', 'agent_run', 'agentic_chat_turn'])
		),
		'existing queue types were not preserved'
	);
END;
$$;

INSERT INTO public.queue_jobs (id, job_type)
VALUES (
	'b1000000-0000-4000-8000-000000000001',
	'agentic_chat_turn'
);

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		(
			SELECT job_type = 'agentic_chat_turn'::public.queue_type
			FROM public.queue_jobs
			WHERE id = 'b1000000-0000-4000-8000-000000000001'
		),
		'agentic_chat_turn cannot be stored as a queue job type after commit'
	);
END;
$$;

SELECT 'phase2a_queue_type_ok' AS result;
