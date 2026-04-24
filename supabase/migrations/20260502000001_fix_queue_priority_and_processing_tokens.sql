-- supabase/migrations/20260502000001_fix_queue_priority_and_processing_tokens.sql
-- Fix queue priority ordering and add per-claim ownership tokens.
-- Lower numeric priority values are higher priority throughout the worker code.

ALTER TABLE public.queue_jobs
	ADD COLUMN IF NOT EXISTS processing_token UUID;

CREATE INDEX IF NOT EXISTS idx_queue_jobs_processing_token
	ON public.queue_jobs(processing_token)
	WHERE processing_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_queue_jobs_pending_claim_priority
	ON public.queue_jobs(job_type, priority ASC, scheduled_for ASC)
	WHERE status = 'pending';

DROP FUNCTION IF EXISTS public.claim_pending_jobs(text[], integer);

CREATE OR REPLACE FUNCTION public.claim_pending_jobs(
	p_job_types text[],
	p_batch_size integer DEFAULT 5
)
RETURNS TABLE(
	id uuid,
	queue_job_id text,
	user_id uuid,
	job_type text,
	metadata jsonb,
	status text,
	priority integer,
	attempts integer,
	max_attempts integer,
	scheduled_for timestamp with time zone,
	created_at timestamp with time zone,
	updated_at timestamp with time zone,
	started_at timestamp with time zone,
	completed_at timestamp with time zone,
	error_message text,
	processing_token uuid
)
LANGUAGE plpgsql
AS $function$
BEGIN
	RETURN QUERY
	UPDATE queue_jobs
	SET
		status = 'processing',
		processing_token = gen_random_uuid(),
		started_at = NOW(),
		updated_at = NOW()
	WHERE queue_jobs.id IN (
		SELECT queue_jobs.id
		FROM queue_jobs
		WHERE queue_jobs.status = 'pending'
			AND queue_jobs.job_type::TEXT = ANY(p_job_types)
			AND queue_jobs.scheduled_for <= NOW()
		ORDER BY queue_jobs.priority ASC, queue_jobs.scheduled_for ASC
		LIMIT p_batch_size
		FOR UPDATE SKIP LOCKED
	)
	RETURNING
		queue_jobs.id,
		queue_jobs.queue_job_id,
		queue_jobs.user_id,
		queue_jobs.job_type::TEXT,
		queue_jobs.metadata,
		queue_jobs.status::TEXT,
		queue_jobs.priority,
		queue_jobs.attempts,
		queue_jobs.max_attempts,
		queue_jobs.scheduled_for,
		queue_jobs.created_at,
		queue_jobs.updated_at,
		queue_jobs.started_at,
		queue_jobs.completed_at,
		queue_jobs.error_message,
		queue_jobs.processing_token;
END;
$function$;

DROP FUNCTION IF EXISTS public.complete_queue_job(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.complete_queue_job(
	p_job_id uuid,
	p_result jsonb DEFAULT NULL::jsonb,
	p_processing_token uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
	v_updated integer;
BEGIN
	UPDATE queue_jobs
	SET
		status = 'completed',
		completed_at = NOW(),
		updated_at = NOW(),
		processing_token = NULL,
		result = p_result
	WHERE id = p_job_id
		AND status IN ('processing', 'completed')
		AND (p_processing_token IS NULL OR processing_token = p_processing_token);

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated > 0;
END;
$function$;

DROP FUNCTION IF EXISTS public.fail_queue_job(uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.fail_queue_job(
	p_job_id uuid,
	p_error_message text,
	p_retry boolean DEFAULT true,
	p_processing_token uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
	v_job record;
	v_updated integer;
	v_retry_delay integer;
BEGIN
	SELECT attempts, max_attempts
	INTO v_job
	FROM queue_jobs
	WHERE id = p_job_id
		AND status IN ('processing', 'failed')
		AND (p_processing_token IS NULL OR processing_token = p_processing_token);

	IF NOT FOUND THEN
		RETURN FALSE;
	END IF;

	v_retry_delay := POWER(2, COALESCE(v_job.attempts, 0));

	IF p_retry AND (COALESCE(v_job.attempts, 0) + 1 < COALESCE(v_job.max_attempts, 3)) THEN
		UPDATE queue_jobs
		SET
			status = 'pending',
			processing_token = NULL,
			started_at = NULL,
			completed_at = NULL,
			attempts = COALESCE(attempts, 0) + 1,
			error_message = p_error_message,
			updated_at = NOW(),
			scheduled_for = NOW() + (v_retry_delay || ' minutes')::INTERVAL
		WHERE id = p_job_id
			AND status IN ('processing', 'failed')
			AND (p_processing_token IS NULL OR processing_token = p_processing_token);
	ELSE
		UPDATE queue_jobs
		SET
			status = 'failed',
			processing_token = NULL,
			attempts = COALESCE(attempts, 0) + 1,
			error_message = p_error_message,
			completed_at = NOW(),
			updated_at = NOW()
		WHERE id = p_job_id
			AND status IN ('processing', 'failed')
			AND (p_processing_token IS NULL OR processing_token = p_processing_token);
	END IF;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_stalled_jobs(p_stall_timeout text DEFAULT '5 minutes'::text)
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
			) < NOW() - p_stall_timeout::INTERVAL
		FOR UPDATE SKIP LOCKED
	),
	updated_jobs AS (
		UPDATE queue_jobs q
		SET
			status = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN 'pending'::queue_status
				ELSE 'failed'::queue_status
			END,
			attempts = stalled_jobs.current_attempts + 1,
			processing_token = NULL,
			started_at = NULL,
			scheduled_for = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN NOW()
				ELSE q.scheduled_for
			END,
			completed_at = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN q.completed_at
				ELSE NOW()
			END,
			error_message = CASE
				WHEN stalled_jobs.current_attempts + 1 < stalled_jobs.allowed_attempts THEN
					COALESCE(q.error_message, 'Job stalled and was requeued')
				ELSE
					'Job stalled and exceeded max attempts'
			END,
			updated_at = NOW()
		FROM stalled_jobs
		WHERE q.id = stalled_jobs.id
		RETURNING q.id
	)
	SELECT COUNT(*) INTO v_reset_count FROM updated_jobs;

	IF v_reset_count > 0 THEN
		RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
	END IF;

	RETURN v_reset_count;
END;
$function$;
