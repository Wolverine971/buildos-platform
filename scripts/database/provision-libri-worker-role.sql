-- Operator prerequisite for the tracked Libri worker access-boundary migration.
-- This script deliberately provisions no password. Set or rotate the password
-- through the deployment secret workflow after the RLS migration is verified.

DO $role$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'libri_worker') THEN
		CREATE ROLE libri_worker
			LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
			CONNECTION LIMIT 3;
	ELSIF EXISTS (
		SELECT 1
		FROM pg_catalog.pg_roles
		WHERE rolname = 'libri_worker'
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
		WHERE member_role.rolname = 'libri_worker'
	) THEN
		RAISE EXCEPTION 'existing libri_worker role is not the approved isolated login';
	END IF;
END;
$role$;

ALTER ROLE libri_worker SET lock_timeout = '5s';
ALTER ROLE libri_worker SET statement_timeout = '30s';
ALTER ROLE libri_worker SET idle_in_transaction_session_timeout = '30s';
