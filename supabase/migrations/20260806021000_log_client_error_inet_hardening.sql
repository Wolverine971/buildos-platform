-- supabase/migrations/20260806021000_log_client_error_inet_hardening.sql
-- log_client_error is anon-callable and previously hard-cast the caller's
-- ip_address to inet, so one malformed value (observed 2026-08-06: the text
-- sanitizer's "[redacted-phone]" replacement of an IPv4 digit run) rejected
-- the entire error log with SQLSTATE 22P02. Client errors raised during
-- incidents were silently dropped. A malformed address now degrades to NULL
-- while the rest of the log persists.

BEGIN;

-- PostgreSQL 15 has no pg_input_is_valid(); an exception-scoped helper is the
-- supported safe-cast shape.
CREATE OR REPLACE FUNCTION public.safe_inet(p_value text)
RETURNS inet
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $helper$
BEGIN
	RETURN nullif(p_value, '')::inet;
EXCEPTION
	WHEN OTHERS THEN
		RETURN NULL;
END;
$helper$;

COMMENT ON FUNCTION public.safe_inet(text) IS
	'Cast text to inet, returning NULL for malformed input instead of raising. Used by anon-facing logging paths where a bad address must not reject the row.';

REVOKE ALL ON FUNCTION public.safe_inet(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safe_inet(text) TO anon, authenticated, service_role;

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid = 'public.log_client_error(jsonb)'::regprocedure;

	v_next := replace(
		v_body,
		$old$		nullif(p_entry ->> 'ip_address', '')::inet,$old$,
		$new$		public.safe_inet(p_entry ->> 'ip_address'),$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'log_client_error_inet_hardening_unexpected_body';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.log_client_error(p_entry jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

COMMIT;
