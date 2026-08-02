-- supabase/tests/fixtures/agentic_chat_worker_queue_lockdown_base.sql
-- Minimal pre-Slice-5 queue contract for disposable PostgreSQL verification.
-- The shared Phase 2A fixture supplies roles, users, chat tables, and queue_type.

\ir agentic_chat_worker_phase2a_trust_base.sql

CREATE TYPE public.queue_status AS ENUM (
	'pending',
	'processing',
	'completed',
	'failed',
	'cancelled',
	'retrying'
);

ALTER TABLE public.queue_jobs
	ADD COLUMN user_id uuid NOT NULL,
	ADD COLUMN metadata jsonb,
	ADD COLUMN priority integer DEFAULT 10,
	ADD COLUMN attempts integer DEFAULT 0,
	ADD COLUMN max_attempts integer DEFAULT 3,
	ADD COLUMN scheduled_for timestamptz NOT NULL DEFAULT now(),
	ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
	ADD COLUMN updated_at timestamptz DEFAULT now(),
	ADD COLUMN started_at timestamptz,
	ADD COLUMN completed_at timestamptz,
	ADD COLUMN error_message text,
	ADD COLUMN processing_token uuid,
	ADD COLUMN dedup_key text,
	ADD COLUMN queue_job_id text NOT NULL,
	ADD COLUMN status public.queue_status NOT NULL DEFAULT 'pending';

CREATE UNIQUE INDEX queue_jobs_dedup_key_active_idx
	ON public.queue_jobs (dedup_key)
	WHERE dedup_key IS NOT NULL
		AND status IN ('pending', 'processing');

ALTER TABLE public.queue_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY queue_jobs_authenticated_select
	ON public.queue_jobs
	FOR SELECT TO authenticated
	USING (true);
CREATE POLICY queue_jobs_authenticated_update
	ON public.queue_jobs
	FOR UPDATE TO authenticated
	USING (true)
	WITH CHECK (true);
CREATE POLICY queue_jobs_authenticated_delete
	ON public.queue_jobs
	FOR DELETE TO authenticated
	USING (true);

GRANT SELECT, UPDATE, DELETE ON TABLE public.queue_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.queue_jobs TO service_role;

-- Pin the exact pre-Slice-5 definitions. The canonical shared snapshots advance
-- after hosted deployment and therefore cannot serve as a historical fixture.
\ir ../../../supabase/migrations/20260724010000_queue_correlation_ids.sql

CREATE OR REPLACE FUNCTION public.reset_stalled_jobs(
	p_stall_timeout text DEFAULT '5 minutes'::text
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
	v_reset_count integer;
BEGIN
	WITH stalled_jobs AS (
		SELECT
			id,
			COALESCE(attempts, 0) AS current_attempts,
			COALESCE(max_attempts, 3) AS allowed_attempts
		FROM queue_jobs
		WHERE status = 'processing'
			AND GREATEST(
				COALESCE(started_at, 'epoch'::timestamptz),
				COALESCE(updated_at, 'epoch'::timestamptz)
			) < now() - p_stall_timeout::interval
		FOR UPDATE SKIP LOCKED
	),
	updated_jobs AS (
		UPDATE queue_jobs jobs
		SET
			status = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts
					THEN 'pending'::queue_status
				ELSE 'failed'::queue_status
			END,
			attempts = stalled_jobs.current_attempts + 1,
			processing_token = NULL,
			started_at = NULL,
			scheduled_for = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN
					now()
						+ (LEAST(POWER(2, stalled_jobs.current_attempts), 16) || ' minutes')::interval
						+ (random() * interval '60 seconds')
				ELSE jobs.scheduled_for
			END,
			completed_at = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts
					THEN jobs.completed_at
				ELSE now()
			END,
			error_message = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts
					THEN COALESCE(jobs.error_message, 'Job stalled and was requeued')
				ELSE 'Job stalled and exceeded max attempts'
			END,
			updated_at = now()
		FROM stalled_jobs
		WHERE jobs.id = stalled_jobs.id
		RETURNING jobs.id
	)
	SELECT count(*) INTO v_reset_count FROM updated_jobs;

	RETURN v_reset_count;
END;
$function$;

-- Model the historical default/public function exposure that Slice 5 removes.
GRANT EXECUTE ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_stalled_jobs(text)
	TO PUBLIC, anon, authenticated, service_role;
