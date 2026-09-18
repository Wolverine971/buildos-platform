-- supabase/migrations/20260918200000_freshness_radar_ledger.sql
-- Jev freshness radar (Tasker 88), part 1 of 4: signals, scans and the
-- calibration ledger. Frozen plan: docs/architecture/jev-freshness-radar-v1-plan.md §2.
--
-- - freshness_radar_signals: one pending debounced signal per chat session.
--   Service role only.
-- - freshness_scans: one row per (signal, project) scan, including skipped scans.
-- - freshness_flags: the calibration ledger, one row per evaluated subject per scan.
-- - freshness_track_scores: one on-track gauge row per goal or milestone scored.
--
-- Evidence quotes the dumping user's own chat words, so the readable tables are
-- visible only to that user (and only while they can still read the project).
-- There are no authenticated write policies: the worker and the web routes write
-- through the admin client after an access check (project_review_signals pattern).
--
-- Rollback (before any radar job has run): drop the four tables in reverse order.
-- 20260918200200 must be rolled back first because it references these tables.

CREATE TABLE IF NOT EXISTS public.freshness_radar_signals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'processing', 'completed', 'superseded', 'failed')),
	project_id_hints uuid[] NOT NULL DEFAULT '{}',
	last_turn_run_id uuid REFERENCES public.chat_turn_runs(id) ON DELETE SET NULL,
	turn_count int NOT NULL DEFAULT 1,
	first_turn_at timestamptz NOT NULL DEFAULT now(),
	last_turn_at timestamptz NOT NULL DEFAULT now(),
	due_at timestamptz NOT NULL,
	max_due_at timestamptz NOT NULL,
	queue_job_id text,
	started_at timestamptz,
	finished_at timestamptz,
	error_message text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT freshness_radar_signals_due_within_max CHECK (due_at <= max_due_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS freshness_radar_signals_pending_session
	ON public.freshness_radar_signals(session_id)
	WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS freshness_radar_signals_pending_due
	ON public.freshness_radar_signals(due_at)
	WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS freshness_radar_signals_user_created
	ON public.freshness_radar_signals(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.freshness_scans (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	signal_id uuid REFERENCES public.freshness_radar_signals(id) ON DELETE SET NULL,
	trigger text NOT NULL CHECK (trigger IN ('chat_turn', 'chat_close', 'manual')),
	mode text NOT NULL CHECK (mode IN ('shadow', 'live')),
	status text NOT NULL DEFAULT 'running'
		CHECK (status IN ('running', 'completed', 'skipped', 'failed')),
	skip_reason text,
	trigger_session_id uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
	info_session_ids uuid[] NOT NULL DEFAULT '{}',
	info_message_ids uuid[] NOT NULL DEFAULT '{}',
	info_window_start timestamptz,
	info_cursor_at timestamptz,
	info_chars int NOT NULL DEFAULT 0,
	info_truncated boolean NOT NULL DEFAULT false,
	candidates_total int NOT NULL DEFAULT 0,
	candidates_evaluated int NOT NULL DEFAULT 0,
	question_set_version text NOT NULL,
	question_set_sha256 text NOT NULL,
	policy_version text NOT NULL,
	policy jsonb NOT NULL,
	model_requested text,
	model_used text,
	jev_requests int NOT NULL DEFAULT 0,
	jev_input_tokens int NOT NULL DEFAULT 0,
	jev_cost_usd numeric(12, 8) NOT NULL DEFAULT 0,
	jev_latency_ms int[] NOT NULL DEFAULT '{}',
	-- {surfaced, drafted, auto_applied, retired, marked, gauges}
	counts jsonb NOT NULL DEFAULT '{}',
	card_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
	error_message text,
	created_at timestamptz NOT NULL DEFAULT now(),
	started_at timestamptz,
	finished_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Retry idempotency: one scan per (signal, project).
CREATE UNIQUE INDEX IF NOT EXISTS freshness_scans_signal_project
	ON public.freshness_scans(signal_id, project_id)
	WHERE signal_id IS NOT NULL;

-- Per-project scan lock: at most one running scan per project.
CREATE UNIQUE INDEX IF NOT EXISTS freshness_scans_one_running
	ON public.freshness_scans(project_id)
	WHERE status = 'running';

-- Info-window cursor lookup ("last completed scan for P") and badge reads.
CREATE INDEX IF NOT EXISTS freshness_scans_project_created
	ON public.freshness_scans(project_id, created_at DESC);

-- The calibration ledger: one row per evaluated subject per scan.
CREATE TABLE IF NOT EXISTS public.freshness_flags (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	scan_id uuid NOT NULL REFERENCES public.freshness_scans(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	subject_kind text NOT NULL
		CHECK (subject_kind IN ('task', 'document', 'goal', 'milestone', 'inbox_item')),
	subject_id uuid NOT NULL,
	subject_title text NOT NULL,
	subject_updated_at timestamptz,
	subject_snapshot jsonb NOT NULL,
	question_set_version text NOT NULL,
	model_used text,
	-- P(stale) for entities, P(obsolete) for inbox items.
	probability numeric(5, 4) NOT NULL CHECK (probability BETWEEN 0 AND 1),
	change_kind text,
	change_kind_probability numeric(5, 4),
	date_choice text,
	date_choice_probability numeric(5, 4),
	answers jsonb NOT NULL,
	features jsonb NOT NULL DEFAULT '{}',
	-- Quotes the user's own words (private to the dumping user).
	evidence jsonb,
	disposition text NOT NULL CHECK (disposition IN (
		'evaluated', 'surfaced', 'drafted', 'auto_apply_pending', 'auto_applied',
		'auto_apply_skipped', 'retired', 'marked_possibly_stale', 'suppressed'
	)),
	disposition_reason text,
	status text NOT NULL DEFAULT 'open' CHECK (status IN (
		'open', 'applied', 'dismissed', 'undone', 'resolved_by_change', 'superseded', 'expired'
	)),
	proposed_operation jsonb,
	undo_operation jsonb,
	suggestion_id uuid REFERENCES public.project_suggestions(id) ON DELETE SET NULL,
	applied_via text CHECK (applied_via IN ('auto', 'bundle_approval')),
	applied_at timestamptz,
	applied_after_updated_at timestamptz,
	undone_at timestamptz,
	undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
	outcome text CHECK (outcome IN ('stale', 'not_stale', 'unknown')),
	outcome_source text CHECK (outcome_source IN (
		'user_approved', 'user_dismissed', 'user_marked_not_stale', 'user_undid',
		'auto_applied_kept', 'field_changed_within_horizon', 'unchanged_within_horizon',
		'entity_deleted', 'backtest_label', 'manual_label'
	)),
	outcome_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT freshness_flags_auto_has_undo CHECK (
		disposition <> 'auto_applied'
		OR (
			applied_via = 'auto'
			AND applied_at IS NOT NULL
			AND undo_operation IS NOT NULL
			AND applied_after_updated_at IS NOT NULL
		)
	),
	CONSTRAINT freshness_flags_retired_has_undo CHECK (
		disposition <> 'retired' OR undo_operation IS NOT NULL
	)
);

CREATE INDEX IF NOT EXISTS freshness_flags_subject_history
	ON public.freshness_flags(project_id, subject_kind, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS freshness_flags_scan
	ON public.freshness_flags(scan_id);

CREATE INDEX IF NOT EXISTS freshness_flags_open_visible
	ON public.freshness_flags(project_id)
	WHERE status = 'open'
		AND disposition IN ('surfaced', 'drafted', 'auto_applied', 'marked_possibly_stale');

CREATE INDEX IF NOT EXISTS freshness_flags_unlabelled
	ON public.freshness_flags(project_id, created_at)
	WHERE outcome IS NULL;

CREATE TABLE IF NOT EXISTS public.freshness_track_scores (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	scan_id uuid NOT NULL REFERENCES public.freshness_scans(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	subject_kind text NOT NULL CHECK (subject_kind IN ('goal', 'milestone')),
	subject_id uuid NOT NULL,
	subject_title text NOT NULL,
	gauge text NOT NULL CHECK (gauge IN ('on_track', 'at_risk', 'off_track', 'unknown')),
	previous_gauge text,
	score numeric(4, 3),
	score_confidence numeric(5, 4),
	evidence_probability numeric(5, 4),
	answers jsonb NOT NULL,
	facts jsonb NOT NULL,
	target_at timestamptz,
	question_set_version text NOT NULL,
	model_used text,
	outcome text CHECK (outcome IN ('met', 'missed', 'changed_target', 'unknown')),
	outcome_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS freshness_track_scores_subject_history
	ON public.freshness_track_scores(project_id, subject_kind, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS freshness_track_scores_scan
	ON public.freshness_track_scores(scan_id);

-- updated_at maintenance
DROP TRIGGER IF EXISTS trg_freshness_radar_signals_updated_at ON public.freshness_radar_signals;
CREATE TRIGGER trg_freshness_radar_signals_updated_at
	BEFORE UPDATE ON public.freshness_radar_signals
	FOR EACH ROW
	EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_freshness_scans_updated_at ON public.freshness_scans;
CREATE TRIGGER trg_freshness_scans_updated_at
	BEFORE UPDATE ON public.freshness_scans
	FOR EACH ROW
	EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_freshness_flags_updated_at ON public.freshness_flags;
CREATE TRIGGER trg_freshness_flags_updated_at
	BEFORE UPDATE ON public.freshness_flags
	FOR EACH ROW
	EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.freshness_radar_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freshness_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freshness_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freshness_track_scores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.freshness_radar_signals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.freshness_scans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.freshness_flags FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.freshness_track_scores FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.freshness_scans TO authenticated;
GRANT SELECT ON TABLE public.freshness_flags TO authenticated;
GRANT SELECT ON TABLE public.freshness_track_scores TO authenticated;

GRANT ALL ON TABLE public.freshness_radar_signals TO service_role;
GRANT ALL ON TABLE public.freshness_scans TO service_role;
GRANT ALL ON TABLE public.freshness_flags TO service_role;
GRANT ALL ON TABLE public.freshness_track_scores TO service_role;

-- Signals: service role only (no authenticated policy).

DROP POLICY IF EXISTS freshness_scans_owner_read ON public.freshness_scans;
CREATE POLICY freshness_scans_owner_read
	ON public.freshness_scans FOR SELECT
	TO authenticated
	USING (
		user_id = (SELECT auth.uid())
		AND public.current_actor_has_project_access(project_id, 'read')
	);

DROP POLICY IF EXISTS freshness_flags_owner_read ON public.freshness_flags;
CREATE POLICY freshness_flags_owner_read
	ON public.freshness_flags FOR SELECT
	TO authenticated
	USING (
		user_id = (SELECT auth.uid())
		AND public.current_actor_has_project_access(project_id, 'read')
	);

DROP POLICY IF EXISTS freshness_track_scores_owner_read ON public.freshness_track_scores;
CREATE POLICY freshness_track_scores_owner_read
	ON public.freshness_track_scores FOR SELECT
	TO authenticated
	USING (
		user_id = (SELECT auth.uid())
		AND public.current_actor_has_project_access(project_id, 'read')
	);

COMMENT ON TABLE public.freshness_radar_signals IS
	'Jev freshness radar: one pending debounced signal per chat session (Tasker 88). Service role only.';
COMMENT ON TABLE public.freshness_scans IS
	'Jev freshness radar: one row per (signal, project) scan, including skipped scans (Tasker 88).';
COMMENT ON TABLE public.freshness_flags IS
	'Jev freshness radar calibration ledger: one row per evaluated subject per scan. Evidence is private to user_id (Tasker 88).';
COMMENT ON TABLE public.freshness_track_scores IS
	'Jev freshness radar on-track gauges for goals and milestones (Tasker 88).';
