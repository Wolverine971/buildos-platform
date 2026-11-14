-- supabase/migrations/20261105160000_calendar_ingest_changes.sql
--
-- Tasker 154: project calendars sync both ways. When someone moves, renames, deletes, or adds
-- an event on a project's Google Calendar, the webhook applies it to the BuildOS event (and
-- the task it schedules) without asking. Each applied change is recorded here with the values
-- before and after, so the AI Inbox can list it under "Done for you" with an exact Undo.
--
-- Writes are server-only (webhook + undo route use the service role). Users read their own rows.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE public.calendar_ingest_changes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	onto_event_id uuid REFERENCES public.onto_events(id) ON DELETE SET NULL,
	task_id uuid REFERENCES public.onto_tasks(id) ON DELETE SET NULL,
	calendar_source_id uuid,
	provider_calendar_id text NOT NULL,
	external_event_id text NOT NULL,
	change_kind text NOT NULL CHECK (change_kind IN ('updated', 'cancelled', 'added')),
	-- For 'updated': which of title / time / location changed.
	fields text[] NOT NULL DEFAULT '{}',
	-- live = webhook, sweep = periodic catch-up, backfill = first watch of a project calendar.
	origin text NOT NULL DEFAULT 'live' CHECK (origin IN ('live', 'sweep', 'backfill')),
	-- One human line, e.g. 'Moved "Client call" to Thu, Nov 6, 3:00 PM'.
	title text NOT NULL,
	before jsonb NOT NULL DEFAULT '{}'::jsonb,
	after jsonb NOT NULL DEFAULT '{}'::jsonb,
	status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'undone')),
	applied_at timestamptz NOT NULL DEFAULT now(),
	-- onto_events.updated_at right after the change landed; Undo refuses if the event moved on.
	applied_event_updated_at timestamptz,
	undone_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT calendar_ingest_changes_undone_at_check
		CHECK ((status = 'undone') = (undone_at IS NOT NULL))
);

CREATE INDEX calendar_ingest_changes_user_recent_idx
	ON public.calendar_ingest_changes (user_id, applied_at DESC);
CREATE INDEX calendar_ingest_changes_event_idx
	ON public.calendar_ingest_changes (onto_event_id)
	WHERE onto_event_id IS NOT NULL;
CREATE INDEX calendar_ingest_changes_project_idx
	ON public.calendar_ingest_changes (project_id)
	WHERE project_id IS NOT NULL;
CREATE INDEX calendar_ingest_changes_task_idx
	ON public.calendar_ingest_changes (task_id)
	WHERE task_id IS NOT NULL;

ALTER TABLE public.calendar_ingest_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_ingest_changes_select_own
	ON public.calendar_ingest_changes
	FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.calendar_ingest_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.calendar_ingest_changes TO authenticated;
GRANT ALL ON TABLE public.calendar_ingest_changes TO service_role;

COMMENT ON TABLE public.calendar_ingest_changes IS
	'Changes made in a project''s Google Calendar that BuildOS applied without asking (tasker 154). Undo restores the before values on both sides.';

-- First time BuildOS watched a project calendar and copied its upcoming events in. Null means
-- not yet: the hourly watch job turns the calendar's sync on once, then respects the user's
-- settings.
ALTER TABLE public.project_calendars
	ADD COLUMN IF NOT EXISTS inbound_backfilled_at timestamptz;

-- A combined (folded) project keeps its own change history; Undo still targets the event row.
INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
VALUES (
	'public',
	'calendar_ingest_changes',
	'project_id',
	'leave_behind',
	'Calendar change history (Done for you with Undo); Undo acts on the event row, not the project.'
);
