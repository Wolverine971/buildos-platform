-- libri-migration: true
-- libri-allow-public: queue_jobs:policy, queue_jobs:grant, queue_jobs:revoke
-- Libri phase 3B.2: least-privilege direct-worker RLS and column grants.
-- Prerequisite: the separately provisioned libri_worker login exists with no
-- memberships, no bypass privileges, a connection limit of three, and no password
-- until its Railway secret is provisioned.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

REVOKE ALL ON ALL TABLES IN SCHEMA libri FROM libri_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA libri FROM libri_worker;
REVOKE ALL ON TABLE public.queue_jobs FROM libri_worker;

GRANT USAGE ON SCHEMA libri TO libri_worker;

GRANT SELECT (id, created_by)
	ON TABLE libri.libraries TO libri_worker;

GRANT SELECT
	ON TABLE libri.research_runs, libri.research_steps TO libri_worker;

GRANT UPDATE (
	status,
	planned_steps,
	completed_steps,
	failed_steps,
	dead_letter_steps,
	execution_generation,
	cancel_requested_at,
	cancel_reason,
	started_at,
	last_progress_at,
	finished_at,
	error_class,
	error_message,
	result,
	updated_at
) ON TABLE libri.research_runs TO libri_worker;

GRANT UPDATE (
	status,
	result,
	attempts,
	scheduled_for,
	active_queue_job_id,
	active_processing_token,
	execution_generation,
	lease_token,
	lease_owner,
	leased_at,
	lease_expires_at,
	last_heartbeat_at,
	provider,
	model,
	prompt_tokens,
	completion_tokens,
	estimated_cost_microusd,
	started_at,
	completed_at,
	error_class,
	error_message,
	updated_at
) ON TABLE libri.research_steps TO libri_worker;

GRANT SELECT (
	id,
	queue_job_id,
	user_id,
	job_type,
	metadata,
	status,
	priority,
	attempts,
	max_attempts,
	scheduled_for,
	created_at,
	updated_at,
	started_at,
	completed_at,
	error_message,
	processing_token,
	result,
	dedup_key
) ON TABLE public.queue_jobs TO libri_worker;

GRANT INSERT (
	user_id,
	job_type,
	metadata,
	priority,
	scheduled_for,
	dedup_key,
	status,
	queue_job_id,
	attempts,
	max_attempts
) ON TABLE public.queue_jobs TO libri_worker;

GRANT UPDATE (
	status,
	metadata,
	priority,
	attempts,
	max_attempts,
	scheduled_for,
	updated_at,
	started_at,
	completed_at,
	error_message,
	processing_token,
	result
) ON TABLE public.queue_jobs TO libri_worker;

CREATE POLICY libraries_libri_worker_select
	ON libri.libraries
	FOR SELECT
	TO libri_worker
	USING (true);

CREATE POLICY research_runs_libri_worker_select
	ON libri.research_runs
	FOR SELECT
	TO libri_worker
	USING (true);

CREATE POLICY research_runs_libri_worker_update
	ON libri.research_runs
	FOR UPDATE
	TO libri_worker
	USING (true)
	WITH CHECK (true);

CREATE POLICY research_steps_libri_worker_select
	ON libri.research_steps
	FOR SELECT
	TO libri_worker
	USING (true);

CREATE POLICY research_steps_libri_worker_update
	ON libri.research_steps
	FOR UPDATE
	TO libri_worker
	USING (true)
	WITH CHECK (true);

CREATE POLICY queue_jobs_libri_worker_select
	ON public.queue_jobs
	FOR SELECT
	TO libri_worker
	USING (
		job_type IN (
			'libri_ingest',
			'libri_research',
			'libri_derive',
			'libri_maintenance'
		)
	);

CREATE POLICY queue_jobs_libri_worker_insert
	ON public.queue_jobs
	FOR INSERT
	TO libri_worker
	WITH CHECK (
		job_type IN (
			'libri_ingest',
			'libri_research',
			'libri_derive',
			'libri_maintenance'
		)
	);

CREATE POLICY queue_jobs_libri_worker_update
	ON public.queue_jobs
	FOR UPDATE
	TO libri_worker
	USING (
		job_type IN (
			'libri_ingest',
			'libri_research',
			'libri_derive',
			'libri_maintenance'
		)
	)
	WITH CHECK (
		job_type IN (
			'libri_ingest',
			'libri_research',
			'libri_derive',
			'libri_maintenance'
		)
	);
