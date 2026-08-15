-- supabase/migrations/20260814013000_agentic_chat_contract_internal_helpers.sql
-- Move non-RPC turn-contract implementation helpers out of the public schema.
-- The terminal trigger remains public (as required by its existing trigger
-- binding), but its helper implementation is not a client capability.

BEGIN;

CREATE SCHEMA IF NOT EXISTS agentic_chat_internal AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA agentic_chat_internal
	FROM PUBLIC, anon, authenticated, service_role;

DO $migration$
DECLARE
	v_trigger_definition text;
BEGIN
	SELECT pg_get_functiondef(
		'public.apply_agentic_chat_terminal_pending_contract_v1()'::regprocedure
	)
	INTO STRICT v_trigger_definition;

	ALTER FUNCTION public.agentic_chat_normalize_contract_outcome_v1(jsonb, text)
		SET SCHEMA agentic_chat_internal;
	ALTER FUNCTION public.agentic_chat_contract_argument_fields_v1(jsonb)
		SET SCHEMA agentic_chat_internal;
	ALTER FUNCTION public.agentic_chat_contract_effect_matches_v1(text, text, text, jsonb, jsonb)
		SET SCHEMA agentic_chat_internal;

	v_trigger_definition := replace(
		v_trigger_definition,
		'public.agentic_chat_normalize_contract_outcome_v1',
		'agentic_chat_internal.agentic_chat_normalize_contract_outcome_v1'
	);
	v_trigger_definition := replace(
		v_trigger_definition,
		'public.agentic_chat_contract_argument_fields_v1',
		'agentic_chat_internal.agentic_chat_contract_argument_fields_v1'
	);
	v_trigger_definition := replace(
		v_trigger_definition,
		'public.agentic_chat_contract_effect_matches_v1',
		'agentic_chat_internal.agentic_chat_contract_effect_matches_v1'
	);
	EXECUTE v_trigger_definition;

	IF to_regprocedure('public.agentic_chat_normalize_contract_outcome_v1(jsonb,text)') IS NOT NULL
		OR to_regprocedure('public.agentic_chat_contract_argument_fields_v1(jsonb)') IS NOT NULL
		OR to_regprocedure('public.agentic_chat_contract_effect_matches_v1(text,text,text,jsonb,jsonb)') IS NOT NULL
		OR to_regprocedure('agentic_chat_internal.agentic_chat_normalize_contract_outcome_v1(jsonb,text)') IS NULL
		OR to_regprocedure('agentic_chat_internal.agentic_chat_contract_argument_fields_v1(jsonb)') IS NULL
		OR to_regprocedure('agentic_chat_internal.agentic_chat_contract_effect_matches_v1(text,text,text,jsonb,jsonb)') IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_contract_internal_helper_move_failed';
	END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION agentic_chat_internal.agentic_chat_normalize_contract_outcome_v1(jsonb, text)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION agentic_chat_internal.agentic_chat_contract_argument_fields_v1(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION agentic_chat_internal.agentic_chat_contract_effect_matches_v1(text, text, text, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
