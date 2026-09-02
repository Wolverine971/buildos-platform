-- Operator prerequisite for the tracked Libri frontend read-boundary migration.
-- This script deliberately provisions no password. Set or rotate the password
-- through the Vercel secret workflow only after the RLS migration is verified.

DO $role$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'libri_frontend_reader'
	) THEN
		CREATE ROLE libri_frontend_reader
			LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
			CONNECTION LIMIT 3;
	ELSIF EXISTS (
		SELECT 1
		FROM pg_catalog.pg_roles
		WHERE rolname = 'libri_frontend_reader'
			AND (
				NOT rolcanlogin
				OR rolsuper
				OR rolcreatedb
				OR rolcreaterole
				OR rolinherit
				OR rolreplication
				OR rolbypassrls
				OR rolconnlimit <> 3
			)
	) OR EXISTS (
		SELECT 1
		FROM pg_catalog.pg_auth_members membership
		JOIN pg_catalog.pg_roles member_role ON member_role.oid = membership.member
		WHERE member_role.rolname = 'libri_frontend_reader'
	) THEN
		RAISE EXCEPTION 'existing libri_frontend_reader role is not the approved isolated login';
	END IF;
END;
$role$;

ALTER ROLE libri_frontend_reader SET default_transaction_read_only = on;
ALTER ROLE libri_frontend_reader SET lock_timeout = '2s';
ALTER ROLE libri_frontend_reader SET statement_timeout = '10s';
ALTER ROLE libri_frontend_reader SET idle_in_transaction_session_timeout = '10s';
