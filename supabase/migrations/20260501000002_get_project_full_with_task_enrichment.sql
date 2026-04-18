-- supabase/migrations/20260501000002_get_project_full_with_task_enrichment.sql
-- Bake task assignees and last-changed-by actor maps directly into
-- `get_project_full` so the project page hot path no longer needs two extra
-- round-trips (`fetchTaskAssigneesMap`, `fetchTaskLastChangedByActorMap`).
--
-- The RPC now returns two additional fields:
--   - `task_assignees` :: jsonb object keyed by task_id; value is an array of
--     `{ actor_id, user_id, name, email, assigned_at }` rows ordered by
--     assignment time.
--   - `task_last_changed_by` :: jsonb object keyed by task_id; value is the
--     actor_id of the most recent created/updated log entry for that task,
--     resolved through `onto_actors.user_id` when only the legacy `changed_by`
--     user_id is available.
--
-- Behavior is otherwise identical to migration 20260430000007.

CREATE OR REPLACE FUNCTION get_project_full(
	p_project_id uuid,
	p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
	v_project jsonb;
	v_result jsonb;
BEGIN
	IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
		RETURN NULL;
	END IF;

	SELECT to_jsonb(p.*)
	INTO v_project
	FROM onto_projects p
	WHERE p.id = p_project_id
		AND p.deleted_at IS NULL;

	IF v_project IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT jsonb_build_object(
		'project', v_project,
		'goals', COALESCE((
			SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created_at)
			FROM onto_goals g
			WHERE g.project_id = p_project_id
				AND g.deleted_at IS NULL
		), '[]'::jsonb),
		'requirements', COALESCE((
			SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
			FROM onto_requirements r
			WHERE r.project_id = p_project_id
				AND r.deleted_at IS NULL
		), '[]'::jsonb),
		'plans', COALESCE((
			SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created_at)
			FROM onto_plans pl
			WHERE pl.project_id = p_project_id
				AND pl.deleted_at IS NULL
		), '[]'::jsonb),
		'tasks', COALESCE((
			SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.created_at)
			FROM onto_tasks t
			WHERE t.project_id = p_project_id
				AND t.deleted_at IS NULL
		), '[]'::jsonb),
		'documents', COALESCE((
			SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created_at)
			FROM onto_documents d
			WHERE d.project_id = p_project_id
				AND d.deleted_at IS NULL
		), '[]'::jsonb),
		'images', COALESCE((
			SELECT jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at DESC)
			FROM onto_assets a
			WHERE a.project_id = p_project_id
				AND a.deleted_at IS NULL
		), '[]'::jsonb),
		'sources', COALESCE((
			SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.created_at)
			FROM onto_sources s
			WHERE s.project_id = p_project_id
		), '[]'::jsonb),
		'milestones', COALESCE((
			SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.due_at)
			FROM onto_milestones m
			WHERE m.project_id = p_project_id
				AND m.deleted_at IS NULL
		), '[]'::jsonb),
		'risks', COALESCE((
			SELECT jsonb_agg(to_jsonb(rk.*) ORDER BY rk.created_at)
			FROM onto_risks rk
			WHERE rk.project_id = p_project_id
				AND rk.deleted_at IS NULL
		), '[]'::jsonb),
		'metrics', COALESCE((
			SELECT jsonb_agg(to_jsonb(mt.*) ORDER BY mt.created_at)
			FROM onto_metrics mt
			WHERE mt.project_id = p_project_id
		), '[]'::jsonb),
		'context_document', (
			SELECT to_jsonb(d.*)
			FROM onto_edges e
			JOIN onto_documents d ON d.id = e.dst_id
			WHERE e.src_kind = 'project'
				AND e.src_id = p_project_id
				AND e.rel = 'has_context_document'
				AND e.dst_kind = 'document'
				AND d.deleted_at IS NULL
			LIMIT 1
		),
		'goal_milestone_edges', COALESCE((
			SELECT jsonb_agg(jsonb_build_object(
				'src_id', e.src_id,
				'dst_id', e.dst_id,
				'created_at', e.created_at
			))
			FROM onto_edges e
			JOIN onto_goals g
				ON g.id = e.src_id
				AND g.project_id = p_project_id
				AND g.deleted_at IS NULL
			JOIN onto_milestones m
				ON m.id = e.dst_id
				AND m.project_id = p_project_id
				AND m.deleted_at IS NULL
			WHERE e.src_kind = 'goal'
				AND e.dst_kind = 'milestone'
				AND e.rel = 'has_milestone'
		), '[]'::jsonb),
		'task_assignees', COALESCE((
			SELECT jsonb_object_agg(task_id::text, assignees)
			FROM (
				SELECT
					ta.task_id,
					jsonb_agg(
						jsonb_build_object(
							'actor_id', a.id,
							'user_id', a.user_id,
							'name', a.name,
							'email', a.email,
							'assigned_at', ta.created_at
						)
						ORDER BY ta.created_at ASC
					) AS assignees
				FROM onto_task_assignees ta
				JOIN onto_actors a ON a.id = ta.assignee_actor_id
				WHERE ta.project_id = p_project_id
				GROUP BY ta.task_id
			) grouped
		), '{}'::jsonb),
		'task_last_changed_by', COALESCE((
			WITH latest_logs AS (
				SELECT DISTINCT ON (l.entity_id)
					l.entity_id,
					l.changed_by_actor_id,
					l.changed_by
				FROM onto_project_logs l
				WHERE l.project_id = p_project_id
					AND l.entity_type = 'task'
					AND l.action IN ('created', 'updated')
				ORDER BY l.entity_id, l.created_at DESC
			),
			resolved AS (
				SELECT
					ll.entity_id,
					COALESCE(
						ll.changed_by_actor_id,
						(
							SELECT a.id
							FROM onto_actors a
							WHERE ll.changed_by IS NOT NULL
								AND a.user_id = ll.changed_by
							LIMIT 1
						)
					) AS actor_id
				FROM latest_logs ll
			)
			SELECT jsonb_object_agg(entity_id::text, actor_id)
			FROM resolved
			WHERE actor_id IS NOT NULL
		), '{}'::jsonb)
	)
	INTO v_result;

	RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO anon;
