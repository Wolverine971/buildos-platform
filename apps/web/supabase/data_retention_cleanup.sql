-- apps/web/supabase/data_retention_cleanup.sql
-- Manual operational data cleanup script based on retention windows.
--
-- Safety:
-- 1) Run apps/web/supabase/data_retention_audit.sql first.
-- 2) Use a transaction and inspect counts before COMMIT.
-- 3) For test runs, replace COMMIT with ROLLBACK.

BEGIN;

-- Queue jobs (completed): run in DB-side batches.
-- Re-run this SELECT until deleted_count = 0 for full catch-up.
SELECT
	'queue_jobs.completed' AS dataset,
	*
FROM public.delete_old_completed_queue_jobs(
	p_retention_days := 30,
	p_batch_size := 1000,
	p_job_types := NULL
);

WITH deleted AS (
	DELETE FROM email_tracking_events
	WHERE created_at < NOW() - INTERVAL '180 days'
	RETURNING id
)
SELECT 'email_tracking_events' AS dataset, COUNT(*) AS deleted_rows FROM deleted;

WITH deleted AS (
	DELETE FROM error_logs
	WHERE created_at < NOW() - INTERVAL '180 days'
	RETURNING id
)
SELECT 'error_logs' AS dataset, COUNT(*) AS deleted_rows FROM deleted;

WITH deleted AS (
	DELETE FROM notification_logs
	WHERE created_at < NOW() - INTERVAL '90 days'
	RETURNING id
)
SELECT 'notification_logs' AS dataset, COUNT(*) AS deleted_rows FROM deleted;

WITH deleted AS (
	DELETE FROM user_activity_logs
	WHERE created_at < NOW() - INTERVAL '90 days'
	RETURNING id
)
SELECT 'user_activity_logs' AS dataset, COUNT(*) AS deleted_rows FROM deleted;

WITH deleted AS (
	DELETE FROM webhook_events
	WHERE created_at < NOW() - INTERVAL '30 days'
	RETURNING id
)
SELECT 'webhook_events' AS dataset, COUNT(*) AS deleted_rows FROM deleted;

-- Delete scheduled SMS first because it references sms_messages(id).
WITH deleted AS (
	DELETE FROM scheduled_sms_messages
	WHERE created_at < NOW() - INTERVAL '90 days'
		AND status IN ('sent', 'delivered', 'failed', 'undelivered', 'cancelled')
	RETURNING id
)
SELECT 'scheduled_sms_messages' AS dataset, COUNT(*) AS deleted_rows FROM deleted;

WITH deleted AS (
	DELETE FROM sms_messages sm
	WHERE sm.created_at < NOW() - INTERVAL '90 days'
		AND sm.status IN ('sent', 'delivered', 'failed', 'undelivered', 'cancelled')
		AND NOT EXISTS (
			SELECT 1
			FROM scheduled_sms_messages ssm
			WHERE ssm.sms_message_id = sm.id
		)
	RETURNING sm.id
)
SELECT 'sms_messages' AS dataset, COUNT(*) AS deleted_rows FROM deleted;

COMMIT;
