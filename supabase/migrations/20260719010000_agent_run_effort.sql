-- supabase/migrations/20260719010000_agent_run_effort.sql
-- Agent Runs: explicit model-effort routing for durable delegated work.
--
-- `effort` is intentionally separate from future run templates such as
-- `deep_research`: effort controls model/reasoning quality, while a template
-- controls orchestration shape (single agent vs bounded map/reduce).

ALTER TABLE public.agent_runs
	ADD COLUMN IF NOT EXISTS effort TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE public.agent_runs
	DROP CONSTRAINT IF EXISTS agent_runs_effort_check;

ALTER TABLE public.agent_runs
	ADD CONSTRAINT agent_runs_effort_check
	CHECK (effort IN ('standard', 'deep'));

COMMENT ON COLUMN public.agent_runs.effort IS
	'Model/reasoning routing hint. standard preserves the normal lane; deep uses the higher-reasoning lane.';
