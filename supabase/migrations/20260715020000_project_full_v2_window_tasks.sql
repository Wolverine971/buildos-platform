-- supabase/migrations/20260715020000_project_full_v2_window_tasks.sql
-- Bound task work inside the v2 project-detail RPC.
--
-- The previous v2 RPC returned every active task plus assignment and activity
-- maps for every task. The web route trimmed that payload after the database
-- had already done the expensive aggregation. This replacement returns:
--   - at most 20 tasks per board bucket;
--   - exact per-bucket totals at one stable statement timestamp;
--   - an independent six-task Pulse projection; and
--   - assignee/activity maps only for the selected board rows.

CREATE INDEX IF NOT EXISTS idx_onto_project_logs_task_entity_recent
	ON public.onto_project_logs(project_id, entity_id, created_at DESC)
	WHERE entity_type = 'task' AND action IN ('created', 'updated');

CREATE OR REPLACE FUNCTION public.get_project_full_v2_initial(
	p_project_id uuid,
	p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id uuid;
	v_actor_id uuid;
	v_project jsonb;
	v_result jsonb;
	v_task_payload jsonb;
	v_task_as_of timestamptz := statement_timestamp();
	v_task_limit integer := 20;
BEGIN
	v_user_id := auth.uid();

	IF auth.role() = 'service_role' THEN
		v_actor_id := p_actor_id;
		IF NOT public.actor_has_project_member_access(p_actor_id, p_project_id, 'read') THEN
			RETURN NULL;
		END IF;
	ELSIF v_user_id IS NOT NULL THEN
		v_actor_id := public.ensure_actor_for_user(v_user_id);

		IF NOT (
			public.is_admin()
			OR public.actor_has_project_member_access(v_actor_id, p_project_id, 'read')
		) THEN
			RETURN NULL;
		END IF;
	ELSE
		RETURN NULL;
	END IF;

	SELECT to_jsonb(p)
	INTO v_project
	FROM (
		SELECT
			p.archived_at,
			p.created_at,
			p.created_by,
			p.deleted_at,
			p.description,
			p.doc_structure,
			p.end_at,
			p.facet_context,
			p.facet_scale,
			p.facet_stage,
			p.icon_concept,
			p.icon_generated_at,
			p.icon_generation_prompt,
			p.icon_generation_source,
			p.icon_svg,
			p.id,
			p.is_public,
			p.name,
			p.next_step_long,
			p.next_step_short,
			p.next_step_source,
			p.next_step_updated_at,
			p.org_id,
			p.props,
			p.start_at,
			p.state_key,
			p.type_key,
			p.updated_at
		FROM public.onto_projects p
		WHERE p.id = p_project_id
			AND p.deleted_at IS NULL
	) p;

	IF v_project IS NULL THEN
		RETURN NULL;
	END IF;

	WITH classified_tasks AS MATERIALIZED (
		SELECT
			t.archived_at,
			t.completed_at,
			t.created_at,
			t.created_by,
			t.deleted_at,
			t.description,
			t.due_at,
			t.facet_scale,
			t.id,
			t.priority,
			t.project_id,
			t.props,
			t.start_at,
			t.state_key,
			t.title,
			t.type_key,
			t.updated_at,
			CASE
				WHEN t.state_key = 'done' THEN 'done'
				WHEN t.due_at IS NOT NULL AND t.due_at < v_task_as_of THEN 'overdue'
				WHEN t.state_key = 'todo' AND (
					t.due_at >= v_task_as_of
					OR (t.due_at IS NULL AND t.start_at >= v_task_as_of)
				) THEN 'scheduled'
				WHEN t.state_key = 'in_progress' THEN 'in_progress'
				WHEN t.state_key = 'blocked' THEN 'blocked'
				ELSE 'backlog'
			END AS task_bucket
		FROM public.onto_tasks t
		WHERE t.project_id = p_project_id
			AND t.deleted_at IS NULL
	),
	ranked_tasks AS MATERIALIZED (
		SELECT
			ct.*,
			row_number() OVER (
				PARTITION BY ct.task_bucket
				ORDER BY
					COALESCE(ct.priority, 5) ASC,
					CASE WHEN ct.task_bucket = 'done' THEN ct.completed_at END DESC NULLS LAST,
					CASE WHEN ct.task_bucket <> 'done' THEN ct.due_at END ASC NULLS LAST,
					CASE WHEN ct.task_bucket <> 'done' THEN ct.start_at END ASC NULLS LAST,
					ct.updated_at DESC,
					ct.id ASC
			) AS bucket_rank
		FROM classified_tasks ct
	),
	selected_tasks AS MATERIALIZED (
		SELECT *
		FROM ranked_tasks
		WHERE bucket_rank <= v_task_limit
	),
	bucket_counts AS (
		SELECT
			count(*) FILTER (WHERE task_bucket = 'backlog') AS backlog_total,
			count(*) FILTER (WHERE task_bucket = 'in_progress') AS in_progress_total,
			count(*) FILTER (WHERE task_bucket = 'scheduled') AS scheduled_total,
			count(*) FILTER (WHERE task_bucket = 'overdue') AS overdue_total,
			count(*) FILTER (WHERE task_bucket = 'blocked') AS blocked_total,
			count(*) FILTER (WHERE task_bucket = 'done') AS done_total,
			count(*) AS all_total
		FROM classified_tasks
	),
	pulse_tasks AS MATERIALIZED (
		SELECT
			ct.*,
			CASE
				WHEN COALESCE(ct.due_at, ct.start_at) < v_task_as_of THEN 0
				ELSE 1
			END AS pulse_group,
			COALESCE(ct.due_at, ct.start_at) AS pulse_at
		FROM classified_tasks ct
		WHERE ct.state_key <> 'done'
			AND COALESCE(ct.due_at, ct.start_at) IS NOT NULL
		ORDER BY
			pulse_group ASC,
			pulse_at ASC,
			ct.id ASC
		LIMIT 6
	)
	SELECT jsonb_build_object(
		'tasks', COALESCE((
			SELECT jsonb_agg(
				to_jsonb(st) - 'task_bucket' - 'bucket_rank'
				ORDER BY
					CASE st.task_bucket
						WHEN 'backlog' THEN 1
						WHEN 'in_progress' THEN 2
						WHEN 'scheduled' THEN 3
						WHEN 'overdue' THEN 4
						WHEN 'blocked' THEN 5
						WHEN 'done' THEN 6
						ELSE 7
					END,
					st.bucket_rank
			)
			FROM selected_tasks st
		), '[]'::jsonb),
		'tasks_coverage', (
			SELECT jsonb_build_object(
				'scope', 'initial-board',
				'as_of', v_task_as_of,
				'complete',
					bc.backlog_total <= v_task_limit
					AND bc.in_progress_total <= v_task_limit
					AND bc.scheduled_total <= v_task_limit
					AND bc.overdue_total <= v_task_limit
					AND bc.blocked_total <= v_task_limit
					AND bc.done_total <= v_task_limit,
				'returned',
					LEAST(bc.backlog_total, v_task_limit)
					+ LEAST(bc.in_progress_total, v_task_limit)
					+ LEAST(bc.scheduled_total, v_task_limit)
					+ LEAST(bc.overdue_total, v_task_limit)
					+ LEAST(bc.blocked_total, v_task_limit)
					+ LEAST(bc.done_total, v_task_limit),
				'total', bc.all_total,
				'limit_per_bucket', v_task_limit,
				'buckets', jsonb_build_object(
					'backlog', jsonb_build_object(
						'returned', LEAST(bc.backlog_total, v_task_limit),
						'total', bc.backlog_total,
						'complete', bc.backlog_total <= v_task_limit
					),
					'in_progress', jsonb_build_object(
						'returned', LEAST(bc.in_progress_total, v_task_limit),
						'total', bc.in_progress_total,
						'complete', bc.in_progress_total <= v_task_limit
					),
					'scheduled', jsonb_build_object(
						'returned', LEAST(bc.scheduled_total, v_task_limit),
						'total', bc.scheduled_total,
						'complete', bc.scheduled_total <= v_task_limit
					),
					'overdue', jsonb_build_object(
						'returned', LEAST(bc.overdue_total, v_task_limit),
						'total', bc.overdue_total,
						'complete', bc.overdue_total <= v_task_limit
					),
					'blocked', jsonb_build_object(
						'returned', LEAST(bc.blocked_total, v_task_limit),
						'total', bc.blocked_total,
						'complete', bc.blocked_total <= v_task_limit
					),
					'done', jsonb_build_object(
						'returned', LEAST(bc.done_total, v_task_limit),
						'total', bc.done_total,
						'complete', bc.done_total <= v_task_limit
					)
				)
			)
			FROM bucket_counts bc
		),
		'pulse_tasks', COALESCE((
			SELECT jsonb_agg(
				to_jsonb(pt) - 'task_bucket' - 'pulse_group' - 'pulse_at'
				ORDER BY pt.pulse_group, pt.pulse_at, pt.id
			)
			FROM pulse_tasks pt
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
				FROM public.onto_task_assignees ta
				JOIN public.onto_actors a ON a.id = ta.assignee_actor_id
				WHERE ta.project_id = p_project_id
					AND ta.task_id IN (SELECT id FROM selected_tasks)
				GROUP BY ta.task_id
			) grouped
		), '{}'::jsonb),
		'task_last_changed_by', COALESCE((
			WITH latest_logs AS (
				SELECT DISTINCT ON (l.entity_id)
					l.entity_id,
					l.changed_by_actor_id,
					l.changed_by
				FROM public.onto_project_logs l
				WHERE l.project_id = p_project_id
					AND l.entity_type = 'task'
					AND l.action IN ('created', 'updated')
					AND l.entity_id IN (SELECT id FROM selected_tasks)
				ORDER BY l.entity_id, l.created_at DESC
			),
			resolved AS (
				SELECT
					ll.entity_id,
					COALESCE(
						ll.changed_by_actor_id,
						(
							SELECT a.id
							FROM public.onto_actors a
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
	INTO v_task_payload;

	SELECT jsonb_build_object(
		'project', v_project,
		'current_actor_id', v_actor_id,
		'goals', COALESCE((
			SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at)
			FROM (
				SELECT
					g.archived_at,
					g.completed_at,
					g.created_at,
					g.created_by,
					g.deleted_at,
					g.description,
					g.goal,
					g.id,
					g.name,
					g.project_id,
					g.props,
					g.state_key,
					g.target_date,
					g.type_key,
					g.updated_at
				FROM public.onto_goals g
				WHERE g.project_id = p_project_id
					AND g.deleted_at IS NULL
			) g
		), '[]'::jsonb),
		'plans', COALESCE((
			SELECT jsonb_agg(to_jsonb(pl) ORDER BY pl.created_at)
			FROM (
				SELECT
					pl.archived_at,
					pl.created_at,
					pl.created_by,
					pl.deleted_at,
					pl.description,
					pl.facet_context,
					pl.facet_scale,
					pl.facet_stage,
					pl.id,
					pl.name,
					pl.plan,
					pl.project_id,
					pl.props,
					pl.state_key,
					pl.type_key,
					pl.updated_at
				FROM public.onto_plans pl
				WHERE pl.project_id = p_project_id
					AND pl.deleted_at IS NULL
			) pl
		), '[]'::jsonb),
		'tasks', v_task_payload->'tasks',
		'tasks_coverage', v_task_payload->'tasks_coverage',
		'pulse_tasks', v_task_payload->'pulse_tasks',
		'documents', COALESCE((
			SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at)
			FROM (
				SELECT
					d.archived_at,
					d.children,
					d.content IS NOT NULL AND length(btrim(d.content)) > 0 AS has_content,
					d.created_at,
					d.created_by,
					d.deleted_at,
					d.description,
					d.id,
					d.project_id,
					d.props,
					d.state_key,
					d.title,
					d.type_key,
					d.updated_at
				FROM public.onto_documents d
				WHERE d.project_id = p_project_id
					AND d.deleted_at IS NULL
			) d
		), '[]'::jsonb),
		'milestones', COALESCE((
			SELECT jsonb_agg(to_jsonb(m) ORDER BY m.due_at NULLS LAST, m.created_at)
			FROM (
				SELECT
					m.archived_at,
					m.completed_at,
					m.created_at,
					m.created_by,
					m.deleted_at,
					m.description,
					m.due_at,
					m.id,
					m.milestone,
					m.project_id,
					m.props,
					m.state_key,
					m.title,
					m.type_key,
					m.updated_at
				FROM public.onto_milestones m
				WHERE m.project_id = p_project_id
					AND m.deleted_at IS NULL
			) m
		), '[]'::jsonb),
		'risks', COALESCE((
			SELECT jsonb_agg(to_jsonb(rk) ORDER BY rk.created_at)
			FROM (
				SELECT
					rk.archived_at,
					rk.content,
					rk.created_at,
					rk.created_by,
					rk.deleted_at,
					rk.id,
					rk.impact,
					rk.mitigated_at,
					rk.probability,
					rk.project_id,
					rk.props,
					rk.state_key,
					rk.title,
					rk.type_key,
					rk.updated_at
				FROM public.onto_risks rk
				WHERE rk.project_id = p_project_id
					AND rk.deleted_at IS NULL
			) rk
		), '[]'::jsonb),
		'context_document', (
			SELECT to_jsonb(d)
			FROM (
				SELECT
					d.archived_at,
					d.children,
					d.content IS NOT NULL AND length(btrim(d.content)) > 0 AS has_content,
					d.created_at,
					d.created_by,
					d.deleted_at,
					d.description,
					d.id,
					d.project_id,
					d.props,
					d.state_key,
					d.title,
					d.type_key,
					d.updated_at
				FROM public.onto_documents d
				WHERE d.project_id = p_project_id
					AND d.type_key = 'document.context.project'
					AND d.deleted_at IS NULL
				ORDER BY d.updated_at DESC
				LIMIT 1
			) d
		),
		'goal_milestone_edges', COALESCE((
			SELECT jsonb_agg(jsonb_build_object(
				'src_id', e.src_id,
				'dst_id', e.dst_id,
				'created_at', e.created_at
			))
			FROM public.onto_edges e
			JOIN public.onto_goals g
				ON g.id = e.src_id
				AND g.project_id = p_project_id
				AND g.deleted_at IS NULL
			JOIN public.onto_milestones m
				ON m.id = e.dst_id
				AND m.project_id = p_project_id
				AND m.deleted_at IS NULL
			WHERE e.src_kind = 'goal'
				AND e.dst_kind = 'milestone'
				AND e.rel = 'has_milestone'
		), '[]'::jsonb),
		'task_assignees', v_task_payload->'task_assignees',
		'task_last_changed_by', v_task_payload->'task_last_changed_by'
	)
	INTO v_result;

	RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_full_v2_initial(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_full_v2_initial(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_project_full_v2_initial(uuid, uuid) TO anon;
