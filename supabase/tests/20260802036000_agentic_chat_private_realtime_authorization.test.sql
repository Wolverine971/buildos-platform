-- Disposable PostgreSQL verification for Agentic Chat Phase 2C Slice 4.
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

SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'realtime'
			AND tablename = 'messages'
			AND policyname = 'agentic_chat_realtime_messages_select'
			AND cmd = 'SELECT'
			AND roles = ARRAY['authenticated']::name[]
			AND qual LIKE '%realtime.topic()%'
			AND qual LIKE '%extension%broadcast%'
	),
	'private Realtime policy was missing the channel-topic or Broadcast restriction'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'realtime'
			AND tablename = 'messages'
			AND policyname = 'agentic_chat_realtime_messages_select'
			AND cmd IN ('INSERT', 'ALL')
	),
	'private Realtime package granted a browser publish policy'
);

INSERT INTO realtime.messages (topic, extension, payload) VALUES
	('authorization-probe', 'broadcast', '{"label":"broadcast"}'),
	('authorization-probe', 'presence', '{"label":"presence"}');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';
SET realtime.topic = 'chat-user:f1000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT array_agg(payload->>'label' ORDER BY payload->>'label') FROM realtime.messages)
		= ARRAY['broadcast'],
	'user A could not authorize Broadcast receive access on its exact private topic'
);
SET realtime.topic = 'chat-user:f1000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM realtime.messages) = 0,
	'user A could authorize another user topic'
);
SET realtime.topic = 'chat-user:f1000000-0000-4000-8000-000000000001:extra';
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM realtime.messages) = 0,
	'user A could authorize a suffixed topic'
);
SET realtime.topic = 'chat-user:not-a-uuid';
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM realtime.messages) = 0,
	'malformed topic did not fail closed'
);
SET realtime.topic = 'chat-session:f1000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM realtime.messages) = 0,
	'alternate chat topic prefix was authorized'
);
SET realtime.topic = 'agent-run:f1000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM realtime.messages) = 0,
	'another Realtime topic family was authorized'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$INSERT INTO realtime.messages (topic, extension, payload)
		VALUES ('authorization-probe', 'broadcast', '{"forged":true}')$$,
		'new row violates row-level security policy'
	),
	'authenticated user gained Realtime publish authority'
);
RESET request.jwt.claim.sub;
RESET realtime.topic;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000002';
SET realtime.topic = 'chat-user:f1000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(
	(SELECT array_agg(payload->>'label' ORDER BY payload->>'label') FROM realtime.messages)
		= ARRAY['broadcast'],
	'user B could not authorize Broadcast receive access on its exact private topic'
);
RESET request.jwt.claim.sub;
RESET realtime.topic;
RESET ROLE;

SET ROLE anon;
SET realtime.topic = 'chat-user:f1000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM realtime.messages) = 0,
	'anonymous role could receive private Agentic Chat messages'
);
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$$INSERT INTO realtime.messages (topic, extension, payload)
		VALUES ('authorization-probe', 'broadcast', '{"forged":true}')$$,
		'new row violates row-level security policy'
	),
	'anonymous role gained Realtime publish authority'
);
RESET realtime.topic;
RESET ROLE;

SET ROLE service_role;
INSERT INTO realtime.messages (topic, extension, payload)
VALUES ('chat-user:f1000000-0000-4000-8000-000000000001', 'broadcast', '{"label":"service-publish"}');
RESET ROLE;
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM realtime.messages
		WHERE payload->>'label' = 'service-publish'
	),
	'service role could not publish through its existing RLS bypass'
);

-- Package-only rollback proof.
BEGIN;
DROP POLICY agentic_chat_realtime_messages_select ON realtime.messages;
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'realtime'
			AND tablename = 'messages'
			AND policyname = 'agentic_chat_realtime_messages_select'
	),
	'private Realtime policy remained during rollback proof'
);
ROLLBACK;
SELECT pg_temp.assert_true(
	EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'realtime'
			AND tablename = 'messages'
			AND policyname = 'agentic_chat_realtime_messages_select'
	),
	'rollback did not restore the private Realtime policy'
);

SELECT 'phase2c_private_realtime_authorization_ok' AS proof;
