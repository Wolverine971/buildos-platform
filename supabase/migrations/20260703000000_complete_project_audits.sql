-- supabase/migrations/20260703000000_complete_project_audits.sql
-- Complete Project Audit Tracker: durable report packets, persisted trigger
-- decisions, and links from audit reports to concrete child suggestions.

ALTER TABLE IF EXISTS project_loop_runs
  DROP CONSTRAINT IF EXISTS project_loop_runs_trigger_reason_check;

ALTER TABLE IF EXISTS project_loop_runs
  ADD CONSTRAINT project_loop_runs_trigger_reason_check
  CHECK (trigger_reason IN ('end_of_day', 'scheduled', 'burst', 'critical_change', 'manual'));

-- =====================================================
-- project_audits
-- =====================================================
CREATE TABLE IF NOT EXISTS public.project_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  loop_run_id uuid REFERENCES public.project_loop_runs(id) ON DELETE SET NULL,
  chat_session_id uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'ready', 'reviewed', 'superseded', 'archived', 'failed')),
  trigger_reason text NOT NULL
    CHECK (trigger_reason IN ('scheduled', 'burst', 'critical_change', 'manual')),
  audit_depth text NOT NULL DEFAULT 'standard'
    CHECK (audit_depth IN ('standard', 'deep')),

  delivery_confidence text NOT NULL DEFAULT 'unknown'
    CHECK (delivery_confidence IN ('green', 'yellow', 'red', 'unknown')),
  project_size_class text NOT NULL DEFAULT 'small_eligible'
    CHECK (project_size_class IN ('small_eligible', 'medium', 'large', 'strategic')),
  project_thesis text,
  summary text NOT NULL DEFAULT '',
  top_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_actions jsonb NOT NULL DEFAULT '[]'::jsonb,

  change_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  dimensions jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,

  generated_suggestion_count int NOT NULL DEFAULT 0,
  unresolved_suggestion_count int NOT NULL DEFAULT 0,

  trigger_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_snapshot_fingerprint text,
  model_used text,
  cost_usd numeric,
  error_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  reviewed_at timestamptz,
  archived_at timestamptz,
  superseded_by uuid REFERENCES public.project_audits(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_audits_project_created
  ON public.project_audits(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_audits_project_status
  ON public.project_audits(project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_audits_loop_run
  ON public.project_audits(loop_run_id)
  WHERE loop_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_audits_chat_session
  ON public.project_audits(chat_session_id)
  WHERE chat_session_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_project_audits_updated_at ON public.project_audits;
CREATE TRIGGER trg_project_audits_updated_at
  BEFORE UPDATE ON public.project_audits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- project_audit_trigger_evaluations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.project_audit_trigger_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  evaluated_at timestamptz NOT NULL DEFAULT now(),
  decision text NOT NULL
    CHECK (
      decision IN (
        'queued',
        'deferred_quiet_period',
        'skipped_ineligible',
        'skipped_no_activity',
        'skipped_cooldown',
        'skipped_active_run',
        'skipped_duplicate',
        'manual_required'
      )
    ),
  trigger_reason text NOT NULL
    CHECK (trigger_reason IN ('scheduled', 'burst', 'critical_change', 'manual')),
  eligible boolean NOT NULL DEFAULT false,
  project_size_class text NOT NULL DEFAULT 'below_baseline'
    CHECK (project_size_class IN ('below_baseline', 'small_eligible', 'medium', 'large', 'strategic')),

  maturity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  burst_score int,
  changed_entity_count int,
  major_change_count int,
  last_audit_id uuid REFERENCES public.project_audits(id) ON DELETE SET NULL,
  quiet_until timestamptz,
  cooldown_until timestamptz,

  reason_summary text NOT NULL DEFAULT '',
  created_audit_id uuid REFERENCES public.project_audits(id) ON DELETE SET NULL,
  created_loop_run_id uuid REFERENCES public.project_loop_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_audit_trigger_evals_project_created
  ON public.project_audit_trigger_evaluations(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_audit_trigger_evals_decision
  ON public.project_audit_trigger_evaluations(decision, created_at DESC);

-- =====================================================
-- project_audit_suggestions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.project_audit_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.project_audits(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES public.project_suggestions(id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN ('recommended_action', 'risk_follow_up', 'cleanup', 'decision_point')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_audit_suggestions_unique UNIQUE (audit_id, suggestion_id)
);

CREATE INDEX IF NOT EXISTS idx_project_audit_suggestions_audit
  ON public.project_audit_suggestions(audit_id);

CREATE INDEX IF NOT EXISTS idx_project_audit_suggestions_suggestion
  ON public.project_audit_suggestions(suggestion_id);

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.project_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_audit_trigger_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_audit_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_audits_read ON public.project_audits;
CREATE POLICY project_audits_read
  ON public.project_audits FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS project_audits_update ON public.project_audits;
CREATE POLICY project_audits_update
  ON public.project_audits FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'))
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS project_audits_service_role_all ON public.project_audits;
CREATE POLICY project_audits_service_role_all
  ON public.project_audits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS project_audit_trigger_evaluations_read ON public.project_audit_trigger_evaluations;
CREATE POLICY project_audit_trigger_evaluations_read
  ON public.project_audit_trigger_evaluations FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS project_audit_trigger_evaluations_service_role_all ON public.project_audit_trigger_evaluations;
CREATE POLICY project_audit_trigger_evaluations_service_role_all
  ON public.project_audit_trigger_evaluations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS project_audit_suggestions_read ON public.project_audit_suggestions;
CREATE POLICY project_audit_suggestions_read
  ON public.project_audit_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_audits a
      WHERE a.id = project_audit_suggestions.audit_id
        AND current_actor_has_project_access(a.project_id, 'read')
    )
  );

DROP POLICY IF EXISTS project_audit_suggestions_service_role_all ON public.project_audit_suggestions;
CREATE POLICY project_audit_suggestions_service_role_all
  ON public.project_audit_suggestions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
