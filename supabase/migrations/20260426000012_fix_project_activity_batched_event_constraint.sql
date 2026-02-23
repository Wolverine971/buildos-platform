-- supabase/migrations/20260426000012_fix_project_activity_batched_event_constraint.sql
-- Fix legacy notification_events event_type check constraints that block
-- project.activity.batched inserts in flush_project_activity_notification_batch.

BEGIN;

-- Drop any legacy/duplicate check constraints that validate event_type
-- (for example: valid_event_type + notification_events_event_type_check).
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

COMMENT ON CONSTRAINT notification_events_event_type_check ON public.notification_events IS
	'Canonical event_type allow-list. Replaces legacy valid_event_type constraints.';

-- Requeue project activity batches that failed specifically because
-- project.activity.batched violated a legacy constraint.
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
