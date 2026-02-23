-- apps/web/supabase/diagnostics/check_project_activity_notification_pipeline.sql
-- Diagnose and remediate shared-project activity notification failures.
--
-- Usage:
-- 1) Run sections 1-4 to inspect pipeline state.
-- 2) If you see `valid_event_type` errors, run section 5 (remediation).
-- 3) Run section 6 to confirm recovery.

-- ============================================================
-- 1) Check event_type constraints on notification_events
-- ============================================================
SELECT
	c.conname,
	pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
WHERE c.conrelid = 'public.notification_events'::regclass
	AND c.contype = 'c'
ORDER BY c.conname;

-- ============================================================
-- 2) Recent shared-project activity batches
-- ============================================================
SELECT
	id,
	project_id,
	recipient_user_id,
	status,
	event_count,
	flush_after,
	flushed_at,
	last_error,
	created_at,
	updated_at
FROM public.project_notification_batches
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================
-- 3) Recent queue jobs for batch flushes
-- ============================================================
SELECT
	id,
	job_type,
	status,
	metadata,
	attempts,
	max_attempts,
	error_message,
	scheduled_for,
	created_at
FROM public.queue_jobs
WHERE job_type = 'project_activity_batch_flush'
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================
-- 4) Recent project.activity.batched events + deliveries
-- ============================================================
SELECT
	ne.id AS event_id,
	ne.event_type,
	ne.target_user_id,
	ne.created_at AS event_created_at,
	nd.id AS delivery_id,
	nd.channel,
	nd.status AS delivery_status,
	nd.created_at AS delivery_created_at,
	nd.last_error
FROM public.notification_events ne
LEFT JOIN public.notification_deliveries nd ON nd.event_id = ne.id
WHERE ne.event_type = 'project.activity.batched'
ORDER BY ne.created_at DESC
LIMIT 100;

-- ============================================================
-- 5) Remediation (run only if failures reference valid_event_type)
-- ============================================================
BEGIN;

DO $$
DECLARE
	v_constraint record;
BEGIN
	FOR v_constraint IN
		SELECT c.conname
		FROM pg_constraint c
		WHERE c.conrelid = 'public.notification_events'::regclass
			AND c.contype = 'c'
			AND pg_get_constraintdef(c.oid) ILIKE '%event_type%'
	LOOP
		EXECUTE format(
			'ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS %I',
			v_constraint.conname
		);
	END LOOP;
END;
$$;

ALTER TABLE public.notification_events
	ADD CONSTRAINT notification_events_event_type_check
	CHECK (
		event_type IN (
			'user.signup',
			'user.trial_expired',
			'payment.failed',
			'error.critical',
			'brief.completed',
			'brief.failed',
			'brain_dump.processed',
			'task.due_soon',
			'project.phase_scheduled',
			'calendar.sync_failed',
			'project.invite.accepted',
			'project.activity.changed',
			'project.activity.batched',
			'task.assigned',
			'entity.tagged',
			'comment.mentioned',
			'payment.warning',
			'user.trial_reminder',
			'billing_ops_anomaly',
			'homework.run_completed',
			'homework.run_stopped',
			'homework.run_failed',
			'homework.run_canceled',
			'homework.run_updated'
		)
	);

WITH reset_batches AS (
	UPDATE public.project_notification_batches b
	SET
		status = 'pending',
		last_error = NULL,
		updated_at = NOW()
	WHERE b.status = 'failed'
		AND b.flushed_event_id IS NULL
		AND COALESCE(b.last_error, '') ILIKE '%valid_event_type%'
	RETURNING
		b.id,
		b.project_id,
		b.recipient_user_id
)
SELECT public.add_queue_job(
	p_user_id => rb.recipient_user_id,
	p_job_type => 'project_activity_batch_flush',
	p_metadata => jsonb_build_object(
		'batch_id', rb.id,
		'recipient_user_id', rb.recipient_user_id,
		'project_id', rb.project_id
	),
	p_priority => 8,
	p_scheduled_for => NOW(),
	p_dedup_key => format('project_activity_batch_flush:%s', rb.id)
)
FROM reset_batches rb;

COMMIT;

-- ============================================================
-- 6) Verify recovery
-- ============================================================
SELECT
	status,
	COUNT(*) AS count
FROM public.project_notification_batches
GROUP BY status
ORDER BY status;

SELECT
	event_type,
	COUNT(*) AS count
FROM public.notification_events
WHERE created_at >= NOW() - INTERVAL '1 day'
GROUP BY event_type
ORDER BY count DESC, event_type ASC;
