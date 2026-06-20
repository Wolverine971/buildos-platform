-- supabase/migrations/20260620090000_agent_operatives.sql
--
-- Phase 6 V1: saved Operatives plus simple daily/weekly schedules.
-- `agent_runs.operative_id` was reserved in Phase 0; this migration gives it a
-- durable definition table and enough scheduling state for the worker to enqueue
-- recurring Agent Runs through the existing `agent_run` queue path.

CREATE TABLE IF NOT EXISTS public.agent_operatives (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

	label TEXT NOT NULL,
	goal TEXT NOT NULL,
	instructions TEXT NULL,
	expected_output TEXT NULL,
	context_type TEXT NOT NULL DEFAULT 'global',
	project_id UUID NULL REFERENCES public.onto_projects(id) ON DELETE SET NULL,
	scope_mode TEXT NOT NULL DEFAULT 'read_only',
	allowed_ops TEXT[] NULL,
	review_required BOOLEAN NOT NULL DEFAULT FALSE,
	budgets JSONB NOT NULL DEFAULT '{}'::jsonb,

	schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
	schedule_frequency TEXT NULL,
	schedule_time_of_day TIME NULL,
	schedule_day_of_week INTEGER NULL,
	schedule_timezone TEXT NOT NULL DEFAULT 'UTC',
	next_run_at TIMESTAMPTZ NULL,
	last_run_at TIMESTAMPTZ NULL,
	last_run_id UUID NULL REFERENCES public.agent_runs(id) ON DELETE SET NULL,
	schedule_locked_at TIMESTAMPTZ NULL,
	schedule_error TEXT NULL,

	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	CONSTRAINT agent_operatives_context_type CHECK (context_type IN ('project', 'global')),
	CONSTRAINT agent_operatives_project_context CHECK (
		(context_type = 'global' AND project_id IS NULL)
		OR (context_type = 'project' AND project_id IS NOT NULL)
	),
	CONSTRAINT agent_operatives_scope_mode CHECK (scope_mode IN ('read_only', 'read_write')),
	CONSTRAINT agent_operatives_review_requires_write CHECK (
		review_required = FALSE OR scope_mode = 'read_write'
	),
	CONSTRAINT agent_operatives_schedule_frequency CHECK (
		schedule_frequency IS NULL OR schedule_frequency IN ('daily', 'weekly')
	),
	CONSTRAINT agent_operatives_schedule_day_of_week CHECK (
		schedule_day_of_week IS NULL OR schedule_day_of_week BETWEEN 0 AND 6
	),
	CONSTRAINT agent_operatives_enabled_schedule_shape CHECK (
		schedule_enabled = FALSE
		OR (
			schedule_frequency IS NOT NULL
			AND schedule_time_of_day IS NOT NULL
			AND (
				schedule_frequency = 'daily'
				OR schedule_day_of_week IS NOT NULL
			)
		)
	)
);

CREATE INDEX IF NOT EXISTS idx_agent_operatives_user_updated
	ON public.agent_operatives(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_operatives_due
	ON public.agent_operatives(next_run_at)
	WHERE schedule_enabled = TRUE
		AND next_run_at IS NOT NULL
		AND schedule_locked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_operatives_project
	ON public.agent_operatives(project_id)
	WHERE project_id IS NOT NULL;

ALTER TABLE public.agent_runs
	DROP CONSTRAINT IF EXISTS agent_runs_operative_id_fkey;

ALTER TABLE public.agent_runs
	ADD CONSTRAINT agent_runs_operative_id_fkey
	FOREIGN KEY (operative_id)
	REFERENCES public.agent_operatives(id)
	ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_agent_operatives_updated ON public.agent_operatives;
CREATE TRIGGER trg_agent_operatives_updated
	BEFORE UPDATE ON public.agent_operatives
	FOR EACH ROW
	EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_operatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_operatives_user_select
	ON public.agent_operatives FOR SELECT
	USING (auth.uid() = user_id);

CREATE POLICY agent_operatives_user_insert
	ON public.agent_operatives FOR INSERT
	WITH CHECK (auth.uid() = user_id);

CREATE POLICY agent_operatives_user_update
	ON public.agent_operatives FOR UPDATE
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

CREATE POLICY agent_operatives_user_delete
	ON public.agent_operatives FOR DELETE
	USING (auth.uid() = user_id);

CREATE POLICY agent_operatives_service_role
	ON public.agent_operatives FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_operatives TO authenticated;
	END IF;
END $$;
