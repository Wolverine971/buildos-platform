-- supabase/tests/20260829235308_agent_call_bootstrap_hardening.test.sql
-- Disposable PostgreSQL verification for agent-call bootstrap retention.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

\ir fixtures/agent_call_bootstrap_hardening_base.sql
\ir ../migrations/20260829235308_agent_call_bootstrap_hardening.sql

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

SELECT pg_temp.assert_true(
	NOT has_function_privilege(
		'anon',
		'public.cleanup_expired_agent_call_bootstrap_links(integer)',
		'EXECUTE'
	)
		AND NOT has_function_privilege(
			'authenticated',
			'public.cleanup_expired_agent_call_bootstrap_links(integer)',
			'EXECUTE'
		)
		AND has_function_privilege(
			'service_role',
			'public.cleanup_expired_agent_call_bootstrap_links(integer)',
			'EXECUTE'
		),
	'bootstrap cleanup must remain service-role only'
);

INSERT INTO auth.users (id)
VALUES ('ba000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.external_agent_callers (
	id,
	user_id,
	provider,
	caller_key,
	token_prefix,
	token_hash
) VALUES (
	'ba100000-0000-4000-8000-000000000001',
	'ba000000-0000-4000-8000-000000000001',
	'test',
	'bootstrap-retention-test',
	'boca_test',
	'bootstrap-retention-token-hash'
);

INSERT INTO public.agent_call_bootstrap_links (
	id,
	user_id,
	external_agent_caller_id,
	setup_token_hash,
	payload,
	expires_at
) VALUES
	(
		'ba200000-0000-4000-8000-000000000001',
		'ba000000-0000-4000-8000-000000000001',
		'ba100000-0000-4000-8000-000000000001',
		'bootstrap-expired-1',
		'{}'::jsonb,
		clock_timestamp() - interval '2 hours'
	),
	(
		'ba200000-0000-4000-8000-000000000002',
		'ba000000-0000-4000-8000-000000000001',
		'ba100000-0000-4000-8000-000000000001',
		'bootstrap-expired-2',
		'{}'::jsonb,
		clock_timestamp() - interval '1 hour'
	),
	(
		'ba200000-0000-4000-8000-000000000003',
		'ba000000-0000-4000-8000-000000000001',
		'ba100000-0000-4000-8000-000000000001',
		'bootstrap-active',
		'{}'::jsonb,
		clock_timestamp() + interval '1 hour'
	);

SET LOCAL ROLE service_role;
SELECT public.cleanup_expired_agent_call_bootstrap_links(1) AS deleted \gset first_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'first_deleted'::integer = 1,
	'cleanup respects the requested batch size'
);

SET LOCAL ROLE service_role;
SELECT public.cleanup_expired_agent_call_bootstrap_links(10) AS deleted \gset second_
RESET ROLE;

SELECT pg_temp.assert_true(
	:'second_deleted'::integer = 1,
	'cleanup removes the remaining expired link'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.agent_call_bootstrap_links),
	'cleanup preserves unexpired links'
);
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM public.agent_call_bootstrap_links
		WHERE setup_token_hash = 'bootstrap-active'
	),
	'unexpired bootstrap link remains available'
);

ROLLBACK;
