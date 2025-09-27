-- scripts/audit-enum-values.sql
-- Audit SQL queries to get distinct values for potential enum fields
-- Run this against your Supabase database to get current values

-- 1. Project Status
SELECT 'projects.status' as field, status as value, COUNT(*) as count 
FROM projects 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 2. Task Status
SELECT 'tasks.status' as field, status as value, COUNT(*) as count 
FROM tasks 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 3. Task Priority
SELECT 'tasks.priority' as field, priority as value, COUNT(*) as count 
FROM tasks 
WHERE priority IS NOT NULL 
GROUP BY priority 
ORDER BY count DESC;

-- 4. Task Type
SELECT 'tasks.task_type' as field, task_type as value, COUNT(*) as count 
FROM tasks 
WHERE task_type IS NOT NULL 
GROUP BY task_type 
ORDER BY count DESC;

-- 5. Task Recurrence Pattern
SELECT 'tasks.recurrence_pattern' as field, recurrence_pattern as value, COUNT(*) as count 
FROM tasks 
WHERE recurrence_pattern IS NOT NULL 
GROUP BY recurrence_pattern 
ORDER BY count DESC;

-- 6. Customer Subscription Status
SELECT 'customer_subscriptions.status' as field, status as value, COUNT(*) as count 
FROM customer_subscriptions 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 7. Beta Feedback Status
SELECT 'beta_feedback.feedback_status' as field, feedback_status as value, COUNT(*) as count 
FROM beta_feedback 
WHERE feedback_status IS NOT NULL 
GROUP BY feedback_status 
ORDER BY count DESC;

-- 8. Beta Feedback Priority
SELECT 'beta_feedback.feedback_priority' as field, feedback_priority as value, COUNT(*) as count 
FROM beta_feedback 
WHERE feedback_priority IS NOT NULL 
GROUP BY feedback_priority 
ORDER BY count DESC;

-- 9. Beta Feedback Type
SELECT 'beta_feedback.feedback_type' as field, feedback_type as value, COUNT(*) as count 
FROM beta_feedback 
WHERE feedback_type IS NOT NULL 
GROUP BY feedback_type 
ORDER BY count DESC;

-- 10. Email Logs Status
SELECT 'email_logs.status' as field, status as value, COUNT(*) as count 
FROM email_logs 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 11. Daily Briefs Generation Status
SELECT 'daily_briefs.generation_status' as field, generation_status as value, COUNT(*) as count 
FROM daily_briefs 
WHERE generation_status IS NOT NULL 
GROUP BY generation_status 
ORDER BY count DESC;

-- 12. Brain Dumps Status
SELECT 'brain_dumps.status' as field, status as value, COUNT(*) as count 
FROM brain_dumps 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 13. Beta Events Status
SELECT 'beta_events.event_status' as field, event_status as value, COUNT(*) as count 
FROM beta_events 
WHERE event_status IS NOT NULL 
GROUP BY event_status 
ORDER BY count DESC;

-- 14. Beta Events Type
SELECT 'beta_events.event_type' as field, event_type as value, COUNT(*) as count 
FROM beta_events 
WHERE event_type IS NOT NULL 
GROUP BY event_type 
ORDER BY count DESC;

-- 15. Beta Event Attendance RSVP Status
SELECT 'beta_event_attendance.rsvp_status' as field, rsvp_status as value, COUNT(*) as count 
FROM beta_event_attendance 
WHERE rsvp_status IS NOT NULL 
GROUP BY rsvp_status 
ORDER BY count DESC;

-- 16. Beta Signups Status
SELECT 'beta_signups.signup_status' as field, signup_status as value, COUNT(*) as count 
FROM beta_signups 
WHERE signup_status IS NOT NULL 
GROUP BY signup_status 
ORDER BY count DESC;

-- 17. Phases Status
SELECT 'phases.status' as field, status as value, COUNT(*) as count 
FROM phases 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 18. Phases Generation Status
SELECT 'phases.generation_status' as field, generation_status as value, COUNT(*) as count 
FROM phases 
WHERE generation_status IS NOT NULL 
GROUP BY generation_status 
ORDER BY count DESC;

-- 19. Projects History Status
SELECT 'projects_history.status' as field, status as value, COUNT(*) as count 
FROM projects_history 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 20. Task Calendar Events Sync Status
SELECT 'task_calendar_events.sync_status' as field, sync_status as value, COUNT(*) as count 
FROM task_calendar_events 
WHERE sync_status IS NOT NULL 
GROUP BY sync_status 
ORDER BY count DESC;

-- 21. User Subscription Status
SELECT 'users.subscription_status' as field, subscription_status as value, COUNT(*) as count 
FROM users 
WHERE subscription_status IS NOT NULL 
GROUP BY subscription_status 
ORDER BY count DESC;

-- 22. Calendar Webhooks Event Type
SELECT 'calendar_webhooks.event_type' as field, event_type as value, COUNT(*) as count 
FROM calendar_webhooks 
WHERE event_type IS NOT NULL 
GROUP BY event_type 
ORDER BY count DESC;

-- 23. Email Templates Status
SELECT 'email_templates.status' as field, status as value, COUNT(*) as count 
FROM email_templates 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 24. Emails Status
SELECT 'emails.status' as field, status as value, COUNT(*) as count 
FROM emails 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 25. Invoices Status
SELECT 'invoices.status' as field, status as value, COUNT(*) as count 
FROM invoices 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;

-- 26. Onboarding Event Type
SELECT 'onboarding_events.event_type' as field, event_type as value, COUNT(*) as count 
FROM onboarding_events 
WHERE event_type IS NOT NULL 
GROUP BY event_type 
ORDER BY count DESC;

-- 27. User Projects Priority
SELECT 'user_projects.priority' as field, priority as value, COUNT(*) as count 
FROM user_projects 
WHERE priority IS NOT NULL 
GROUP BY priority 
ORDER BY count DESC;

-- 28. Webhooks Status
SELECT 'webhooks.status' as field, status as value, COUNT(*) as count 
FROM webhooks 
WHERE status IS NOT NULL 
GROUP BY status 
ORDER BY count DESC;