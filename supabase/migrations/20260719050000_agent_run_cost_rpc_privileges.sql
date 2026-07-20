-- supabase/migrations/20260719050000_agent_run_cost_rpc_privileges.sql
-- Explicitly fence cost-ledger RPCs to the worker's service role.
--
-- Supabase projects can have function privileges granted directly to anon and
-- authenticated roles. Revoking PUBLIC alone is therefore not a sufficient
-- worker-only boundary.

REVOKE ALL ON TABLE public.agent_run_cost_entries
	FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.agent_run_cost_guard_direct_write()
	FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reserve_agent_run_cost(
	UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.settle_agent_run_cost(
	UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB, BOOLEAN
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_agent_run_cost_reconciliation(
	TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.release_agent_run_cost_reconciliation(
	UUID, UUID, TEXT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reconcile_agent_run_cost(
	UUID, UUID, NUMERIC, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.agent_run_cost_entries TO service_role;

GRANT EXECUTE ON FUNCTION public.reserve_agent_run_cost(
	UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB
) TO service_role;

GRANT EXECUTE ON FUNCTION public.settle_agent_run_cost(
	UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB, BOOLEAN
) TO service_role;

GRANT EXECUTE ON FUNCTION public.claim_agent_run_cost_reconciliation(
	TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) TO service_role;

GRANT EXECUTE ON FUNCTION public.release_agent_run_cost_reconciliation(
	UUID, UUID, TEXT, BOOLEAN, TIMESTAMPTZ
) TO service_role;

GRANT EXECUTE ON FUNCTION public.reconcile_agent_run_cost(
	UUID, UUID, NUMERIC, NUMERIC, TEXT, JSONB
) TO service_role;
