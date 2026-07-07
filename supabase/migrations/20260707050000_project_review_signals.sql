-- supabase/migrations/20260707050000_project_review_signals.sql
-- Debounced project-review signals. Bulk UI/API operations write one coalescing
-- signal per project; a lightweight queue wakeup later converts the settled
-- signal into the existing project-loop/audit enqueue path.

CREATE TABLE IF NOT EXISTS public.project_review_signals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'processing', 'completed', 'superseded', 'failed')),
	review_policy text NOT NULL DEFAULT 'debounced'
		CHECK (review_policy IN ('debounced', 'immediate', 'suppress')),

	origin text,
	operation_kind text,
	source text NOT NULL DEFAULT 'unknown',
	entity_type text,
	entity_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
	operation_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
	entity_count int NOT NULL DEFAULT 0,
	signal_count int NOT NULL DEFAULT 1,
	activity_score int NOT NULL DEFAULT 0,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

	due_at timestamptz NOT NULL,
	last_seen_at timestamptz NOT NULL DEFAULT now(),
	created_at timestamptz NOT NULL DEFAULT now(),
	started_at timestamptz,
	finished_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),

	queue_job_id text,
	processed_loop_run_id uuid REFERENCES public.project_loop_runs(id) ON DELETE SET NULL,
	processed_audit_id uuid REFERENCES public.project_audits(id) ON DELETE SET NULL,
	error_message text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_review_signals_pending_project
	ON public.project_review_signals(project_id)
	WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_project_review_signals_due
	ON public.project_review_signals(status, due_at)
	WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_project_review_signals_project_created
	ON public.project_review_signals(project_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_project_review_signals_updated_at ON public.project_review_signals;
CREATE TRIGGER trg_project_review_signals_updated_at
	BEFORE UPDATE ON public.project_review_signals
	FOR EACH ROW
	EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.project_review_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_review_signals_project_member_read ON public.project_review_signals;
CREATE POLICY project_review_signals_project_member_read
	ON public.project_review_signals FOR SELECT
	USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS project_review_signals_service_role_all ON public.project_review_signals;
CREATE POLICY project_review_signals_service_role_all
	ON public.project_review_signals FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');
