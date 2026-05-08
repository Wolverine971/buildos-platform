-- supabase/migrations/20260508000000_calendar_items_overlap_ranges.sql
-- Purpose: Return calendar items that overlap the requested range, not only items that start inside it.

BEGIN;

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
	WITH actor_ctx AS (
		SELECT current_actor_id() AS actor_id
	),
	allowed_projects AS (
		SELECT p.id AS project_id
		FROM onto_projects p
		JOIN actor_ctx a ON a.actor_id IS NOT NULL
		WHERE p.deleted_at IS NULL
			AND p.created_by = a.actor_id
		UNION
		SELECT m.project_id
		FROM onto_project_members m
		JOIN actor_ctx a ON a.actor_id IS NOT NULL
		WHERE m.actor_id = a.actor_id
			AND m.removed_at IS NULL
	)
	SELECT
		u.calendar_item_id,
		u.item_type,
		u.item_kind,
		u.source_table,
		u.title,
		u.start_at,
		u.end_at,
		u.all_day,
		u.timezone,
		u.project_id,
		u.owner_entity_type,
		u.owner_entity_id,
		u.task_id,
		u.event_id,
		u.state_key,
		u.type_key,
		u.props,
		u.created_at,
		u.updated_at
	FROM user_calendar_items u
	JOIN actor_ctx a ON true
	WHERE u.start_at < p_end
		AND GREATEST(
			COALESCE(u.end_at, u.start_at),
			u.start_at + interval '1 millisecond'
		) > p_start
		AND (
			(u.item_type = 'event' AND p_include_events)
			OR (
				u.item_type = 'task'
				AND (
					(u.item_kind = 'range' AND p_include_task_range)
					OR (u.item_kind = 'start' AND p_include_task_start)
					OR (u.item_kind = 'due' AND p_include_task_due)
				)
			)
		)
		AND (p_project_ids IS NULL OR u.project_id = ANY(p_project_ids))
		AND (
			(
				u.project_id IS NOT NULL
				AND u.project_id = ANY(SELECT project_id FROM allowed_projects)
			)
			OR (
				u.project_id IS NULL
				AND (
					(u.owner_entity_type = 'actor' AND u.owner_entity_id = a.actor_id)
					OR u.owner_entity_type = 'standalone'
				)
			)
		)
	ORDER BY u.start_at ASC
	LIMIT COALESCE(p_limit, 2000);
$$;

COMMENT ON FUNCTION public.list_calendar_items IS
	'Return unified calendar items (events + task markers) that overlap a time range with filter toggles.';

COMMIT;
