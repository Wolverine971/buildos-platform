-- libri-migration: true
-- libri-allow-public: queue_type:alter
-- Libri phase 3B.1: durable research orchestration state and queue labels.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'libri_ingest';
ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'libri_research';
ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'libri_derive';
ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'libri_maintenance';

CREATE TABLE libri.research_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
	idempotency_key text NOT NULL,
	queue_family text NOT NULL,
	kind text NOT NULL,
	subject_type text NOT NULL,
	subject_id uuid,
	requested_by_actor text NOT NULL DEFAULT 'user',
	requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
	status text NOT NULL DEFAULT 'queued',
	plan_version integer NOT NULL DEFAULT 1,
	plan jsonb NOT NULL DEFAULT '{}'::jsonb,
	max_steps integer NOT NULL DEFAULT 100,
	max_depth integer NOT NULL DEFAULT 4,
	max_sources integer NOT NULL DEFAULT 50,
	max_attempts_per_step integer NOT NULL DEFAULT 3,
	max_concurrent_steps integer NOT NULL DEFAULT 2,
	token_budget bigint,
	cost_budget_microusd bigint,
	deadline_at timestamptz,
	planned_steps integer NOT NULL DEFAULT 0,
	completed_steps integer NOT NULL DEFAULT 0,
	failed_steps integer NOT NULL DEFAULT 0,
	dead_letter_steps integer NOT NULL DEFAULT 0,
	execution_generation integer NOT NULL DEFAULT 0,
	cancel_requested_at timestamptz,
	cancel_reason text,
	started_at timestamptz,
	last_progress_at timestamptz,
	finished_at timestamptz,
	error_class text,
	error_message text,
	result jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT research_runs_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT research_runs_library_idempotency_unique UNIQUE (library_id, idempotency_key),
	CONSTRAINT research_runs_idempotency_nonempty CHECK (length(btrim(idempotency_key)) > 0),
	CONSTRAINT research_runs_queue_family_valid CHECK (
		queue_family IN ('libri_ingest', 'libri_research', 'libri_derive', 'libri_maintenance')
	),
	CONSTRAINT research_runs_kind_nonempty CHECK (length(btrim(kind)) > 0),
	CONSTRAINT research_runs_subject_type_valid CHECK (
		subject_type IN (
			'book',
			'chapter',
			'person',
			'source',
			'youtube_video',
			'library',
			'maintenance'
		)
	),
	CONSTRAINT research_runs_subject_shape CHECK (
		subject_id IS NOT NULL OR subject_type = 'maintenance'
	),
	CONSTRAINT research_runs_requested_by_actor_valid CHECK (
		requested_by_actor IN ('user', 'system')
	),
	CONSTRAINT research_runs_requested_by_shape CHECK (
		requested_by_actor = 'user'
		OR (requested_by_actor = 'system' AND requested_by IS NULL)
	),
	CONSTRAINT research_runs_status_valid CHECK (
		status IN (
			'queued',
			'running',
			'cancelling',
			'completed',
			'partial',
			'failed',
			'cancelled',
			'needs_review',
			'budget_exhausted'
		)
	),
	CONSTRAINT research_runs_plan_version_positive CHECK (plan_version > 0),
	CONSTRAINT research_runs_plan_object CHECK (jsonb_typeof(plan) = 'object'),
	CONSTRAINT research_runs_budget_positive CHECK (
		max_steps > 0
		AND max_depth >= 0
		AND max_sources >= 0
		AND max_attempts_per_step > 0
		AND max_concurrent_steps > 0
		AND (token_budget IS NULL OR token_budget > 0)
		AND (cost_budget_microusd IS NULL OR cost_budget_microusd > 0)
	),
	CONSTRAINT research_runs_counters_nonnegative CHECK (
		planned_steps >= 0
		AND completed_steps >= 0
		AND failed_steps >= 0
		AND dead_letter_steps >= 0
		AND completed_steps + failed_steps + dead_letter_steps <= planned_steps
	),
	CONSTRAINT research_runs_execution_generation_nonnegative CHECK (execution_generation >= 0),
	CONSTRAINT research_runs_running_started CHECK (
		status NOT IN ('running', 'cancelling') OR started_at IS NOT NULL
	),
	CONSTRAINT research_runs_terminal_finished CHECK (
		status NOT IN (
			'completed',
			'partial',
			'failed',
			'cancelled',
			'needs_review',
			'budget_exhausted'
		)
		OR finished_at IS NOT NULL
	),
	CONSTRAINT research_runs_result_object CHECK (jsonb_typeof(result) = 'object'),
	CONSTRAINT research_runs_cancel_reason_nonempty CHECK (
		cancel_reason IS NULL OR length(btrim(cancel_reason)) > 0
	),
	CONSTRAINT research_runs_error_class_nonempty CHECK (
		error_class IS NULL OR length(btrim(error_class)) > 0
	)
);

CREATE INDEX research_runs_requested_by_idx
	ON libri.research_runs (requested_by, created_at DESC)
	WHERE requested_by IS NOT NULL;
CREATE INDEX research_runs_library_status_created_idx
	ON libri.research_runs (library_id, status, created_at DESC);
CREATE INDEX research_runs_library_subject_created_idx
	ON libri.research_runs (library_id, subject_type, subject_id, created_at DESC);
CREATE INDEX research_runs_active_progress_idx
	ON libri.research_runs (status, last_progress_at, created_at)
	WHERE status IN ('queued', 'running', 'cancelling');
CREATE INDEX research_runs_active_deadline_idx
	ON libri.research_runs (deadline_at)
	WHERE deadline_at IS NOT NULL
		AND status IN ('queued', 'running', 'cancelling');

CREATE TABLE libri.research_steps (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL,
	run_id uuid NOT NULL,
	parent_step_id uuid,
	idempotency_key text NOT NULL,
	queue_family text NOT NULL,
	kind text NOT NULL,
	stage text NOT NULL,
	position integer NOT NULL,
	depth integer NOT NULL DEFAULT 0,
	status text NOT NULL DEFAULT 'pending',
	priority integer NOT NULL DEFAULT 100,
	payload_version integer NOT NULL DEFAULT 1,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	result jsonb NOT NULL DEFAULT '{}'::jsonb,
	attempts integer NOT NULL DEFAULT 0,
	max_attempts integer NOT NULL DEFAULT 3,
	scheduled_for timestamptz NOT NULL DEFAULT now(),
	active_queue_job_id uuid,
	active_processing_token uuid,
	execution_generation integer NOT NULL DEFAULT 0,
	lease_token uuid,
	lease_owner text,
	leased_at timestamptz,
	lease_expires_at timestamptz,
	last_heartbeat_at timestamptz,
	provider text,
	model text,
	prompt_tokens bigint,
	completion_tokens bigint,
	estimated_cost_microusd bigint,
	started_at timestamptz,
	completed_at timestamptz,
	error_class text,
	error_message text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT research_steps_run_library_fk
		FOREIGN KEY (library_id, run_id)
		REFERENCES libri.research_runs(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT research_steps_parent_run_library_fk
		FOREIGN KEY (library_id, run_id, parent_step_id)
		REFERENCES libri.research_steps(library_id, run_id, id)
		ON DELETE CASCADE,
	CONSTRAINT research_steps_library_run_id_unique UNIQUE (library_id, run_id, id),
	CONSTRAINT research_steps_run_idempotency_unique UNIQUE (run_id, idempotency_key),
	CONSTRAINT research_steps_idempotency_nonempty CHECK (length(btrim(idempotency_key)) > 0),
	CONSTRAINT research_steps_queue_family_valid CHECK (
		queue_family IN ('libri_ingest', 'libri_research', 'libri_derive', 'libri_maintenance')
	),
	CONSTRAINT research_steps_kind_nonempty CHECK (length(btrim(kind)) > 0),
	CONSTRAINT research_steps_stage_valid CHECK (
		stage IN (
			'resolve_subject',
			'identify_gaps',
			'discover_candidates',
			'validate_candidates',
			'capture_sources',
			'normalize_chunks',
			'extract_claims',
			'build_derived_views',
			'finalize',
			'maintenance'
		)
	),
	CONSTRAINT research_steps_position_nonnegative CHECK (position >= 0),
	CONSTRAINT research_steps_depth_nonnegative CHECK (depth >= 0),
	CONSTRAINT research_steps_status_valid CHECK (
		status IN (
			'pending',
			'queued',
			'leased',
			'retry_wait',
			'completed',
			'failed',
			'cancelled',
			'skipped',
			'needs_review',
			'dead_letter'
		)
	),
	CONSTRAINT research_steps_priority_range CHECK (priority BETWEEN 1 AND 1000),
	CONSTRAINT research_steps_payload_version_positive CHECK (payload_version > 0),
	CONSTRAINT research_steps_payload_object CHECK (jsonb_typeof(payload) = 'object'),
	CONSTRAINT research_steps_result_object CHECK (jsonb_typeof(result) = 'object'),
	CONSTRAINT research_steps_attempts_valid CHECK (
		attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts
	),
	CONSTRAINT research_steps_execution_generation_nonnegative CHECK (
		execution_generation >= 0
	),
	CONSTRAINT research_steps_lease_shape CHECK (
		status <> 'leased'
		OR (
			active_queue_job_id IS NOT NULL
			AND active_processing_token IS NOT NULL
			AND execution_generation > 0
			AND lease_token IS NOT NULL
			AND lease_owner IS NOT NULL
			AND length(btrim(lease_owner)) > 0
			AND leased_at IS NOT NULL
			AND lease_expires_at IS NOT NULL
			AND lease_expires_at > leased_at
			AND last_heartbeat_at IS NOT NULL
			AND last_heartbeat_at >= leased_at
			AND started_at IS NOT NULL
		)
	),
	CONSTRAINT research_steps_terminal_completed_at CHECK (
		status NOT IN (
			'completed',
			'failed',
			'cancelled',
			'skipped',
			'needs_review',
			'dead_letter'
		)
		OR completed_at IS NOT NULL
	),
	CONSTRAINT research_steps_token_usage_nonnegative CHECK (
		(prompt_tokens IS NULL OR prompt_tokens >= 0)
		AND (completion_tokens IS NULL OR completion_tokens >= 0)
		AND (estimated_cost_microusd IS NULL OR estimated_cost_microusd >= 0)
	),
	CONSTRAINT research_steps_error_class_nonempty CHECK (
		error_class IS NULL OR length(btrim(error_class)) > 0
	)
);

CREATE INDEX research_steps_run_status_priority_idx
	ON libri.research_steps (library_id, run_id, status, priority, scheduled_for);
CREATE INDEX research_steps_parent_idx
	ON libri.research_steps (library_id, run_id, parent_step_id)
	WHERE parent_step_id IS NOT NULL;
CREATE INDEX research_steps_library_kind_status_idx
	ON libri.research_steps (library_id, kind, status, updated_at DESC);
CREATE INDEX research_steps_stale_lease_idx
	ON libri.research_steps (lease_expires_at, id)
	WHERE status = 'leased';
CREATE UNIQUE INDEX research_steps_active_queue_job_unique_idx
	ON libri.research_steps (active_queue_job_id)
	WHERE active_queue_job_id IS NOT NULL;

CREATE TRIGGER research_runs_set_updated_at
	BEFORE UPDATE ON libri.research_runs
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER research_steps_set_updated_at
	BEFORE UPDATE ON libri.research_steps
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

ALTER TABLE libri.research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.research_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_steps FORCE ROW LEVEL SECURITY;

CREATE POLICY research_runs_select_member
	ON libri.research_runs
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM libri.library_members AS member
			WHERE member.library_id = research_runs.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);

CREATE POLICY research_steps_select_member
	ON libri.research_steps
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM libri.library_members AS member
			WHERE member.library_id = research_steps.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);

REVOKE ALL ON libri.research_runs, libri.research_steps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON libri.research_runs, libri.research_steps TO authenticated;
GRANT ALL ON libri.research_runs, libri.research_steps TO service_role;
