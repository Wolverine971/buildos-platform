-- supabase/migrations/20240120_add_performance_indexes.sql
-- Date: 2024-01-20
-- Purpose: Optimize query performance based on audit findings

-- Index for tasks table
-- Speeds up user task queries filtered by status
CREATE INDEX IF NOT EXISTS idx_tasks_user_status 
ON public.tasks(user_id, status) 
WHERE outdated = false;

-- Index for phase_tasks junction table
-- Speeds up phase task lookups
CREATE INDEX IF NOT EXISTS idx_phase_tasks_lookup 
ON public.phase_tasks(phase_id, task_id);

-- Index for daily_briefs table
-- Speeds up user brief queries by date
CREATE INDEX IF NOT EXISTS idx_daily_briefs_user_date 
ON public.daily_briefs(user_id, brief_date DESC);

-- Index for failed_payments table
-- Speeds up invoice lookups in dunning service
CREATE INDEX IF NOT EXISTS idx_failed_payments_invoice 
ON public.failed_payments(invoice_id);

-- Index for tasks start_date
-- Speeds up calendar and timeline queries
CREATE INDEX IF NOT EXISTS idx_tasks_start_date 
ON public.tasks(start_date) 
WHERE start_date IS NOT NULL AND outdated = false;

-- Composite index for project active tasks
-- Speeds up project dashboard queries
CREATE INDEX IF NOT EXISTS idx_tasks_project_status 
ON public.tasks(project_id, status) 
WHERE outdated = false;

-- Index for brain_dumps by user and status
-- Speeds up draft lookups
CREATE INDEX IF NOT EXISTS idx_brain_dumps_user_status 
ON public.brain_dumps(user_id, status);

-- Index for notes by project
-- Speeds up project note queries
CREATE INDEX IF NOT EXISTS idx_notes_project 
ON public.notes(project_id);

-- Index for customer_subscriptions active lookups
-- Speeds up subscription status checks
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_active 
ON public.customer_subscriptions(user_id, status) 
WHERE status IN ('active', 'trialing');

-- Index for emails pending/scheduled
-- Speeds up email queue processing
CREATE INDEX IF NOT EXISTS idx_emails_pending 
ON public.emails(status, scheduled_at) 
WHERE status IN ('draft', 'scheduled');

-- Index for email_logs by user
-- Speeds up user email history queries
CREATE INDEX IF NOT EXISTS idx_email_logs_user 
ON public.email_logs(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- Analyze tables to update statistics after index creation
ANALYZE public.tasks;
ANALYZE public.phase_tasks;
ANALYZE public.daily_briefs;
ANALYZE public.failed_payments;
ANALYZE public.brain_dumps;
ANALYZE public.notes;
ANALYZE public.customer_subscriptions;
ANALYZE public.emails;
ANALYZE public.email_logs;