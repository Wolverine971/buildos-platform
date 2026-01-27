-- supabase/migrations/20260127_180000_dashboard_calendar.sql
-- Purpose: Support dashboard calendar (events + task schedule markers) with fast RPC queries.

BEGIN;

-- Store calendar display toggles per user.
ALTER TABLE user_calendar_preferences
	ADD COLUMN IF NOT EXISTS show_events boolean NOT NULL DEFAULT true,
	ADD COLUMN IF NOT EXISTS show_task_scheduled boolean NOT NULL DEFAULT true,
	ADD COLUMN IF NOT EXISTS show_task_start boolean NOT NULL DEFAULT true,
	ADD COLUMN IF NOT EXISTS show_task_due boolean NOT NULL DEFAULT true;

-- Performance indexes for calendar range queries.
CREATE INDEX IF NOT EXISTS idx_onto_events_start_at
	ON onto_events(start_at);

CREATE INDEX IF NOT EXISTS idx_onto_events_project_start_at
	ON onto_events(project_id, start_at)
	WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onto_events_owner
	ON onto_events(owner_entity_type, owner_entity_id);

CREATE INDEX IF NOT EXISTS idx_onto_tasks_start_at
	ON onto_tasks(start_at)
	WHERE start_at IS NOT NULL;

-- Unified calendar items view (events + task-derived markers when no event exists).
CREATE OR REPLACE VIEW user_calendar_items AS
WITH base_events AS (
	SELECT
		e.id::text AS calendar_item_id,
		CASE
			WHEN e.props ? 'task_event_kind' THEN 'task'
			ELSE 'event'
		END AS item_type,
		COALESCE(e.props->>'task_event_kind', 'event') AS item_kind,
		'onto_events'::text AS source_table,
		e.title,
		e.start_at,
		e.end_at,
		e.all_day,
		e.timezone,
		e.project_id,
		e.owner_entity_type,
		e.owner_entity_id,
		CASE
			WHEN e.owner_entity_type = 'task' THEN e.owner_entity_id
			WHEN (e.props->>'task_id') ~* '^[0-9a-f-]{36}$' THEN (e.props->>'task_id')::uuid
			ELSE NULL
		END AS task_id,
		e.id AS event_id,
		e.state_key,
		e.type_key,
		e.props,
		e.created_at,
		e.updated_at
	FROM onto_events e
	WHERE e.deleted_at IS NULL
		AND (
			(e.project_id IS NOT NULL AND current_actor_has_project_access(e.project_id, 'read'))
			OR (e.owner_entity_type = 'actor' AND e.owner_entity_id = current_actor_id())
			OR (e.owner_entity_type = 'standalone' AND e.created_by = current_actor_id())
		)
),
missing_task_events AS (
	SELECT t.*
	FROM onto_tasks t
	WHERE t.deleted_at IS NULL
		AND (t.start_at IS NOT NULL OR t.due_at IS NOT NULL)
		AND current_actor_has_project_access(t.project_id, 'read')
		AND NOT EXISTS (
			SELECT 1
			FROM onto_edges e
			JOIN onto_events ev ON ev.id = e.dst_id
			WHERE e.src_id = t.id
				AND e.src_kind = 'task'
				AND e.dst_kind = 'event'
				AND e.rel = 'has_event'
				AND ev.deleted_at IS NULL
				AND (ev.props ? 'task_event_kind')
		)
)
SELECT * FROM base_events
UNION ALL
SELECT
	t.id::text || ':' || spec.kind AS calendar_item_id,
	'task'::text AS item_type,
	spec.kind AS item_kind,
	'onto_tasks'::text AS source_table,
	spec.title AS title,
	spec.start_at,
	spec.end_at,
	false AS all_day,
	NULL::text AS timezone,
	t.project_id,
	'task'::text AS owner_entity_type,
	t.id AS owner_entity_id,
	t.id AS task_id,
	NULL::uuid AS event_id,
	t.state_key::text,
	t.type_key,
	t.props,
	t.created_at,
	t.updated_at
FROM missing_task_events t
CROSS JOIN LATERAL (
	SELECT
		'range'::text AS kind,
		t.start_at AS start_at,
		t.due_at AS end_at,
		t.title AS title
	WHERE t.start_at IS NOT NULL
		AND t.due_at IS NOT NULL
		AND t.due_at > t.start_at
		AND t.due_at - t.start_at <= interval '10 hours'
	UNION ALL
	SELECT
		'start'::text AS kind,
		t.start_at AS start_at,
		t.start_at + interval '30 minutes' AS end_at,
		'Start: ' || t.title AS title
	WHERE t.start_at IS NOT NULL
		AND (
			t.due_at IS NULL
			OR (t.due_at > t.start_at AND t.due_at - t.start_at > interval '10 hours')
		)
	UNION ALL
	SELECT
		'due'::text AS kind,
		t.due_at - interval '30 minutes' AS start_at,
		t.due_at AS end_at,
		'Due: ' || t.title AS title
	WHERE t.due_at IS NOT NULL
		AND (
			t.start_at IS NULL
			OR (t.due_at > t.start_at AND t.due_at - t.start_at > interval '10 hours')
		)
) AS spec;

COMMENT ON VIEW user_calendar_items IS
	'Unified calendar items for dashboard calendar (events + task-derived markers).';

-- RPC: fetch calendar items in a range with toggle filters.
CREATE OR REPLACE FUNCTION public.list_calendar_items(
	p_start timestamptz,
	p_end timestamptz,
	p_include_events boolean DEFAULT true,
	p_include_task_range boolean DEFAULT true,
	p_include_task_start boolean DEFAULT true,
	p_include_task_due boolean DEFAULT true,
	p_project_ids uuid[] DEFAULT NULL,
	p_limit integer DEFAULT NULL
)
RETURNS TABLE (
	calendar_item_id text,
	item_type text,
	item_kind text,
	source_table text,
	title text,
	start_at timestamptz,
	end_at timestamptz,
	all_day boolean,
	timezone text,
	project_id uuid,
	owner_entity_type text,
	owner_entity_id uuid,
	task_id uuid,
	event_id uuid,
	state_key text,
	type_key text,
	props jsonb,
	created_at timestamptz,
	updated_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
	SELECT
		calendar_item_id,
		item_type,
		item_kind,
		source_table,
		title,
		start_at,
		end_at,
		all_day,
		timezone,
		project_id,
		owner_entity_type,
		owner_entity_id,
		task_id,
		event_id,
		state_key,
		type_key,
		props,
		created_at,
		updated_at
	FROM user_calendar_items
	WHERE start_at >= p_start
		AND start_at < p_end
		AND (
			(item_type = 'event' AND p_include_events)
			OR (
				item_type = 'task'
				AND (
					(item_kind = 'range' AND p_include_task_range)
					OR (item_kind = 'start' AND p_include_task_start)
					OR (item_kind = 'due' AND p_include_task_due)
				)
			)
		)
		AND (p_project_ids IS NULL OR project_id = ANY(p_project_ids))
	ORDER BY start_at ASC
	LIMIT COALESCE(p_limit, 2000);
$$;

COMMENT ON FUNCTION public.list_calendar_items IS
	'Return unified calendar items (events + task markers) for a time range with filter toggles.';

COMMIT;
