-- supabase/tests/20260806000000_add_emails_sending_status.test.sql
-- Disposable PostgreSQL verification for the notification email claim state.
-- Prerequisite: apply 20260806000000_add_emails_sending_status.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY.

\set ON_ERROR_STOP on

DO $$
DECLARE
	v_definition text;
BEGIN
	SELECT pg_get_constraintdef(constraints.oid)
	INTO v_definition
	FROM pg_constraint constraints
	WHERE constraints.conrelid = 'public.emails'::regclass
		AND constraints.conname = 'emails_status_check';

	IF v_definition IS NULL
		OR v_definition NOT LIKE '%''draft''%'
		OR v_definition NOT LIKE '%''scheduled''%'
		OR v_definition NOT LIKE '%''sending''%'
		OR v_definition NOT LIKE '%''sent''%'
		OR v_definition NOT LIKE '%''failed''%'
	THEN
		RAISE EXCEPTION 'emails_status_check does not contain the complete email lifecycle: %',
			v_definition;
	END IF;
END;
$$;

SELECT 'emails_sending_status_ok' AS result;
