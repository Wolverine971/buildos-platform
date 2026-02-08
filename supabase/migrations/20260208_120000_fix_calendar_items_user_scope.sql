-- supabase/migrations/20260208_120000_fix_calendar_items_user_scope.sql
-- Purpose: Ensure dashboard calendar items are scoped to the logged-in actor only.

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
	FROM user_calendar_items u
	JOIN actor_ctx a ON true
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
		AND (
			(
				project_id IS NOT NULL
				AND project_id = ANY(SELECT project_id FROM allowed_projects)
			)
			OR (
				project_id IS NULL
				AND (
					(owner_entity_type = 'actor' AND owner_entity_id = a.actor_id)
					OR owner_entity_type = 'standalone'
				)
			)
		)
	ORDER BY start_at ASC
	LIMIT COALESCE(p_limit, 2000);
$$;

COMMENT ON FUNCTION public.list_calendar_items IS
	'Return unified calendar items (events + task markers) for a time range with filter toggles.';

COMMIT;
