-- supabase/migrations/20261114210000_requeue_failed_queue_jobs.sql
--
-- A queue job gets three attempts. When a model provider is down for an hour
-- (2026-10-22), jobs use up their attempts and end as `failed`, and nothing can
-- run them again. This function is the one write behind "Run again" on
-- /admin/jobs: it puts failed jobs back in the queue as if they were new.
--
-- What it does to each named row, only while the row is still `failed`:
--   status -> pending, attempts -> 0, scheduled_for -> now,
--   error_message / processing_token / started_at / completed_at -> NULL.
-- A row that is pending, processing, completed, or cancelled is left alone, so
-- calling it twice, or racing the worker, cannot restart work in flight.
--
-- Dedup keys: the unique index on (dedup_key) covers pending and processing
-- rows. If the same work is already queued again (a newer row with the same
-- key), re-queuing the failed row would break that index; the row is skipped
-- and stays `failed`. When two failed rows in one call share a key, the newest
-- is re-queued and the older one is skipped. Each row is its own savepoint so
-- one skip does not undo the rest.
--
-- Which job types are safe to run again is decided by the caller
-- (apps/web/src/lib/services/admin/failed-jobs/failed-jobs.ts); this function
-- trusts the ids it is given, which is why only the server may call it.
--
-- SECURITY INVOKER, service_role only. queue_jobs writes are server-only since
-- 20261105120000, and the web endpoint calls this with the service-role client
-- after checking the caller is an admin.

CREATE FUNCTION public.requeue_failed_queue_jobs(p_job_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
	v_job_id uuid;
	v_rows integer;
	v_requeued integer := 0;
BEGIN
	IF p_job_ids IS NULL OR cardinality(p_job_ids) = 0 THEN
		RETURN 0;
	END IF;

	FOR v_job_id IN
		SELECT jobs.id
		FROM public.queue_jobs jobs
		WHERE jobs.id = ANY (p_job_ids)
			AND jobs.status = 'failed'::public.queue_status
		ORDER BY jobs.created_at DESC, jobs.id
	LOOP
		BEGIN
			UPDATE public.queue_jobs
			SET
				status = 'pending'::public.queue_status,
				attempts = 0,
				error_message = NULL,
				processing_token = NULL,
				started_at = NULL,
				completed_at = NULL,
				scheduled_for = now(),
				updated_at = now()
			WHERE id = v_job_id
				AND status = 'failed'::public.queue_status;

			GET DIAGNOSTICS v_rows = ROW_COUNT;
			v_requeued := v_requeued + v_rows;
		EXCEPTION
			WHEN unique_violation THEN
				-- The same work is already pending or processing under this dedup key.
				NULL;
		END;
	END LOOP;

	RETURN v_requeued;
END;
$function$;

REVOKE ALL ON FUNCTION public.requeue_failed_queue_jobs(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_failed_queue_jobs(uuid[]) TO service_role;

COMMENT ON FUNCTION public.requeue_failed_queue_jobs(uuid[]) IS
	'Admin "Run again": sets still-failed queue_jobs rows back to pending with attempts 0. Returns how many were re-queued. Server-only.';
