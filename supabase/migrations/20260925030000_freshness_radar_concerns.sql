-- supabase/migrations/20260925030000_freshness_radar_concerns.sql
-- Jev freshness radar roll-up (Tasker 106): one living concern per
-- (project, user, subject) instead of a fresh pile of flags per scan.
--
-- freshness_flags stays the append-only calibration ledger. freshness_concerns
-- is the derived current state: each scan merges into it (accumulates evidence,
-- closes concerns whose subject was edited, finished, dismissed or aged out),
-- and the chat card, the single AI Inbox item and the badges read it.
--
-- Like the ledger, a concern quotes the user's own words (evidence excerpt), so
-- rows are readable only by their user while they can still read the project.
-- There are no authenticated write policies: the worker and the web routes
-- write through the admin client after an access check.
--
-- Rollback: DROP TABLE public.freshness_concerns; (nothing else references it).

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.freshness_concerns (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	subject_kind text NOT NULL CHECK (subject_kind IN ('task', 'document', 'goal', 'milestone')),
	subject_id uuid NOT NULL,
	subject_title text NOT NULL,
	status text NOT NULL DEFAULT 'open'
		CHECK (status IN ('open', 'resolved', 'dismissed', 'expired', 'applied')),
	close_reason text CHECK (close_reason IN (
		'resolved_by_update', 'subject_closed', 'user_dismissed', 'user_marked_not_stale',
		'applied', 'aged_out'
	)),
	-- Rolled-up P(out of date): max(decayed peak, discounted noisy-OR of evidence).
	score numeric(5, 4) NOT NULL CHECK (score BETWEEN 0 AND 1),
	peak_probability numeric(5, 4) NOT NULL CHECK (peak_probability BETWEEN 0 AND 1),
	last_probability numeric(5, 4) NOT NULL CHECK (last_probability BETWEEN 0 AND 1),
	evidence_count integer NOT NULL DEFAULT 1 CHECK (evidence_count >= 0),
	seen_count integer NOT NULL DEFAULT 1 CHECK (seen_count >= 0),
	first_flag_id uuid REFERENCES public.freshness_flags(id) ON DELETE SET NULL,
	last_flag_id uuid REFERENCES public.freshness_flags(id) ON DELETE SET NULL,
	-- [{flagId, scanId, probability, at, key}], newest last, capped by policy.
	evidence jsonb NOT NULL DEFAULT '[]',
	-- {changeKind, sections[], decisions[], evidenceExcerpt, proposal, fixInChatPrompt}
	detail jsonb NOT NULL DEFAULT '{}',
	subject_snapshot jsonb,
	subject_updated_at timestamptz,
	first_seen_at timestamptz NOT NULL DEFAULT now(),
	last_seen_at timestamptz NOT NULL DEFAULT now(),
	last_evidence_at timestamptz NOT NULL DEFAULT now(),
	surfaced_at timestamptz,
	surfaced_scan_id uuid REFERENCES public.freshness_scans(id) ON DELETE SET NULL,
	closed_at timestamptz,
	closed_scan_id uuid REFERENCES public.freshness_scans(id) ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT freshness_concerns_closed_has_reason CHECK (
		(status = 'open' AND closed_at IS NULL)
		OR (status <> 'open' AND closed_at IS NOT NULL AND close_reason IS NOT NULL)
	)
);

-- One open concern per subject per user (the merge's backstop).
CREATE UNIQUE INDEX IF NOT EXISTS freshness_concerns_one_open
	ON public.freshness_concerns(project_id, user_id, subject_kind, subject_id)
	WHERE status = 'open';

-- Badges and the inbox item: a project's open concerns.
CREATE INDEX IF NOT EXISTS freshness_concerns_project_open
	ON public.freshness_concerns(project_id, user_id)
	WHERE status = 'open';

-- Subject history (closed concerns included).
CREATE INDEX IF NOT EXISTS freshness_concerns_subject_history
	ON public.freshness_concerns(project_id, subject_kind, subject_id, created_at DESC);

-- Covering indexes for the foreign keys the flag and scan cascades use.
CREATE INDEX IF NOT EXISTS freshness_concerns_first_flag
	ON public.freshness_concerns(first_flag_id) WHERE first_flag_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS freshness_concerns_last_flag
	ON public.freshness_concerns(last_flag_id) WHERE last_flag_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS freshness_concerns_surfaced_scan
	ON public.freshness_concerns(surfaced_scan_id) WHERE surfaced_scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS freshness_concerns_closed_scan
	ON public.freshness_concerns(closed_scan_id) WHERE closed_scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS freshness_concerns_user
	ON public.freshness_concerns(user_id);

DROP TRIGGER IF EXISTS trg_freshness_concerns_updated_at ON public.freshness_concerns;
CREATE TRIGGER trg_freshness_concerns_updated_at
	BEFORE UPDATE ON public.freshness_concerns
	FOR EACH ROW
	EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.freshness_concerns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.freshness_concerns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.freshness_concerns TO authenticated;
GRANT ALL ON TABLE public.freshness_concerns TO service_role;

DROP POLICY IF EXISTS freshness_concerns_owner_read ON public.freshness_concerns;
CREATE POLICY freshness_concerns_owner_read
	ON public.freshness_concerns FOR SELECT
	TO authenticated
	USING (
		user_id = (SELECT auth.uid())
		AND public.current_actor_has_project_access(project_id, 'read')
	);

COMMENT ON TABLE public.freshness_concerns IS
	'Jev freshness radar roll-up: one open concern per (project, user, subject), merged every scan; freshness_flags is the ledger (Tasker 106). Evidence is private to user_id.';

COMMIT;
