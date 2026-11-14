-- supabase/migrations/20261106120000_email_project_updates.sql
--
-- Tasker 154 (Gmail half): once a night BuildOS reads the owner's connected Gmail inboxes since
-- the last run, and one model call proposes project updates the mail implies (a new task, a
-- task's due date or status). Each proposal waits in the AI Inbox under "From your email" with
-- Apply / Not now; nothing changes until the user applies it. Lean: only users on the
-- EMAIL_PROJECT_UPDATES_USER_IDS allowlist (the owner), no background Gmail for anyone else.
--
-- Writes are server-only (nightly cron + apply route use the service role after checking the
-- signed-in user). Users read their own rows.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- One row per nightly read. The next run starts where the last good one ended.
CREATE TABLE public.email_project_update_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	window_start timestamptz NOT NULL,
	window_end timestamptz NOT NULL,
	status text NOT NULL DEFAULT 'running'
		CHECK (status IN ('running', 'completed', 'failed', 'dry_run')),
	accounts_read integer NOT NULL DEFAULT 0,
	emails_read integer NOT NULL DEFAULT 0,
	suggestions_created integer NOT NULL DEFAULT 0,
	error text,
	created_at timestamptz NOT NULL DEFAULT now(),
	finished_at timestamptz,
	CONSTRAINT email_project_update_runs_window_check CHECK (window_start < window_end)
);

CREATE INDEX email_project_update_runs_user_recent_idx
	ON public.email_project_update_runs (user_id, window_end DESC);

-- One proposed change, tied to the email it came from.
CREATE TABLE public.email_project_updates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	run_id uuid REFERENCES public.email_project_update_runs(id) ON DELETE SET NULL,
	action text NOT NULL CHECK (action IN ('create_task', 'update_task')),
	-- The existing task an update_task changes; also set after Apply for create_task.
	task_id uuid REFERENCES public.onto_tasks(id) ON DELETE SET NULL,
	-- One human line, e.g. 'New task: Send the revised quote to Acme'.
	title text NOT NULL,
	-- Why the mail implies this (model-written, one sentence).
	why text,
	-- The change itself: { title?, description?, due_date?, state_key? }.
	proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
	-- The email: connection_id, account_email, message_id, thread_id, subject, from, received_at.
	email jsonb NOT NULL DEFAULT '{}'::jsonb,
	connection_id uuid REFERENCES public.user_email_connections(id) ON DELETE SET NULL,
	message_id text NOT NULL,
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'applied', 'dismissed', 'expired', 'failed')),
	decided_at timestamptz,
	error text,
	created_at timestamptz NOT NULL DEFAULT now(),
	-- No CHECK tying update_task to task_id: deleting the task sets it null, and the card then
	-- refuses Apply in code instead of blocking the delete.
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_project_updates_user_pending_idx
	ON public.email_project_updates (user_id, created_at DESC)
	WHERE status = 'pending';
CREATE INDEX email_project_updates_user_message_idx
	ON public.email_project_updates (user_id, message_id);
CREATE INDEX email_project_updates_project_idx
	ON public.email_project_updates (project_id);
CREATE INDEX email_project_updates_task_idx
	ON public.email_project_updates (task_id)
	WHERE task_id IS NOT NULL;
CREATE INDEX email_project_updates_run_idx
	ON public.email_project_updates (run_id)
	WHERE run_id IS NOT NULL;
CREATE INDEX email_project_updates_connection_idx
	ON public.email_project_updates (connection_id)
	WHERE connection_id IS NOT NULL;

ALTER TABLE public.email_project_update_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_project_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_project_update_runs_select_own
	ON public.email_project_update_runs
	FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

CREATE POLICY email_project_updates_select_own
	ON public.email_project_updates
	FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.email_project_update_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_project_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.email_project_update_runs TO authenticated;
GRANT SELECT ON TABLE public.email_project_updates TO authenticated;
GRANT ALL ON TABLE public.email_project_update_runs TO service_role;
GRANT ALL ON TABLE public.email_project_updates TO service_role;

COMMENT ON TABLE public.email_project_update_runs IS
	'Nightly reads of the owner''s Gmail inboxes for project updates (tasker 154). The next run starts at the last completed window_end.';
COMMENT ON TABLE public.email_project_updates IS
	'Project updates proposed from email (tasker 154): AI Inbox "From your email" cards; nothing changes until the user applies one.';

-- A combined (folded) project keeps its email proposals; Apply goes through the write gateway,
-- which refuses a project the user can no longer write to.
INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
VALUES (
	'public',
	'email_project_updates',
	'project_id',
	'leave_behind',
	'Proposals from email (AI Inbox cards); Apply re-checks project write access through the gateway.'
);
