-- supabase/migrations/20260426000011_notification_event_type_expansion_for_tracked_in_app.sql
-- Expand notification_events event_type check for tracked in-app migrations.

BEGIN;

ALTER TABLE notification_events
	DROP CONSTRAINT IF EXISTS notification_events_event_type_check;

ALTER TABLE notification_events
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

COMMIT;
