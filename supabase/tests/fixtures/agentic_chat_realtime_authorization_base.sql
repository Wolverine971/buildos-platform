-- Minimal Supabase Realtime authorization fixture for Agentic Chat Phase 2C.

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		CREATE ROLE anon NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		CREATE ROLE authenticated NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
		CREATE ROLE service_role NOLOGIN BYPASSRLS;
	ELSE
		ALTER ROLE service_role BYPASSRLS;
	END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS realtime;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
	SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Supabase Realtime exposes the channel being authorized through this helper,
-- not through a stored message row. The disposable fixture models that join
-- context with a transaction-local custom setting.
CREATE OR REPLACE FUNCTION realtime.topic()
RETURNS text
LANGUAGE sql
STABLE
AS $$
	SELECT NULLIF(current_setting('realtime.topic', true), '');
$$;

CREATE TABLE realtime.messages (
	topic text NOT NULL,
	extension text NOT NULL,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA auth, realtime TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE realtime.messages TO anon, authenticated, service_role;

-- Deliberately unsafe prior definition. The migration must replace this exact
-- policy name rather than accepting unknown existing policy text.
CREATE POLICY agentic_chat_realtime_messages_select
	ON realtime.messages
	FOR SELECT
	TO authenticated
	USING (true);
