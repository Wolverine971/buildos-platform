-- supabase/migrations/20261104210000_today_waiting_items.sql
-- Today page: "Waiting on you" / "You're waiting on".
--
-- today_waiting_items: who owes whom what. The morning brief job reads a person's open and
-- blocked tasks and project next steps with a model and saves one row per open ask. The person
-- can mark a row handled or dismiss it from /today. Only the worker (service role) inserts.
--
-- today_kept_suggestions: suggestions the brief keeps repeating that the person chose to keep.
-- /today stops listing a kept task under "suggested every morning" until kept_until.

CREATE TABLE public.today_waiting_items (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	direction text NOT NULL CHECK (direction IN ('on_you', 'on_them')),
	who text NOT NULL CHECK (char_length(who) BETWEEN 1 AND 80),
	who_kind text NOT NULL DEFAULT 'person' CHECK (who_kind IN ('person', 'agent', 'organization')),
	what text NOT NULL CHECK (char_length(what) BETWEEN 1 AND 240),
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	task_id uuid REFERENCES public.onto_tasks(id) ON DELETE SET NULL,
	since date,
	-- Stable key the extractor reuses so a re-run updates a row instead of adding a copy.
	item_key text NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 160),
	status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
	resolved_at timestamptz,
	last_seen_at timestamptz NOT NULL DEFAULT now(),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT today_waiting_items_user_key UNIQUE (user_id, item_key)
);

CREATE INDEX today_waiting_items_user_status_idx
	ON public.today_waiting_items (user_id, status, last_seen_at DESC);
CREATE INDEX today_waiting_items_project_idx ON public.today_waiting_items (project_id);
CREATE INDEX today_waiting_items_task_idx ON public.today_waiting_items (task_id);

ALTER TABLE public.today_waiting_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY today_waiting_items_select_own
	ON public.today_waiting_items FOR SELECT TO authenticated
	USING (user_id = auth.uid());

CREATE POLICY today_waiting_items_update_own
	ON public.today_waiting_items FOR UPDATE TO authenticated
	USING (user_id = auth.uid())
	WITH CHECK (user_id = auth.uid());

-- Signed-in people may only change a row's status; everything else is the worker's.
GRANT SELECT ON TABLE public.today_waiting_items TO authenticated;
GRANT UPDATE (status, resolved_at, updated_at) ON TABLE public.today_waiting_items TO authenticated;
GRANT ALL ON TABLE public.today_waiting_items TO service_role;

COMMENT ON TABLE public.today_waiting_items IS
	'Today page asks: who is waiting on the person (on_you) and who the person is waiting on (on_them). Written by the morning brief worker; the person can resolve or dismiss rows.';

CREATE TABLE public.today_kept_suggestions (
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	task_id uuid NOT NULL REFERENCES public.onto_tasks(id) ON DELETE CASCADE,
	kept_until date NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, task_id)
);

CREATE INDEX today_kept_suggestions_task_idx ON public.today_kept_suggestions (task_id);

ALTER TABLE public.today_kept_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY today_kept_suggestions_own
	ON public.today_kept_suggestions FOR ALL TO authenticated
	USING (user_id = auth.uid())
	WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.today_kept_suggestions TO authenticated;
GRANT ALL ON TABLE public.today_kept_suggestions TO service_role;

COMMENT ON TABLE public.today_kept_suggestions IS
	'Tasks the person chose to keep after the brief suggested them day after day; /today hides them from that list until kept_until.';

DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'today_waiting_items', 'project_id', 'leave_behind',
				'Asks are re-read every morning; the next pass recreates any still-open ask against the destination project.')
		ON CONFLICT DO NOTHING;
	END IF;
END
$fold$;
