-- supabase/tests/fixtures/agentic_chat_read_planning_observability_base.sql
-- Minimal production-ledger overlay for the disposable read-planning admin view contract.

CREATE TABLE IF NOT EXISTS public.llm_usage_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	model_requested text NOT NULL,
	model_used text NOT NULL,
	provider text,
	prompt_tokens integer NOT NULL,
	completion_tokens integer NOT NULL,
	total_tokens integer NOT NULL,
	total_cost_usd numeric NOT NULL,
	response_time_ms integer NOT NULL
);

GRANT SELECT, INSERT ON TABLE public.llm_usage_logs TO service_role;
