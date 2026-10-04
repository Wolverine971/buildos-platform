-- supabase/migrations/20261003150100_consolidation_runs.sql
-- Document consolidation runs, part 2 of 2 (docs/research/doc-task-consolidation-2026-10-03).
--
-- A run surveys a project and its sub-projects, groups docs that belong together
-- and decides what to do with each group. What it can't settle becomes a question
-- card with 2-4 options. Both tables are service-only: the worker writes them,
-- and web routes check that the signed-in user owns the run before reading or
-- answering through the admin client (the Organize journal pattern).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.consolidation_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	-- The project the run was started from; project_ids is it plus its sub-projects.
	root_project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	project_ids uuid[] NOT NULL CHECK (cardinality(project_ids) BETWEEN 1 AND 20),
	request text CHECK (request IS NULL OR char_length(request) <= 2000),
	status text NOT NULL DEFAULT 'surveying'
		CHECK (status IN ('surveying', 'waiting', 'review', 'applying', 'applied', 'undone', 'failed', 'cancelled')),
	-- What the run page shows while it works: stage, counts.
	progress jsonb NOT NULL DEFAULT '{}'::jsonb,
	-- Clusters with their operations (ConsolidationPlan in shared-agent-ops).
	plan jsonb,
	-- What was applied, and the handles Undo needs (Organize batch id, archived docs).
	receipt jsonb,
	cost_usd numeric(10, 4) NOT NULL DEFAULT 0,
	error text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	finished_at timestamptz
);
CREATE INDEX consolidation_runs_user_idx ON public.consolidation_runs (user_id, created_at DESC);
CREATE INDEX consolidation_runs_root_idx ON public.consolidation_runs (root_project_id, created_at DESC);
-- One unfinished run per project at a time.
CREATE UNIQUE INDEX consolidation_runs_one_open_idx ON public.consolidation_runs (root_project_id)
	WHERE status IN ('surveying', 'waiting', 'review', 'applying');
ALTER TABLE public.consolidation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consolidation_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.consolidation_runs TO service_role;

CREATE TABLE public.consolidation_questions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
	-- What the question holds up (e.g. 'cluster:c3'); the rest of the run keeps going.
	piece text NOT NULL CHECK (char_length(piece) BETWEEN 1 AND 120),
	header text NOT NULL CHECK (char_length(header) BETWEEN 1 AND 24),
	question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 400),
	evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
	options jsonb NOT NULL
		CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 4),
	recommended_option_id text,
	-- Applied on skip; code guarantees it only keeps things.
	skip_option_id text NOT NULL,
	priority integer NOT NULL DEFAULT 0,
	status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'skipped', 'withdrawn')),
	answer jsonb,
	-- An unconfirmed reading of typed text or a chat-about-this thread.
	draft jsonb,
	answered_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CHECK ((status IN ('answered', 'skipped')) = (answer IS NOT NULL))
);
CREATE INDEX consolidation_questions_run_idx ON public.consolidation_questions (run_id, status, priority DESC);
ALTER TABLE public.consolidation_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consolidation_questions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.consolidation_questions TO service_role;

-- One merge per group the owner chose to merge: the fact ledger (every fact
-- pulled from the sources and its fate), the written draft, and how much of
-- the ledger the draft states. Apply creates the doc from `markdown`.
CREATE TABLE public.consolidation_merges (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
	cluster_key text NOT NULL CHECK (char_length(cluster_key) BETWEEN 1 AND 40),
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'extracting', 'reconciling', 'waiting', 'writing', 'ready', 'failed')),
	title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
	target_project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	source_ids uuid[] NOT NULL CHECK (cardinality(source_ids) BETWEEN 2 AND 20),
	ledger jsonb,
	markdown text CHECK (markdown IS NULL OR char_length(markdown) <= 200000),
	coverage jsonb,
	error text,
	cost_usd numeric(10, 4) NOT NULL DEFAULT 0,
	created_document_id uuid,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (run_id, cluster_key)
);
ALTER TABLE public.consolidation_merges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consolidation_merges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.consolidation_merges TO service_role;

-- Project fold (20260930220000, not yet applied everywhere) classifies every
-- column that points at a project. A run is history of the project it ran on.
DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'consolidation_runs', 'root_project_id', 'leave_behind',
				'Consolidation runs are history of the project they ran on; a fold does not move them.'),
			('public', 'consolidation_runs', 'project_ids', 'leave_behind',
				'Consolidation runs keep the scope they ran with; a fold does not rewrite it.'),
			('public', 'consolidation_merges', 'target_project_id', 'leave_behind',
				'A merge draft is history of the run that wrote it; the created doc moves with its project.')
		ON CONFLICT DO NOTHING;
	END IF;
END $fold$;

COMMIT;
