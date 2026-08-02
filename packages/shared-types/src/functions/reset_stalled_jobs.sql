-- packages/shared-types/src/functions/reset_stalled_jobs.sql
-- Source: Supabase pg_get_functiondef after 20260801030600

CREATE OR REPLACE FUNCTION public.reset_stalled_jobs(p_stall_timeout text DEFAULT '5 minutes'::text, p_include_job_types text[] DEFAULT NULL::text[], p_exclude_job_types text[] DEFAULT ARRAY['agentic_chat_turn'::text])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_reset_count integer;
BEGIN
	WITH stalled_jobs AS (
		SELECT
			jobs.id,
			COALESCE(jobs.attempts, 0) AS current_attempts,
			COALESCE(jobs.max_attempts, 3) AS allowed_attempts
		FROM public.queue_jobs jobs
		WHERE jobs.status = 'processing'
			-- Generic recovery must never replay an agentic chat turn. The later
			-- chat-specific routine owns its generation/effect-aware recovery.
			AND jobs.job_type::text <> 'agentic_chat_turn'
			AND (
				p_include_job_types IS NULL
				OR jobs.job_type::text = ANY(p_include_job_types)
			)
			AND NOT (
				jobs.job_type::text = ANY(
					COALESCE(p_exclude_job_types, ARRAY[]::text[])
				)
			)
			AND GREATEST(
				COALESCE(jobs.started_at, 'epoch'::timestamptz),
				COALESCE(jobs.updated_at, 'epoch'::timestamptz)
			) < now() - p_stall_timeout::interval
		FOR UPDATE SKIP LOCKED
	),
	updated_jobs AS (
		UPDATE public.queue_jobs jobs
		SET
			status = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts
					THEN 'pending'::public.queue_status
				ELSE 'failed'::public.queue_status
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

	IF v_reset_count > 0 THEN
		RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
	END IF;

	RETURN v_reset_count;
END;
$function$
