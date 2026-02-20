-- supabase/migrations/20260426000009_decommission_legacy_brief_email_jobs.sql
-- Decommission legacy generate_brief_email queue path.
-- Notification emails are sent through send_notification/email adapter flow.

BEGIN;

UPDATE queue_jobs
SET
	status = 'cancelled',
	error_message = COALESCE(
		NULLIF(error_message, ''),
		'Cancelled: legacy generate_brief_email job type decommissioned'
	),
	updated_at = NOW()
WHERE job_type = 'generate_brief_email'
	AND status IN ('pending', 'retrying', 'processing');

COMMIT;
