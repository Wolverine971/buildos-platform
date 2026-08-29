-- TEST FIXTURE ONLY: bootstrap a disposable PostgreSQL database for the Libri
-- foundation contract. Never apply this fixture to local, staging, or hosted
-- Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;

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
	END IF;
END;
$$;

CREATE TABLE auth.users (
	id uuid PRIMARY KEY
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
	SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

\ir ../../migrations/20260829183727_libri_foundation.sql
