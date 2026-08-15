-- supabase/migrations/20260814012000_agentic_chat_contract_rpc_surface_reload.sql
-- Keep turn-contract implementation helpers out of the generated RPC surface.
-- PostgreSQL privileges were revoked in the hardening migration; explicitly
-- reload PostgREST after repeating those revokes so its schema cache observes
-- the final privilege state rather than the functions' create-time defaults.

BEGIN;

REVOKE ALL ON FUNCTION public.agentic_chat_normalize_contract_outcome_v1(jsonb, text)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_argument_fields_v1(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_effect_matches_v1(text, text, text, jsonb, jsonb)
	FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
