-- supabase/tests/20260802029900_agentic_chat_worker_message_idempotency_guard.test.sql
-- Disposable PostgreSQL verification for the worker chat-message idempotency
-- namespace guard. Never run against a linked database.

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

SELECT pg_temp.assert_true(
	to_regprocedure('public.validate_agentic_chat_message_idempotency_key()') IS NOT NULL
		AND NOT has_function_privilege(
			'anon',
			'public.validate_agentic_chat_message_idempotency_key()',
			'EXECUTE'
		)
		AND NOT has_function_privilege(
			'authenticated',
			'public.validate_agentic_chat_message_idempotency_key()',
			'EXECUTE'
		),
	'worker message idempotency guard or its execute lockdown is missing'
);

BEGIN;
INSERT INTO public.users (id) VALUES ('f1000000-0000-4000-8000-000000000001');
INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'f2000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	'global',
	'active'
);
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;

SET LOCAL ROLE authenticated;
INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, metadata
) VALUES (
	'f3000000-0000-4000-8000-000000000001',
	'f2000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	'assistant',
	'legacy-compatible',
	'{"idempotency_key":"turn:legacy-client:assistant"}'::jsonb
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			INSERT INTO public.chat_messages (
				id, session_id, user_id, role, content, metadata
			) VALUES (
				'f3000000-0000-4000-8000-000000000002',
				'f2000000-0000-4000-8000-000000000001',
				'f1000000-0000-4000-8000-000000000001',
				'assistant',
				'preempt terminal key',
				'{"idempotency_key":"chat-turn:f4000000-0000-4000-8000-000000000001:assistant"}'::jsonb
			)
		$test$,
		'agentic_chat_message_idempotency_key_reserved'
	),
	'authenticated caller preempted the reserved worker assistant key'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			UPDATE public.chat_messages
			SET metadata = '{"idempotency_key":"chat-turn:f4000000-0000-4000-8000-000000000001:user"}'::jsonb
			WHERE id = 'f3000000-0000-4000-8000-000000000001'
		$test$,
		'agentic_chat_message_idempotency_key_reserved'
	),
	'authenticated caller rewrote an ordinary key into the reserved worker namespace'
);
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, metadata
) VALUES (
	'f3000000-0000-4000-8000-000000000003',
	'f2000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000001',
	'assistant',
	'trusted terminal write',
	'{"idempotency_key":"chat-turn:f4000000-0000-4000-8000-000000000001:assistant"}'::jsonb
);
RESET ROLE;

SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.chat_messages
		WHERE session_id = 'f2000000-0000-4000-8000-000000000001') = 2,
	'guard rejected a legacy key or trusted reserved-key insert'
);
ROLLBACK;

-- Signed request-role validation must survive a definer wrapper whose owner is
-- otherwise trusted by the trigger.
CREATE OR REPLACE FUNCTION public.test_insert_reserved_agentic_chat_message()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	INSERT INTO public.chat_messages (
		id, session_id, user_id, role, content, metadata
	) VALUES (
		'f3000000-0000-4000-8000-000000000004',
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'assistant',
		'definer preemption',
		'{"idempotency_key":"chat-turn:f4000000-0000-4000-8000-000000000001:assistant"}'::jsonb
	)
$$;
GRANT EXECUTE ON FUNCTION public.test_insert_reserved_agentic_chat_message()
	TO authenticated;
SET request.jwt.claims = '{"role":"authenticated"}';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.test_insert_reserved_agentic_chat_message()',
		'agentic_chat_message_idempotency_key_reserved'
	),
	'definer wrapper bypassed the signed-role reserved-key guard'
);
RESET ROLE;
RESET request.jwt.claims;
DROP FUNCTION public.test_insert_reserved_agentic_chat_message();

SELECT 'phase2b_message_idempotency_guard_ok' AS result;
