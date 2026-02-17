-- apps/web/supabase/data_retention_audit.sql
-- Non-destructive audit query to size retention opportunities.
-- Run this before adding/deploying delete policies for each dataset.

SELECT
	'queue_jobs.completed' AS dataset,
	'30 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(completed_at) AS oldest_row_ts,
	MAX(completed_at) AS newest_row_ts
FROM queue_jobs
WHERE status = 'completed'
	AND completed_at < NOW() - INTERVAL '30 days'

UNION ALL

SELECT
	'cron_logs' AS dataset,
	'30 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(executed_at) AS oldest_row_ts,
	MAX(executed_at) AS newest_row_ts
FROM cron_logs
WHERE executed_at < NOW() - INTERVAL '30 days'

UNION ALL

SELECT
	'webhook_events' AS dataset,
	'30 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM webhook_events
WHERE created_at < NOW() - INTERVAL '30 days'

UNION ALL

SELECT
	'project_context_snapshot_metrics' AS dataset,
	'30 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(computed_at) AS oldest_row_ts,
	MAX(computed_at) AS newest_row_ts
FROM project_context_snapshot_metrics
WHERE computed_at < NOW() - INTERVAL '30 days'

UNION ALL

SELECT
	'notification_logs' AS dataset,
	'90 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM notification_logs
WHERE created_at < NOW() - INTERVAL '90 days'

UNION ALL

SELECT
	'sms_messages' AS dataset,
	'90 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM sms_messages
WHERE created_at < NOW() - INTERVAL '90 days'
	AND status IN ('sent', 'delivered', 'failed', 'undelivered', 'cancelled')

UNION ALL

SELECT
	'scheduled_sms_messages' AS dataset,
	'90 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM scheduled_sms_messages
WHERE created_at < NOW() - INTERVAL '90 days'
	AND status IN ('sent', 'delivered', 'failed', 'undelivered', 'cancelled')

UNION ALL

SELECT
	'tree_agent_events' AS dataset,
	'90 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM tree_agent_events
WHERE created_at < NOW() - INTERVAL '90 days'

UNION ALL

SELECT
	'homework_run_events' AS dataset,
	'90 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM homework_run_events
WHERE created_at < NOW() - INTERVAL '90 days'

UNION ALL

SELECT
	'user_activity_logs' AS dataset,
	'90 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM user_activity_logs
WHERE created_at < NOW() - INTERVAL '90 days'

UNION ALL

SELECT
	'web_page_visits' AS dataset,
	'180 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM web_page_visits
WHERE created_at < NOW() - INTERVAL '180 days'

UNION ALL

SELECT
	'error_logs' AS dataset,
	'180 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM error_logs
WHERE created_at < NOW() - INTERVAL '180 days'

UNION ALL

SELECT
	'email_tracking_events' AS dataset,
	'180 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM email_tracking_events
WHERE created_at < NOW() - INTERVAL '180 days'

UNION ALL

SELECT
	'llm_usage_logs' AS dataset,
	'365 days' AS retention_window,
	COUNT(*) AS rows_eligible,
	MIN(created_at) AS oldest_row_ts,
	MAX(created_at) AS newest_row_ts
FROM llm_usage_logs
WHERE created_at < NOW() - INTERVAL '365 days'

ORDER BY dataset;
