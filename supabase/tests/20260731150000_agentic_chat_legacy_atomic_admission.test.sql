-- supabase/tests/20260731150000_agentic_chat_legacy_atomic_admission.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 1 Slice 1A.
-- Prerequisite: apply 20260731150000_agentic_chat_legacy_atomic_admission.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. This fixture commits rows so two dblink
-- connections can prove advisory-lock concurrency; never run it against a linked,
-- staging, or production database.

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

CREATE OR REPLACE FUNCTION pg_temp.admit_legacy(
	p_user_id uuid,
	p_session_id uuid,
	p_turn_run_id uuid,
	p_user_message_id uuid,
	p_stream_run_id text,
	p_client_turn_id text,
	p_request_hash text,
	p_request_message text DEFAULT 'Current request',
	p_user_message_content text DEFAULT 'Current request',
	p_started_at timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT public.admit_legacy_agentic_chat_turn(
		p_user_id,
		p_session_id,
		p_turn_run_id,
		p_user_message_id,
		p_stream_run_id,
		p_client_turn_id,
		p_request_hash,
		'agentic_chat_request_hash_v2',
		'global',
		NULL,
		NULL,
		'live_ui',
		true,
		p_request_message,
		p_started_at,
		p_user_message_content,
		jsonb_build_object('client_turn_id', p_client_turn_id),
		10,
		285000,
		120000,
		60000
	);
$$;

-- Invented fixture identities.
INSERT INTO public.users (id)
VALUES
	('f1000000-0000-4000-8000-000000000001'),
	('f1000000-0000-4000-8000-000000000002');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('f2000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('f2000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('f2000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000002', 'global', 'active');

INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, metadata, created_at
)
VALUES
	(
		'f3000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'user',
		'Prior question',
		'{}'::jsonb,
		'2026-07-31T10:00:00Z'
	),
	(
		'f3000000-0000-4000-8000-000000000002',
		'f2000000-0000-4000-8000-000000000001',
		'f1000000-0000-4000-8000-000000000001',
		'assistant',
		'Prior answer',
		'{}'::jsonb,
		'2026-07-31T10:01:00Z'
	);

DO $$
DECLARE
	result jsonb;
	turn_count bigint;
	message_count bigint;
BEGIN
	result := pg_temp.admit_legacy(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000001',
		'f4000000-0000-4000-8000-000000000001',
		'f5000000-0000-4000-8000-000000000001',
		'atomic-stream-1',
		'f6000000-0000-4000-8000-000000000001',
		repeat('a', 64),
		'Current request',
		'Current request',
		'2026-07-31T10:02:00Z'
	);

	PERFORM pg_temp.assert_true(result->>'outcome' = 'newly_admitted', 'new admission outcome');
	PERFORM pg_temp.assert_true((result->>'execution_may_start')::boolean, 'new admission may execute');
	PERFORM pg_temp.assert_true(result->>'execution_mode' = 'legacy_sse', 'legacy execution mode');
	PERFORM pg_temp.assert_true(
		jsonb_array_length(result->'fallback_snapshot'->'messages') = 2,
		'prior bounded messages were not returned'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(result->'fallback_snapshot'->'messages') message
			WHERE message->>'id' = 'f5000000-0000-4000-8000-000000000001'
		),
		'fallback history included the newly admitted message'
	);
	PERFORM pg_temp.assert_true(
		(SELECT user_message_id FROM public.chat_turn_runs WHERE id = 'f4000000-0000-4000-8000-000000000001')
			= 'f5000000-0000-4000-8000-000000000001',
		'turn was not linked to its user message'
	);
	PERFORM pg_temp.assert_true(
		(SELECT metadata->>'idempotency_key' FROM public.chat_messages WHERE id = 'f5000000-0000-4000-8000-000000000001')
			= 'chat-turn:f4000000-0000-4000-8000-000000000001:user',
		'deterministic message idempotency key was not stored'
	);

	SELECT count(*) INTO turn_count
	FROM public.chat_turn_runs
	WHERE user_id = 'f1000000-0000-4000-8000-000000000001'
		AND client_turn_id = 'f6000000-0000-4000-8000-000000000001';
	SELECT count(*) INTO message_count
	FROM public.chat_messages
	WHERE session_id = 'f2000000-0000-4000-8000-000000000001'
		AND metadata->>'idempotency_key' = 'chat-turn:f4000000-0000-4000-8000-000000000001:user';
	PERFORM pg_temp.assert_true(turn_count = 1 AND message_count = 1, 'new admission was not exactly once');

	result := pg_temp.admit_legacy(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000001',
		'f4000000-0000-4000-8000-000000000099',
		'f5000000-0000-4000-8000-000000000099',
		'atomic-stream-1',
		'f6000000-0000-4000-8000-000000000001',
		repeat('a', 64)
	);
	PERFORM pg_temp.assert_true(result->>'outcome' = 'matching_duplicate', 'matching duplicate outcome');
	PERFORM pg_temp.assert_true(
		result->>'turn_run_id' = 'f4000000-0000-4000-8000-000000000001'
		AND result->>'user_message_id' = 'f5000000-0000-4000-8000-000000000001',
		'matching duplicate did not return original identities'
	);

	result := pg_temp.admit_legacy(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000001',
		'f4000000-0000-4000-8000-000000000098',
		'f5000000-0000-4000-8000-000000000098',
		'atomic-stream-conflict',
		'f6000000-0000-4000-8000-000000000001',
		repeat('b', 64)
	);
	PERFORM pg_temp.assert_true(result->>'outcome' = 'idempotency_conflict', 'hash conflict outcome');
	PERFORM pg_temp.assert_true(
		NOT EXISTS (SELECT 1 FROM public.chat_turn_runs WHERE id = 'f4000000-0000-4000-8000-000000000098')
		AND NOT EXISTS (SELECT 1 FROM public.chat_messages WHERE id = 'f5000000-0000-4000-8000-000000000098'),
		'hash conflict created rows'
	);
END;
$$;

-- A current running turn blocks admission without inserting the requested message.
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, context_type, request_message,
	status, started_at, last_progress_at
)
VALUES (
	'f4000000-0000-4000-8000-000000000010',
	'f2000000-0000-4000-8000-000000000002',
	'f1000000-0000-4000-8000-000000000001',
	'active-stream', 'global', 'Active request', 'running', clock_timestamp(), clock_timestamp()
);

DO $$
DECLARE result jsonb;
BEGIN
	result := pg_temp.admit_legacy(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000002',
		'f4000000-0000-4000-8000-000000000011',
		'f5000000-0000-4000-8000-000000000011',
		'blocked-stream',
		'f6000000-0000-4000-8000-000000000011',
		repeat('c', 64)
	);
	PERFORM pg_temp.assert_true(result->>'outcome' = 'active_turn_conflict', 'active conflict outcome');
	PERFORM pg_temp.assert_true(
		NOT EXISTS (SELECT 1 FROM public.chat_messages WHERE id = 'f5000000-0000-4000-8000-000000000011'),
		'active conflict inserted a message'
	);
END;
$$;

-- Preserve the current heartbeat/age stale-reclaim rule.
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, context_type, request_message,
	status, started_at, last_progress_at
)
VALUES (
	'f4000000-0000-4000-8000-000000000020',
	'f2000000-0000-4000-8000-000000000003',
	'f1000000-0000-4000-8000-000000000001',
	'stale-stream', 'global', 'Stale request', 'running',
	clock_timestamp() - interval '4 minutes', clock_timestamp() - interval '3 minutes'
);

DO $$
DECLARE result jsonb;
BEGIN
	result := pg_temp.admit_legacy(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000003',
		'f4000000-0000-4000-8000-000000000021',
		'f5000000-0000-4000-8000-000000000021',
		'after-stale-stream',
		'f6000000-0000-4000-8000-000000000021',
		repeat('d', 64)
	);
	PERFORM pg_temp.assert_true(result->>'outcome' = 'newly_admitted', 'stale reclaim did not admit');
	PERFORM pg_temp.assert_true(
		result->>'reclaimed_turn_run_id' = 'f4000000-0000-4000-8000-000000000020',
		'stale reclaim identity missing'
	);
	PERFORM pg_temp.assert_true(
		(SELECT status = 'cancelled' AND finished_reason = 'stale_running_turn'
		 FROM public.chat_turn_runs WHERE id = 'f4000000-0000-4000-8000-000000000020'),
		'stale turn was not cancelled with legacy semantics'
	);
END;
$$;

-- A message failure must roll the turn insert back.
CREATE OR REPLACE FUNCTION pg_temp.fail_atomic_admission_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.content = 'force atomic rollback' THEN
		RAISE EXCEPTION 'forced_message_failure';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_fail_atomic_admission_message
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_atomic_admission_message();

DO $$
BEGIN
	BEGIN
		PERFORM pg_temp.admit_legacy(
			'f1000000-0000-4000-8000-000000000001',
			'f2000000-0000-4000-8000-000000000004',
			'f4000000-0000-4000-8000-000000000030',
			'f5000000-0000-4000-8000-000000000030',
			'rollback-stream',
			'f6000000-0000-4000-8000-000000000030',
			repeat('e', 64),
			'force atomic rollback',
			'force atomic rollback'
		);
		RAISE EXCEPTION 'expected_forced_message_failure';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM = 'expected_forced_message_failure' THEN RAISE; END IF;
	END;
	PERFORM pg_temp.assert_true(
		NOT EXISTS (SELECT 1 FROM public.chat_turn_runs WHERE id = 'f4000000-0000-4000-8000-000000000030'),
		'message failure did not roll back the turn'
	);
END;
$$;

DROP TRIGGER test_fail_atomic_admission_message ON public.chat_messages;

-- A turn/message linkage failure must roll both inserted rows back.
CREATE OR REPLACE FUNCTION pg_temp.fail_atomic_admission_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.id = 'f4000000-0000-4000-8000-000000000031'
		AND NEW.user_message_id IS NOT NULL THEN
		RAISE EXCEPTION 'forced_link_failure';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_fail_atomic_admission_link
BEFORE UPDATE ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_atomic_admission_link();

DO $$
BEGIN
	BEGIN
		PERFORM pg_temp.admit_legacy(
			'f1000000-0000-4000-8000-000000000001',
			'f2000000-0000-4000-8000-000000000004',
			'f4000000-0000-4000-8000-000000000031',
			'f5000000-0000-4000-8000-000000000031',
			'rollback-link-stream',
			'f6000000-0000-4000-8000-000000000031',
			repeat('3', 64)
		);
		RAISE EXCEPTION 'expected_forced_link_failure';
	EXCEPTION WHEN OTHERS THEN
		IF SQLERRM = 'expected_forced_link_failure' THEN RAISE; END IF;
	END;
	PERFORM pg_temp.assert_true(
		NOT EXISTS (SELECT 1 FROM public.chat_turn_runs WHERE id = 'f4000000-0000-4000-8000-000000000031')
		AND NOT EXISTS (SELECT 1 FROM public.chat_messages WHERE id = 'f5000000-0000-4000-8000-000000000031'),
		'link failure did not roll back both rows'
	);
END;
$$;

DROP TRIGGER test_fail_atomic_admission_link ON public.chat_turn_runs;

-- Session ownership is revalidated inside the definer function.
DO $$
BEGIN
	BEGIN
		PERFORM pg_temp.admit_legacy(
			'f1000000-0000-4000-8000-000000000001',
			'f2000000-0000-4000-8000-000000000006',
			'f4000000-0000-4000-8000-000000000040',
			'f5000000-0000-4000-8000-000000000040',
			'wrong-owner-stream',
			'f6000000-0000-4000-8000-000000000040',
			repeat('f', 64)
		);
		RAISE EXCEPTION 'expected_session_not_owned';
	EXCEPTION WHEN SQLSTATE 'P0001' THEN
		IF SQLERRM = 'expected_session_not_owned' THEN RAISE; END IF;
	END;
	PERFORM pg_temp.assert_true(
		NOT EXISTS (SELECT 1 FROM public.chat_turn_runs WHERE id = 'f4000000-0000-4000-8000-000000000040'),
		'session mismatch created a turn'
	);
END;
$$;

-- NULL client-turn ids remain an explicitly non-keyed compatibility path.
DO $$
DECLARE first_result jsonb; second_result jsonb;
BEGIN
	first_result := pg_temp.admit_legacy(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000005',
		'f4000000-0000-4000-8000-000000000050',
		'f5000000-0000-4000-8000-000000000050',
		'null-client-stream-1', NULL, repeat('1', 64)
	);
	UPDATE public.chat_turn_runs
	SET status = 'completed', finished_at = clock_timestamp()
	WHERE id = 'f4000000-0000-4000-8000-000000000050';
	second_result := pg_temp.admit_legacy(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000005',
		'f4000000-0000-4000-8000-000000000051',
		'f5000000-0000-4000-8000-000000000051',
		'null-client-stream-2', NULL, repeat('1', 64)
	);
	PERFORM pg_temp.assert_true(
		first_result->>'outcome' = 'newly_admitted'
		AND second_result->>'outcome' = 'newly_admitted',
		'null client-turn compatibility path claimed keyed idempotency'
	);
END;
$$;

-- Privileges and index/preflight receipts.
DO $$
DECLARE fn regprocedure := to_regprocedure(
	'public.admit_legacy_agentic_chat_turn(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,boolean,text,timestamp with time zone,text,jsonb,integer,integer,integer,integer)'
);
BEGIN
	PERFORM pg_temp.assert_true(fn IS NOT NULL, 'admission function signature missing');
	PERFORM pg_temp.assert_true(NOT has_function_privilege('anon', fn, 'EXECUTE'), 'anon can execute admission');
	PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated', fn, 'EXECUTE'), 'authenticated can execute admission');
	PERFORM pg_temp.assert_true(has_function_privilege('service_role', fn, 'EXECUTE'), 'service role cannot execute admission');
	PERFORM pg_temp.assert_true(
		to_regclass('public.uq_chat_turn_runs_user_client_turn') IS NOT NULL
		AND to_regclass('public.uq_chat_turn_runs_session_client_turn') IS NOT NULL,
		'admission duplicate indexes missing'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.chat_turn_runs WHERE client_turn_id IS NOT NULL
			GROUP BY user_id, client_turn_id HAVING count(*) > 1
		),
		'user/client duplicate probe is not clean'
	);
	PERFORM pg_temp.assert_true(
		NOT EXISTS (
			SELECT 1 FROM public.chat_turn_runs WHERE client_turn_id IS NOT NULL
			GROUP BY session_id, client_turn_id HAVING count(*) > 1
		),
		'session/client duplicate probe is not clean'
	);
END;
$$;

-- PSQL autocommit makes the fixtures visible before the two independent
-- connections open below.
CREATE OR REPLACE FUNCTION public.test_pause_matching_legacy_admission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.client_turn_id = 'f6000000-0000-4000-8000-000000000060' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_pause_matching_legacy_admission
BEFORE INSERT ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.test_pause_matching_legacy_admission();

SELECT dblink_connect(
	'legacy_admission_a',
	format(
		'dbname=%L host=%L port=%L',
		current_database(),
		current_setting('unix_socket_directories'),
		current_setting('port')
	)
);
SELECT dblink_connect(
	'legacy_admission_b',
	format(
		'dbname=%L host=%L port=%L',
		current_database(),
		current_setting('unix_socket_directories'),
		current_setting('port')
	)
);

SELECT dblink_send_query(
	'legacy_admission_a',
	$query_a$SELECT public.admit_legacy_agentic_chat_turn(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000004',
		'f4000000-0000-4000-8000-000000000060',
		'f5000000-0000-4000-8000-000000000060',
		'concurrent-stream',
		'f6000000-0000-4000-8000-000000000060',
		'6666666666666666666666666666666666666666666666666666666666666666',
		'agentic_chat_request_hash_v2', 'global', NULL, NULL, 'live_ui', true,
		'Concurrent request', clock_timestamp(), 'Concurrent request', '{}'::jsonb,
		10, 285000, 120000, 60000
	)$query_a$
);
SELECT dblink_send_query(
	'legacy_admission_b',
	$query_b$SELECT public.admit_legacy_agentic_chat_turn(
		'f1000000-0000-4000-8000-000000000001',
		'f2000000-0000-4000-8000-000000000004',
		'f4000000-0000-4000-8000-000000000061',
		'f5000000-0000-4000-8000-000000000061',
		'concurrent-stream',
		'f6000000-0000-4000-8000-000000000060',
		'6666666666666666666666666666666666666666666666666666666666666666',
		'agentic_chat_request_hash_v2', 'global', NULL, NULL, 'live_ui', true,
		'Concurrent request', clock_timestamp(), 'Concurrent request', '{}'::jsonb,
		10, 285000, 120000, 60000
	)$query_b$
);

CREATE TEMP TABLE concurrent_admission_results (result jsonb);
INSERT INTO concurrent_admission_results
SELECT result FROM dblink_get_result('legacy_admission_a', false) AS response(result jsonb);
INSERT INTO concurrent_admission_results
SELECT result FROM dblink_get_result('legacy_admission_b', false) AS response(result jsonb);

DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM concurrent_admission_results WHERE result->>'outcome' = 'newly_admitted') = 1,
		'concurrent matching admission did not have exactly one winner'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM concurrent_admission_results WHERE result->>'outcome' = 'matching_duplicate') = 1,
		'concurrent matching admission did not resolve one duplicate'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM public.chat_turn_runs
		 WHERE user_id = 'f1000000-0000-4000-8000-000000000001'
		 AND client_turn_id = 'f6000000-0000-4000-8000-000000000060') = 1,
		'concurrent admission created multiple turns'
	);
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM public.chat_messages
		 WHERE session_id = 'f2000000-0000-4000-8000-000000000004'
		 AND metadata->>'idempotency_key' LIKE 'chat-turn:%:user') = 1,
		'concurrent admission created multiple messages'
	);
END;
$$;

SELECT dblink_disconnect('legacy_admission_a');
SELECT dblink_disconnect('legacy_admission_b');

DROP TRIGGER test_pause_matching_legacy_admission ON public.chat_turn_runs;
DROP FUNCTION public.test_pause_matching_legacy_admission();

-- Disposable cleanup keeps iterative local runs repeatable.
DELETE FROM public.chat_turn_runs WHERE user_id IN (
	'f1000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000002'
);
DELETE FROM public.chat_messages WHERE user_id IN (
	'f1000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000002'
);
DELETE FROM public.chat_sessions WHERE user_id IN (
	'f1000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000002'
);
DELETE FROM public.users WHERE id IN (
	'f1000000-0000-4000-8000-000000000001',
	'f1000000-0000-4000-8000-000000000002'
);
