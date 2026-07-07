-- supabase/migrations/20260707030000_project_full_v2_initial_payload.sql
-- Add a lean project-detail payload for the v2 /projects/[id] page.
--
-- The classic get_project_full() contract still serves the old page. This RPC
-- intentionally skips unused v2 hydration data: requirements, images, sources,
-- metrics, public-page counts, and context document content.

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
		'tasks', COALESCE((
			SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at)
			FROM (
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
					t.updated_at
				FROM public.onto_tasks t
				WHERE t.project_id = p_project_id
					AND t.deleted_at IS NULL
			) t
		), '[]'::jsonb),
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
	INTO v_result;

	RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_full_v2_initial(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_full_v2_initial(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_project_full_v2_initial(uuid, uuid) TO anon;
