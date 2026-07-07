-- supabase/migrations/20260707010000_dashboard_responsiveness_indexes.sql
-- Targeted support for logged-in dashboard responsiveness work.

-- /api/inbox/count now reads exact totals plus a lightweight breakdown from
-- inbox_items. These partial indexes support the dashboard's common pending
-- account/project count paths without scanning broad status ranges.
CREATE INDEX IF NOT EXISTS idx_inbox_items_account_status_created
	ON public.inbox_items(status, created_at DESC)
	WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_items_status_project_created
	ON public.inbox_items(status, project_id, created_at DESC)
	WHERE project_id IS NOT NULL;

-- Dashboard analytics and overdue triage both care about open tasks with due
-- dates. Existing due-date indexes are broader; this partial index keeps the
-- dashboard overdue count path focused on reviewable task states.
CREATE INDEX IF NOT EXISTS idx_onto_tasks_project_open_due
	ON public.onto_tasks(project_id, due_at)
	WHERE
		deleted_at IS NULL
		AND due_at IS NOT NULL
		AND state_key IN ('todo', 'in_progress', 'blocked');

-- The dashboard analytics RPC orders recent chat sessions by the effective
-- activity timestamp, matching COALESCE(last_message_at, updated_at, created_at).
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_effective_activity_active
	ON public.chat_sessions(user_id, (COALESCE(last_message_at, updated_at, created_at)) DESC)
	WHERE status <> 'archived' AND COALESCE(message_count, 0) >= 1;
